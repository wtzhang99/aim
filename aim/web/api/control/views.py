import os
import time
import uuid
import logging
import asyncio
import httpx
from aim.sdk.control.command_store import CommandStore
from aim.sdk.control.interfaces import Command, CommandStatus
from aim.web.api.utils import APIRouter  # wrapper for fastapi.APIRouter
from aim.web.api.control.pydantic_models import OpenAIProxyRequest
from fastapi import WebSocket, WebSocketDisconnect, HTTPException
from typing import Optional, Dict, List, Set
from collections import defaultdict

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Unique ID for this worker process
WORKER_ID = f"worker-{os.getpid()}"

class ConnectionType:
    TRAINING = "training"  # Training script
    UI = "ui"             # Web UI
    API = "api"           # API client


class ClientConnection:
    """Represents a WebSocket client connection"""
    
    def __init__(
        self,
        websocket: WebSocket,
        client_id: str,
        connection_type: str,
        run_hash: Optional[str] = None
    ):
        self.websocket = websocket
        self.client_id = client_id
        self.connection_type = connection_type
        self.run_hash = run_hash
        self.connected_at = time.time()
        self.last_ping = time.time()


class ControlConnectionManager:
    """
    Manages WebSocket connections for run control.
    
    This is the central hub that:
    1. Tracks all connected clients
    2. Routes commands to training scripts
    3. Broadcasts state updates to UI clients
    
    NOTE: WebSocket connections are process-bound. For multi-worker setups,
    ensure all WebSocket traffic goes to a single worker, or use Redis pub/sub
    to broadcast messages across workers.
    """
    
    def __init__(self, command_store: CommandStore):
        self.command_store = command_store
        self._connections: Dict[str, ClientConnection] = {}
        self._run_connections: Dict[str, Set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self.worker_id = WORKER_ID
    
    async def connect(
        self,
        websocket: WebSocket,
        run_hash: str,
        connection_type: str
    ) -> str:
        """
        Accept a new WebSocket connection.
        
        Returns:
            client_id: Unique identifier for this connection
        """
        await websocket.accept()
        
        client_id = str(uuid.uuid4())
        connection = ClientConnection(
            websocket=websocket,
            client_id=client_id,
            connection_type=connection_type,
            run_hash=run_hash
        )
        
        async with self._lock:
            self._connections[client_id] = connection
            self._run_connections[run_hash].add(client_id)
            all_connections = set(self._run_connections[run_hash])  # Copy while holding lock
        
        print(
            f"[{self.worker_id}] Client connected: {client_id} "
            f"(type={connection_type}, run={run_hash}), "
            f"all connections for run: {all_connections}"
        )

        return client_id
    
    async def disconnect(self, client_id: str) -> None:
        """Disconnect a client"""
        async with self._lock:
            connection = self._connections.pop(client_id, None)
            if connection and connection.run_hash:
                self._run_connections[connection.run_hash].discard(client_id)
        
        if connection:
            print(f"Client disconnected: {client_id}")
    
    async def send_command_to_training(
        self,
        run_hash: str,
        command: Command
    ) -> bool:
        """
        Send command to training script(s) for a run.
        
        Returns:
            True if sent to at least one training client
        """
        # Store command first
        self.command_store.add_command(command)
        
        # Find training clients for this run
        training_clients = await self._get_training_clients(run_hash)
        print(f"DEBUG: Found {len(training_clients)} training clients for run {run_hash}: {training_clients}")
        
        if not training_clients:
            logger.warning(f"No training clients connected for run {run_hash}")
            return False
        
        # Send to all training clients
        message = command.to_dict()
        
        for client_id in training_clients:
            await self._send_to_client(client_id, message)
        
        return True
    


    async def handle_command_status_update(
        self,
        command_id: str,
        status: CommandStatus,
        result: Optional[Dict] = None,
        error_message: Optional[str] = None
    ) -> None:
        """Handle status update from training script"""
        timestamp = time.time()
        
        self.command_store.update_command_status(
            command_id=command_id,
            new_status=status,
            result=result,
            error_message=error_message
        )
        
        # Notify UI clients
        command = self.command_store.get_command(command_id)
        if command:
            await self._broadcast_command_update(command)

    
    async def _get_training_clients(self, run_hash: str) -> List[str]:
        """Get all training clients for a run"""
        async with self._lock:
            client_ids = list(self._run_connections.get(run_hash, set()))
            return [
                cid for cid in client_ids
                if self._connections[cid].connection_type == ConnectionType.TRAINING
            ]
    
    async def _get_ui_clients(self, run_hash: str) -> List[str]:
        """Get all UI clients for a run"""
        async with self._lock:
            client_ids = list(self._run_connections.get(run_hash, set()))
            return [
                cid for cid in client_ids
                if self._connections[cid].connection_type == ConnectionType.UI
            ]
    
    async def _send_to_client(self, client_id: str, message: dict) -> None:
        """Send message to a specific client"""
        async with self._lock:
            connection = self._connections.get(client_id)
        
        if not connection:
            return
        
        try:
            await connection.websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send to client {client_id}: {e}")
            await self.disconnect(client_id)
    
    async def _broadcast_command_update(self, command: Command) -> None:
        """Broadcast command status update to UI clients"""
        ui_clients = await self._get_ui_clients(command.run_hash)
        
        message = {
            'type': 'command_update',
            'data': command.to_dict()
        }
        
        for client_id in ui_clients:
            await self._send_to_client(client_id, message)


connection_manager = ControlConnectionManager(CommandStore())

control_router = APIRouter()


@control_router.post("/openai/chat")
async def proxy_openai_chat(request: OpenAIProxyRequest):
    """
    Proxy endpoint for OpenAI chat completions.
    This avoids CORS issues by routing through the backend.
    The API key is passed from the frontend and not stored on the server.
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {request.api_key}",
                },
                json={
                    "model": request.model,
                    "messages": [msg.dict() for msg in request.messages],
                    "max_tokens": request.max_tokens,
                },
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI API error: {response.text}"
                )

            return response.json()

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="OpenAI API request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to connect to OpenAI: {str(e)}")


async def handle_training_message(ws, data: dict, run_hash: str, client_id: str):
    
    print(f"Handling training message {data}, {ws}, {run_hash}, {client_id}")
    await connection_manager.handle_command_status_update(
        command_id=data.get('id'),
        status=CommandStatus(data.get('status')),
        result=data.get('payload'),
        error_message=data.get('error_message', None)
    )


async def handle_ui_message(data: dict, run_hash: str, client_id: str):
    message_type = data.get('type')
    print(f"DEBUG: UI message received - type={message_type}, id={data.get('id')}, run={run_hash}")
    
    if message_type == 'command':
        await connection_manager.send_command_to_training(run_hash, Command.from_dict(data))


@control_router.websocket("/{run_hash}/ws")
async def control_websocket(
    websocket: WebSocket,
    run_hash: str,
    client_type: str
):
    client_id = await connection_manager.connect(websocket, run_hash, client_type)
    print(f"Client {client_id} connected as {client_type} for run {run_hash}")
    try:
        while True:
            try:
                # Receive message from client
                data = await websocket.receive_json()
            except ValueError as e:
                # Malformed JSON - notify client but don't disconnect
                logger.warning(f"Invalid JSON from client {client_id}: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'error': 'invalid_json',
                    'message': 'Failed to parse JSON message'
                })
                continue

            try:
                if client_type == ConnectionType.TRAINING:
                    # Training client sends status updates
                    print(f"Received message from {client_id}: {data}")
                    await handle_training_message(websocket, data, run_hash, client_id)
                
                elif client_type == ConnectionType.UI:
                    # UI client sends commands
                    logger.debug(f"Received message from {client_id}: {data}")
                    await handle_ui_message(data, run_hash, client_id)
                else:
                    logger.warning(f"Unknown client type {client_type} from {client_id}")
                    await websocket.send_json({
                        'type': 'error',
                        'error': 'unknown_client_type',
                        'message': f'Unknown client type: {client_type}'
                    })
            except (KeyError, TypeError, ValueError) as e:
                # Bad request data - notify client but don't disconnect
                logger.warning(f"Bad request from client {client_id}: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'error': 'bad_request',
                    'message': str(e)
                })
            except Exception as e:
                # Unexpected error during message handling - log but continue
                logger.error(f"Error handling message from {client_id}: {e}", exc_info=True)
                await websocket.send_json({
                    'type': 'error',
                    'error': 'internal_error',
                    'message': 'An internal error occurred while processing your request'
                })
    
    except WebSocketDisconnect:
        logger.debug(f"Client {client_id} disconnected normally")
    except Exception as e:
        # Connection-level errors that require disconnect
        logger.error(f"WebSocket connection error for {client_id}: {e}")
    finally:
        await connection_manager.disconnect(client_id)
