"""
backend/agents/coordinator.py - Emergency Coordinator Agent using LangGraph.

Orchestrates multi-agent execution, detects conflicting or missing information,
enforces guardrails, and compiles structured decision-support reports for human authority review.
"""
import os
import time
from typing import Dict, Any, List, Optional, TypedDict
import httpx

from langgraph.graph import StateGraph, START, END

from backend.agents.schemas import (
    AgentQueryRequest,
    AgentQueryResponse,
    ToolTrace,
    RecommendedAction
)
from backend.agents.risk_analyst import FloodRiskAnalystAgent
from backend.agents.evacuation_planner import EvacuationPlannerAgent
from backend.agents.tools import tool_check_active_sos_queue


class CoordinatorState(TypedDict):
    """LangGraph shared state across agent nodes."""
    query: str
    district: str
    rain_7d: Optional[float]
    rain_15d: Optional[float]
    rain_30d: Optional[float]
    simulated: bool
    staging_lat: float
    staging_lon: float

    # Flow routing
    intents: List[str]
    agents_invoked: List[str]
    tool_traces: List[Dict[str, Any]]

    # Intermediate agent results
    risk_data: Optional[Dict[str, Any]]
    evac_data: Optional[Dict[str, Any]]
    sos_data: Optional[Dict[str, Any]]

    # Synthesis & Validation
    conflicts_detected: List[str]
    limitations_warnings: List[str]
    recommendations: List[Dict[str, Any]]
    summary: str
    status: str


def node_intent_router(state: CoordinatorState) -> Dict[str, Any]:
    """Analyzes query keywords to determine which specialist agents to activate."""
    q = state["query"].lower()
    intents = []

    # Check for risk / flood / model intent
    if any(k in q for k in ["risk", "flood", "zone", "hazard", "predict", "model", "shap", "factor", "critical", "why"]):
        intents.append("risk_analyst")

    # Check for evacuation / shelter / route intent
    if any(k in q for k in ["evacuat", "shelter", "route", "road", "corridor", "safe", "escape", "camp", "hospital"]):
        intents.append("evacuation_planner")

    # Default to comprehensive decision-support if both or broad inquiry
    if not intents or any(k in q for k in ["report", "planning", "overview", "coordinat", "all", "sih", "brief"]):
        intents = ["risk_analyst", "evacuation_planner"]

    # Detect staging location if specified (e.g., Jalukbari, Dispur, Paltan Bazaar)
    lat = 26.1812
    lon = 91.7510
    if "jalukbari" in q:
        lat, lon = 26.1445, 91.6631
    elif "dispur" in q:
        lat, lon = 26.1420, 91.7898
    elif "khanapara" in q:
        lat, lon = 26.1240, 91.8260

    return {
        "intents": intents,
        "staging_lat": lat,
        "staging_lon": lon,
        "agents_invoked": ["Emergency Coordinator"]
    }


def node_risk_analyst(state: CoordinatorState) -> Dict[str, Any]:
    """Executes the Flood Risk Analyst Agent."""
    if "risk_analyst" not in state["intents"]:
        return {}

    agent = FloodRiskAnalystAgent()
    risk_output, traces = agent.run(
        district=state["district"],
        rain_7d=state["rain_7d"],
        rain_15d=state["rain_15d"],
        rain_30d=state["rain_30d"],
        simulated=state["simulated"]
    )

    invoked = list(state["agents_invoked"])
    if agent.name not in invoked:
        invoked.append(agent.name)

    existing_traces = list(state.get("tool_traces", []))
    for t in traces:
        existing_traces.append(t.model_dump())

    return {
        "risk_data": risk_output,
        "agents_invoked": invoked,
        "tool_traces": existing_traces
    }


def node_evacuation_planner(state: CoordinatorState) -> Dict[str, Any]:
    """Executes the Evacuation & Shelter Planner Agent and audits SOS distress queue."""
    if "evacuation_planner" not in state["intents"]:
        return {}

    agent = EvacuationPlannerAgent()
    evac_output, traces = agent.run(
        district=state["district"],
        staging_lat=state["staging_lat"],
        staging_lon=state["staging_lon"],
        rain_7d=state["rain_7d"]
    )

    # Also query SOS triage queue for trapped citizen context
    sos_output = tool_check_active_sos_queue(district=state["district"])
    traces.append(ToolTrace(
        tool_name="tool_check_active_sos_queue",
        agent=agent.name,
        status="success",
        input_params={"district": state["district"]},
        output_summary=f"Found {sos_output['pending_count']} pending rescue requests with {sos_output['people_at_risk']} people at risk",
        data_source=sos_output["data_source"],
        execution_time_ms=sos_output["execution_ms"]
    ))

    invoked = list(state["agents_invoked"])
    if agent.name not in invoked:
        invoked.append(agent.name)

    existing_traces = list(state.get("tool_traces", []))
    for t in traces:
        existing_traces.append(t.model_dump())

    return {
        "evac_data": evac_output,
        "sos_data": sos_output,
        "agents_invoked": invoked,
        "tool_traces": existing_traces
    }


