import logging
import inspect
from aim.sdk.run import Run
from aim.sdk.control.interfaces import CommandStatus

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class AimInteractiveTrainCallback:
    def __init__(self, run: Run, train_file_path: str):
        self._run = run
        self._client = run._control_client
        with open(train_file_path, "r") as f:
            self._train_file_content = f.read()
        
        if self._client is None:
            raise ValueError("Run is not initialized in interactive mode. Please set interactive=True when creating the Run.")

    def on_step_end(self, *args, **kwargs):
        all_commands = self._client.poll_commands()
        for command in all_commands:
            logger.debug(f"ON STEP END Received command: {str(command.to_dict())}")
            self._client._send_status_update(command.id, self._run.hash, CommandStatus.ACKNOWLEDGED)
    
    def intervene_loss(self, loss: float, context: dict) -> float:
        return loss
            
