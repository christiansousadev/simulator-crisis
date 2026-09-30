from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["telemetry"])


@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """REAL-TIME WEBSOCKET SUBSCRIPTION FOR TELEMETRY AND ALERTS"""
    engine = websocket.app.state.engine
    player_id = websocket.query_params.get("player_id")
    if player_id and player_id != engine.player_id:
        engine.player_id = player_id
        engine._load_career_progress()
    await engine.connect_client(websocket)
    try:
        while True:
            # receive incoming control messages from client
            await websocket.receive_text()
    except WebSocketDisconnect:
        # deregister cleanly upon client disconnect
        engine.disconnect_client(websocket)
