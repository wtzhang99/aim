import asyncio
import json
import logging
import queue
import threading
import time
import websockets
from websockets.sync.client import connect
from typing import Callable, Dict, List, Optional
from aim.sdk.control.interfaces import Command, CommandStatus


logger = logging.getLogger(__name__)


class ControlClient:
    def __init__(self, run_hash: str, remote_url: str = "localhost:43800"):
        self.run_hash = run_hash
        self.server_url = remote_url
        self.ws_url = f"ws://{remote_url}/api/control/{run_hash}/ws?client_type=training"
        self._command_queue = queue.Queue()

        # WebSocket connection
        self._ws = None
        self._running = True
        self._connected = False

        # Background thread for receiving messages
        self._thread = threading.Thread(target=self._run_listener, daemon=True)
        self._thread.start()
        
        # Wait for initial connection
        timeout = 5.0
        start = time.time()
        while not self._connected and (time.time() - start) < timeout:
            time.sleep(0.1)
        
        if not self._connected:
            logger.warning(f"Failed to connect to control server: {self.ws_url}")



    def close(self) -> None:
        """Close the client connection"""
        self._running = False
        if self._ws:
            try:
                self._ws.close()
            except:
                pass
        self._thread.join(timeout=1.0)

    def poll_commands(self) -> List[Command]:
        """
        Poll for pending commands (non-blocking).
        
        This is called frequently in the training loop, so it must be fast!
        No disk I/O, just reads from in-memory queue.
        
        Returns:
            List of pending commands
        """
        commands = []
        while not self._command_queue.empty():
            try:
                commands.append(self._command_queue.get_nowait())
            except queue.Empty:
                break
        return commands
    
    def _run_listener(self) -> None:
        """Background thread that listens for commands"""
        while self._running:
            try:
                # Connect to WebSocket
                self._ws = connect(self.ws_url, close_timeout=1)
                self._connected = True
                logger.info(f"Connected to control server: {self.ws_url}")
                
                # Listen for messages
                while self._running:
                    try:
                        message = self._ws.recv(timeout=1.0)
                        print("Received message AFTER RECEIVE: ", message)
                        self._handle_message(message)
                    except TimeoutError:
                        continue
                    
            except Exception as e:
                self._connected = False
                logger.warning(f"Control WebSocket disconnected: {e}. Reconnecting...")
                time.sleep(2.0)
    
    def _handle_message(self, message: str) -> None:
        """Handle incoming WebSocket message"""
        try:
            data = json.loads(message)
            message_type = data.get('type')
            
            if message_type == 'command':
                # New command received

                print("Received command 1:", data)
                command = Command.from_dict(data)
                self._command_queue.put(command)
                
                # # Auto-acknowledge
                # self._send_status_update(command.id, command.run_hash, CommandStatus.ACKNOWLEDGED)
        
        except Exception as e:
            logger.error(f"Failed to handle message: {e}")
    
    def _send_status_update(
        self,
        command_id: str,
        run_hash: str,
        status: CommandStatus,
        result: Optional[Dict] = None,
        error_message: Optional[str] = None
    ) -> None:
        """Send command status update to server"""
        if not self._ws:
            return
        
        try:
            message = {
                'type': 'status_update',
                'id': command_id,
                'run_hash': run_hash,
                'status': status.value,
                'result': result,
                'error_message': error_message
            }
            print(f"DEBUG CLIENT: Sending status_update for {command_id}")
            self._ws.send(json.dumps(message))
        except Exception as e:
            logger.error(f"Failed to send status update: {e}")