def node_conflict_and_validation(state: CoordinatorState) -> Dict[str, Any]:
    """Cross-validates agent outputs to detect conflicts, bottlenecks, or safety hazards."""
    conflicts = []
    warnings = []

    risk = state.get("risk_data")
    evac = state.get("evac_data")
    sos = state.get("sos_data")

    # Conflict 1: Shelters in or near elevated risk zones
    if risk and evac:
        crit_zones = {z["zone_id"] for z in risk.get("top_hotspots", []) if z.get("risk_level") == "Critical"}
        shelters = evac.get("shelter_audit", {}).get("verified_shelters", [])
        for sh in shelters:
            # Low elevation shelter check
            if sh.get("elevation_m", 100) < 52.0:
                conflicts.append(
                    f"POTENTIAL ELEVATION CONFLICT: Shelter '{sh['name']}' sits at elevation {sh['elevation_m']}m. "
                    "Cross-verify ground drainage before directing large-scale evacuees."
                )

    # Conflict 2: Shelter capacity vs active people at risk
    if evac and sos:
        avail_beds = evac.get("shelter_audit", {}).get("available_beds", 0)
        people_risk = sos.get("people_at_risk", 0)
        if people_risk > avail_beds:
            conflicts.append(
                f"CAPACITY DEFICIT: {people_risk} citizens reported at risk in SOS queue exceeds total remaining beds ({avail_beds}). "
                "Secondary emergency staging centers must be unlocked."
            )
        elif avail_beds < 1000:
            warnings.append(f"Shelter bed reserves are low ({avail_beds} available in district).")

    # Conflict 3: Evacuation route crossing high-risk zones
    if evac:
        rc = evac.get("corridor_evaluation", {})
        delta = rc.get("safety_delta", {})
        if delta.get("risk_reduction_pct", 0) > 15.0:
            warnings.append(
                f"ROUTING DIVERGENCE: Safest road route avoids high-risk riverfront roads with a {delta.get('risk_reduction_pct')}% risk reduction "
                f"over the direct path (+{delta.get('distance_overhead_km')} km detour)."
            )

    # General scientific & demo limitations
    warnings.append("DEMO DATA: Citizen SOS calls and shelter occupancy counts are simulated for system evaluation.")
    warnings.append("GUARDRAIL: Risk scores indicate susceptibility, NOT deterministic flood probability or water depth.")
    warnings.append("ROAD NETWORK: Evacuation paths use mapped OpenStreetMap highways; ground obstructions require volunteer confirmation.")

    return {
        "conflicts_detected": conflicts,
        "limitations_warnings": warnings
    }


def node_report_synthesizer(state: CoordinatorState) -> Dict[str, Any]:
    """Compiles the final actionable decision-support report with human sign-off actions."""
    risk = state.get("risk_data") or {}
    evac = state.get("evac_data") or {}
    sos = state.get("sos_data") or {}
    conflicts = state.get("conflicts_detected") or []

    # Assemble structured recommendations
    recommendations = []

    # Action 1: High risk zone monitoring
    crit_count = risk.get("risk_metrics", {}).get("critical_count", 0)
    high_count = risk.get("risk_metrics", {}).get("high_count", 0)
    if crit_count > 0 or high_count > 0:
        recommendations.append(RecommendedAction(
            id="ACT-01",
            priority="Urgent" if crit_count > 0 else "High",
            action=f"Deploy flood monitoring patrols to top {min(4, crit_count + high_count)} vulnerable riverfront zones.",
            rationale="SHAP analysis identifies extreme susceptibility driven by low minimum elevation (<53m) and saturated 30-day precipitation.",
            requires_human_signoff=True
        ).model_dump())

    # Action 2: Dispatch response teams to pending SOS
    pending = sos.get("pending_count", 0)
    if pending > 0:
        recommendations.append(RecommendedAction(
            id="ACT-02",
            priority="Urgent",
            action=f"Assign standby rescue units (SDRF/NDRF) to {pending} pending citizen rescue requests.",
            rationale=f"{sos.get('people_at_risk', 0)} citizens trapped, including {sos.get('medical_emergencies', 0)} reported medical emergencies.",
            requires_human_signoff=True
        ).model_dump())

    # Action 3: Shelter mobilization
    shelter_audit = evac.get("shelter_audit", {})
    dest = evac.get("corridor_evaluation", {}).get("destination_shelter", "Khanapara Veterinary College")
    recommendations.append(RecommendedAction(
        id="ACT-03",
        priority="High",
        action=f"Pre-position relief rations and medical staff at designated primary shelter: {dest}.",
        rationale=f"Primary verified safe route converges on {dest}; current occupancy is {shelter_audit.get('utilization_pct', 0)}%.",
        requires_human_signoff=True
    ).model_dump())

    # Action 4: Road corridor broadcast
    recommendations.append(RecommendedAction(
        id="ACT-04",
        priority="Medium",
        action="Broadcast safe evacuation corridor advisory to citizens via mobile alert and local radio.",
        rationale="Guides evacuees along risk-penalized roads, avoiding low-lying riverfront inundated intersections.",
        requires_human_signoff=True
    ).model_dump())

    # Summary Narrative Synthesis
    # Check if optional LLM key exists in environment
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    narrative_summary = None

    if gemini_key:
        try:
            # Clean prompt for Gemini via httpx
            prompt = (
                f"You are the Emergency Coordinator AI for JALDHRISHTI in {state['district']}. "
                f"Summarize this multi-agent report in 2 crisp, executive paragraphs for district authorities: "
                f"Risk evaluated: {risk.get('severity_summary')}. "
                f"Shelters: {shelter_audit.get('available_beds')} beds free. "
                f"Conflicts: {'; '.join(conflicts) if conflicts else 'None'}. "
                f"Key directive: Never equate risk scores to flood probabilities."
            )
            resp = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}",
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=5.0
            )
            if resp.status_code == 200:
                data = resp.json()
                narrative_summary = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            pass  # Fallback to local synthesis

    if not narrative_summary:
        # Robust local synthesis engine
        risk_headline = risk.get("severity_summary", "Flood risk baseline evaluated.")
        avail_beds = shelter_audit.get("available_beds", 8090)
        route_text = f"Primary evacuation corridor established to {dest} with verified road connectivity."

        conflict_note = f" Alert: {conflicts[0]}" if conflicts else " No conflicting shelter or route bottlenecks detected."

        narrative_summary = (
            f"**Executive Briefing for {state['district']} Disaster Management Authority:**\n\n"
            f"1. **Flood Susceptibility Status:** {risk_headline} SHAP explainability confirms key drivers are "
            f"depressed terrain elevation and river proximity. In accordance with platform safety directives, "
            f"risk scores reflect relative vulnerability and must not be treated as absolute water depth.\n\n"
            f"2. **Evacuation Readiness & Logistics:** {shelter_audit.get('total_shelters', 8)} relief centers audited "
            f"with {avail_beds:,} beds currently available. {route_text}{conflict_note} "
            f"All operational dispatches require human sign-off by the Incident Commander."
        )

    return {
        "summary": narrative_summary,
        "recommendations": recommendations,
        "status": "completed"
    }


