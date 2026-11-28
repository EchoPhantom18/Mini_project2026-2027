"""
backend/agents/risk_analyst.py - Flood Risk Analyst Specialist Agent.

Responsibilities:
- Evaluates spatial flood susceptibility across grid zones.
- Computes SHAP feature attributions for top vulnerable hotspots.
- Interprets geomorphic and precipitation drivers.
- Enforces scientific guardrails: NEVER equate risk score to flood probability.
"""
from typing import Dict, Any, List, Optional, Tuple
from backend.agents.tools import (
    tool_evaluate_district_flood_risk,
    tool_explain_zone_risk_shap
)
from backend.agents.schemas import ToolTrace


class FloodRiskAnalystAgent:
    """Specialist agent analyzing flood susceptibility, spatial clusters, and SHAP explainability."""

    def __init__(self):
        self.name = "Flood Risk Analyst"
        self.role = "Predictive Flood Susceptibility & SHAP Attribution Specialist"

    def run(
        self,
        district: str = "Kamrup Metropolitan",
        rain_7d: Optional[float] = None,
        rain_15d: Optional[float] = None,
        rain_30d: Optional[float] = None,
        simulated: bool = False
    ) -> Tuple[Dict[str, Any], List[ToolTrace]]:
        traces: List[ToolTrace] = []

        # 1. Evaluate district-wide zone susceptibility
        risk_res = tool_evaluate_district_flood_risk(
            district=district,
            rain_7d=rain_7d,
            rain_15d=rain_15d,
            rain_30d=rain_30d,
            simulated=simulated
        )
        traces.append(ToolTrace(
            tool_name="tool_evaluate_district_flood_risk",
            agent=self.name,
            status="success",
            input_params={"district": district, "rain_7d": rain_7d, "simulated": simulated},
            output_summary=f"Scored {risk_res['total_zones_evaluated']} zones: {risk_res['risk_breakdown']['critical_count']} Critical, {risk_res['risk_breakdown']['high_count']} High",
            data_source=risk_res["data_source"],
            execution_time_ms=risk_res["execution_ms"]
        ))

        # 2. Select top 2 vulnerable zones to run SHAP explanations
        candidate_zones = risk_res.get("top_critical_zones") or risk_res.get("top_high_zones") or []
        shap_reports = []
        for z in candidate_zones[:2]:
            zid = z["zone_id"]
            sh_res = tool_explain_zone_risk_shap(
                zone_id=zid,
                district=district,
                rain_7d=rain_7d,
                rain_15d=rain_15d,
                rain_30d=rain_30d
            )
            shap_reports.append(sh_res)
            traces.append(ToolTrace(
                tool_name="tool_explain_zone_risk_shap",
                agent=self.name,
                status="success",
                input_params={"zone_id": zid, "district": district},
                output_summary=f"SHAP computed for {zid}: Top driver is {sh_res['top_contributing_factors'][0]['feature']} ({sh_res['top_contributing_factors'][0]['observed_value']})",
                data_source=sh_res["data_source"],
                execution_time_ms=sh_res["execution_ms"]
            ))

        # 3. Assemble analyst findings
        crit_count = risk_res["risk_breakdown"]["critical_count"]
        high_count = risk_res["risk_breakdown"]["high_count"]
        total_eval = risk_res["total_zones_evaluated"]

        if crit_count > 0:
            severity = f"Critical risk condition detected across {crit_count} zones ({risk_res['critical_percentage']}% of district)."
        elif high_count > 0:
            severity = f"Elevated vulnerability observed in {high_count} zones; {crit_count} zones in critical tier."
        else:
            severity = "District zones are predominantly in Safe to Moderate susceptibility categories."

        analysis_output = {
            "agent": self.name,
            "district": district,
            "severity_summary": severity,
            "risk_metrics": risk_res["risk_breakdown"],
            "total_zones": total_eval,
            "top_hotspots": candidate_zones[:4],
            "shap_explanations": shap_reports,
            "key_drivers": [
                "Low elevation depressions (< 55m) failing to drain naturally",
                "Proximity to Brahmaputra and Bharalu river channels (< 350m)",
                "Antecedent precipitation accumulation saturation (30-day index)"
            ],
            "scientific_guardrail": (
                "IMPORTANT SCIENTIFIC NOTICE: Risk scores (0-100) indicate empirical multi-factor "
                "susceptibility to flooding based on historical satellite inundation labels. They MUST NOT "
                "be interpreted as physical flood probabilities, precise water depths, or hydraulic flow rates."
            ),
            "data_limitations": [
                "1 km² grid spatial resolution averages localized micro-depressions and street-level culverts.",
                "Real-time hydrodynamic river gauge sensor data is not directly coupled in this model tier.",
                "Urban storm-drain blockages and civic pumping station status are unmonitored."
            ]
        }

        return analysis_output, traces
