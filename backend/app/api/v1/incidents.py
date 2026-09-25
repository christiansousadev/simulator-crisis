from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from app.schemas.incident import TriageSubmitRequest

router = APIRouter(tags=["incidents"])


@router.get("/api/incidents")
async def list_incidents(request: Request) -> List[Dict[str, Any]]:
    """LIST ACTIVE INCIDENTS CURRENTLY IN THE CRISIS STREAM"""
    return request.app.state.engine.public_incidents()


@router.post("/api/incidents/{incident_id}/acknowledge")
async def acknowledge_incident(incident_id: str, request: Request) -> Dict[str, Any]:
    """ACKNOWLEDGE AN ACTIVE CRITICAL ALERT"""
    engine = request.app.state.engine
    success = engine.acknowledge_incident(incident_id)
    if not success:
        raise HTTPException(status_code=404, detail="Incident not found or already acknowledged")
    return {"message": "Incident acknowledged", "incident_id": incident_id}


@router.get("/api/incidents/{incident_id}/logs")
async def get_incident_logs(incident_id: str, request: Request) -> Dict[str, Any]:
    """RETRIEVE THE SYNTHETIC LOG STREAM FOR AN INCIDENT, NEVER REVEALING THE ROOT-CAUSE LINE"""
    engine = request.app.state.engine
    incident = next((i for i in engine.incidents if i["id"] == incident_id), None)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"lines": incident["log_lines"]}


@router.post("/api/incidents/{incident_id}/triage")
async def submit_triage(incident_id: str, payload: TriageSubmitRequest, request: Request) -> Dict[str, Any]:
    """SUBMIT A ROOT-CAUSE LOG-LINE GUESS FOR AN INCIDENT"""
    engine = request.app.state.engine
    result = engine.submit_triage(incident_id, payload.line_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Incident not found"))
    return result
