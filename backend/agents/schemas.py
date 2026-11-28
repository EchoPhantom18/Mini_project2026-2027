"""
backend/agents/schemas.py - Data contracts for Multi-Agent Decision-Support System.
"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class AgentQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language question or command from the authority operator")
    district: Optional[str] = Field("Kamrup Metropolitan", description="District of interest")
    rain_7d_mm: Optional[float] = Field(None, description="Optional custom 7d rainfall")
    rain_15d_mm: Optional[float] = Field(None, description="Optional custom 15d rainfall")
    rain_30d_mm: Optional[float] = Field(None, description="Optional custom 30d rainfall")
    simulated: Optional[bool] = Field(False, description="Whether this query runs on a simulated scenario")


class ToolTrace(BaseModel):
    tool_name: str
    agent: str
    status: str  # "success" | "warning" | "error"
    input_params: Dict[str, Any]
    output_summary: str
    data_source: str
    execution_time_ms: float


class RecommendedAction(BaseModel):
    id: str
    priority: str  # "Urgent" | "High" | "Medium" | "Informational"
    action: str
    rationale: str
    requires_human_signoff: bool = True


class AgentQueryResponse(BaseModel):
    query: str
    district: str
    status: str  # "completed" | "partial" | "failed"
    agents_invoked: List[str]
    tool_traces: List[ToolTrace]
    summary: str
    risk_analysis: Optional[Dict[str, Any]] = None
    evacuation_plan: Optional[Dict[str, Any]] = None
    conflicts_detected: List[str]
    limitations_and_warnings: List[str]
    recommended_actions: List[RecommendedAction]
    execution_duration_sec: float