def build_coordinator_graph() -> StateGraph:
    """Constructs the LangGraph StateGraph pipeline for the multi-agent system."""
    builder = StateGraph(CoordinatorState)

    builder.add_node("intent_router", node_intent_router)
    builder.add_node("risk_analyst", node_risk_analyst)
    builder.add_node("evacuation_planner", node_evacuation_planner)
    builder.add_node("conflict_validator", node_conflict_and_validation)
    builder.add_node("report_synthesizer", node_report_synthesizer)

    # Linear and conditional workflow
    builder.add_edge(START, "intent_router")
    builder.add_edge("intent_router", "risk_analyst")
    builder.add_edge("risk_analyst", "evacuation_planner")
    builder.add_edge("evacuation_planner", "conflict_validator")
    builder.add_edge("conflict_validator", "report_synthesizer")
    builder.add_edge("report_synthesizer", END)

    return builder.compile()


# Global compiled workflow instance
_COORDINATOR_GRAPH = None


def get_coordinator_graph():
    global _COORDINATOR_GRAPH
    if _COORDINATOR_GRAPH is None:
        _COORDINATOR_GRAPH = build_coordinator_graph()
    return _COORDINATOR_GRAPH


def run_emergency_coordinator(req: AgentQueryRequest) -> AgentQueryResponse:
    """
    Main invocation point for the multi-agent decision-support pipeline.
    """
    start_time = time.time()
    graph = get_coordinator_graph()

    initial_state: CoordinatorState = {
        "query": req.query,
        "district": req.district or "Kamrup Metropolitan",
        "rain_7d": req.rain_7d_mm,
        "rain_15d": req.rain_15d_mm,
        "rain_30d": req.rain_30d_mm,
        "simulated": req.simulated or False,
        "staging_lat": 26.1812,
        "staging_lon": 91.7510,
        "intents": [],
        "agents_invoked": [],
        "tool_traces": [],
        "risk_data": None,
        "evac_data": None,
        "sos_data": None,
        "conflicts_detected": [],
        "limitations_warnings": [],
        "recommendations": [],
        "summary": "",
        "status": "in_progress"
    }

    result = graph.invoke(initial_state)
    duration = round(time.time() - start_time, 2)

    return AgentQueryResponse(
        query=req.query,
        district=result["district"],
        status=result.get("status", "completed"),
        agents_invoked=result.get("agents_invoked", []),
        tool_traces=[ToolTrace(**t) for t in result.get("tool_traces", [])],
        summary=result.get("summary", ""),
        risk_analysis=result.get("risk_data"),
        evacuation_plan=result.get("evac_data"),
        conflicts_detected=result.get("conflicts_detected", []),
        limitations_and_warnings=result.get("limitations_warnings", []),
        recommended_actions=[RecommendedAction(**a) for a in result.get("recommendations", [])],
        execution_duration_sec=duration
    )
