from aim.sdk.control.interfaces import Command, CommandStatus
from typing import List, Dict
from threading import RLock
import logging 

logger = logging.getLogger(__name__)

class CommandStore:
    def __init__(self):
        self._lock = RLock()
        self.command_history: List[Command] = []
        self.command_dict: Dict[str, Command] = {}
        
    
    def add_command(self, command: Command):
        with self._lock:
            self.command_history.append(command)
            self.command_dict[command.id] = len(self.command_history) - 1

    def update_command_status(self, command_id: str, new_status: CommandStatus, result: dict = None, error_message: str = None):
        with self._lock:
            if command_id in self.command_dict:
                index = self.command_dict[command_id]
                self.command_history[index].status = new_status
            else:
                logger.warning(f"Command with ID {command_id} not found for status update.")
    
    def get_command(self, command_id: str) -> Command:
        with self._lock:
            if command_id in self.command_dict:
                index = self.command_dict[command_id]
                return self.command_history[index]
            else:
                logger.warning(f"Command with ID {command_id} not found.")
                return None