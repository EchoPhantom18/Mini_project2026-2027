"""
backend/agents/evacuation_planner.py - Evacuation & Shelter Planner Specialist Agent.

Responsibilities:
- Inspects designated relief shelter capacity, availability, and elevation safety.
- Evaluates evacuation corridors comparing risk-penalized safe routes vs shortest paths.
- Flags unverified roads, capacity bottlenecks, and unmonitored links.
- Enforces strict safety guardrails: NEVER invent unverified routes.
"""
from typing import Dict, Any, List, Optional, Tuple
from backend.agents.tools import (
    tool_query_shelters_capacity,
    tool_evaluate_evacuation_corridors
)
from backend.agents.schemas import ToolTrace


class EvacuationPlannerAgent:
    """Specialist agent planning safe shelter allocations and risk-aware evacuation corridors."""

    def __init__(self):
        self.name = "Evacuation & Shelter Planner"
        self.role = "Shelter Capacity Auditor & Risk-Aware Route Corridor Specialist"

    def run(
        self,
        district: str = "Kamrup Metropolitan",
        staging_lat: float = 26.1812,
        staging_lon: float = 91.7510,
        rain_7d: Optional[float] = None
    ) -> Tuple[Dict[str, Any], List[ToolTrace]]:
        traces: List[ToolTrace] = []

        # 1. Audit designated relief shelter capacities
        shelter_data = tool_query_shelters_capacity(district=district)
        traces.append(ToolTrace(
            tool_name="tool_query_shelters_capacity",
            agent=self.name,
            status="success",
            input_params={"district": district},
            output_summary=f"Audited {shelter_data['total_shelters']} shelters: {shelter_data['total_available_beds']} beds free ({shelter_data['overall_occupancy_pct']}% utilized)",
            data_source=shelter_data["data_source"],
            execution_time_ms=shelter_data["execution_ms"]
        ))

        # 2. Evaluate candidate evacuation corridors from staging origin
        corridor_data = tool_evaluate_evacuation_corridors(
            origin_lat=staging_lat,
            origin_lon=staging_lon,
            district=district,
            rain_7d=rain_7d
        )
        route_comp = corridor_data.get("route_comparison")
        route_summary = "Evaluated primary evacuation corridor to " + (route_comp.get("destination_shelter", "shelter") if route_comp else "nearest shelter")
        traces.append(ToolTrace(
            tool_name="tool_evaluate_evacuation_corridors",
            agent=self.name,
            status="success",
            input_params={"origin_lat": staging_lat, "origin_lon": staging_lon, "district": district},
            output_summary=route_summary,
            data_source=corridor_data["data_source"],
            execution_time_ms=corridor_data["execution_ms"]
        ))

        # 3. Assemble findings & verification warnings
        bottlenecks = shelter_data.get("bottlenecks", [])
        total_avail = shelter_data["total_available_beds"]

        planner_output = {
            "agent": self.name,
            "district": district,
            "staging_origin": {"lat": staging_lat, "lon": staging_lon},
            "shelter_audit": {
                "total_shelters": shelter_data["total_shelters"],
                "total_capacity_beds": shelter_data["total_capacity_beds"],
                "occupied_beds": shelter_data["total_occupied_beds"],
                "available_beds": total_avail,
                "utilization_pct": shelter_data["overall_occupancy_pct"],
                "bottlenecks": bottlenecks,
                "verified_shelters": [
                    {
                        "name": s["name"],
                        "available_beds": s["available_beds"],
                        "occupancy_pct": s["occupancy_pct"],
                        "elevation_m": s["elevation_m"],
                        "status": s["status"]
                    }
                    for s in shelter_data.get("shelters", [])[:5]
                ]
            },
            "corridor_evaluation": route_comp,
            "verification_status": {
                "road_network": "Mapped OpenStreetMap road segments within Kamrup Metropolitan.",
                "shelter_data": "Verified relief centers from government district records.",
                "data_label": "DEMO DATA — bed counts and current occupancies are simulated for demonstration."
            },
            "unverified_flags": [
                "Minor rural alleyways and unpaved riverbank tracks are not verified for heavy vehicle access.",
                "Real-time road surface water depths and fallen tree obstructions require field spotters.",
                "Shelter food, clean water, and diesel generator provisions must be verified with DC Office."
            ],
            "strict_routing_guardrail": (
                "ROUTING SAFETY DIRECTIVE: Evacuation corridors are computed strictly along mapped, "
                "topologically verified roads. No paths are extrapolated across unmapped terrain or unverified waterways."
            )
        }

        return planner_output, traces
