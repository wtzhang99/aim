from enum import Enum

class CommandStatus(Enum):
    PENDING = 'pending'
    ACKNOWLEDGED = 'acknowledged'
    COMPLETED = 'completed'
    FAILED = 'failed'

class Command:
    id: str
    run_hash: str
    type: str
    payload: dict
    status: CommandStatus

    def from_dict(data: dict) -> 'Command':
        cmd = Command()
        cmd.id = data['id']
        cmd.type = data['type']
        cmd.run_hash = data["run_hash"]
        cmd.payload = data.get('payload', {})
        cmd.status = CommandStatus(data.get('status', 'pending'))
        return cmd

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'run_hash': self.run_hash,
            'type': self.type,
            'payload': self.payload,
            'status': self.status.value
        }