# This is a sandbox agent for the Codex API with Aim interface

import json
import asyncio
import subprocess
from typing import Any
from aim.web.configs import AIM_UI_DEFAULT_PORT
from aim.sdk.agent.constants import COMMAND_TYPE_CODEX_EXEC, COMMAND_TYPE_IDENTIFY, COMMAND_TYPE_METRICS
from aim.sdk.run import Run
import websockets

WEBSOCKET_ADDRESS = f"ws://localhost:{AIM_UI_DEFAULT_PORT}/api/agent/ws"


class AimResearchAgent:
    def __init__(self, run: Run, repo_path: str):
        self.run = run
        self.repo_path = repo_path
        self.state = "init"
        self._codex_session_id: str | None = None
        self._train_process: asyncio.subprocess.Process | None = None
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._pending_tasks: set[asyncio.Task] = set()

    def codex_exec(self, prompt: str, timeout: int = 120) -> str:
        """Execute a prompt via the Codex CLI, maintaining session across calls.

        On the first call, starts a new session and saves the thread_id.
        Subsequent calls resume the existing session for multi-turn conversation.
        """
        if self._codex_session_id:
            cmd = ["codex", "exec", "resume", self._codex_session_id, "--json", prompt]
        else:
            cmd = ["codex", "exec", "--json", prompt]

        result = subprocess.run(
            cmd,
            cwd=self.repo_path,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        if result.returncode != 0:
            error = result.stderr.strip() or "Unknown error"
            raise RuntimeError(f"codex exec failed ({result.returncode}): {error}")
        # Xuanhe Note: add key-word search here to trigger different handler.
        response_text = ""
        for line in result.stdout.strip().splitlines():
            if not line:
                continue
            try:
                print(f"[codex_exec] {line}")
                data = json.loads(line)
                if data.get("type") == "thread.started" and self._codex_session_id is None:
                    self._codex_session_id = data["thread_id"]
                elif data.get("type") == "item.completed":
                    item = data.get("item", {})
                    if item.get("type") == "agent_message":
                        response_text = item.get("text", "")
            except json.JSONDecodeError:
                continue

        return response_text

    def _handle_training_log(self, data: str):
        try:
            payload: dict = json.loads(data)

            if payload.get("type") == COMMAND_TYPE_METRICS:
                metrics: dict = json.loads(payload.get("metrics"))
                epoch = metrics.pop("epoch", None)
                step = metrics.pop("step", None)
                for name, value in metrics.items():
                    if isinstance(value, (int, float)):
                        self.run.track(value, name=name, step=step, epoch=epoch)
                        print(f"[train] {name}: {value}")
            else:
                print(f"[train] {str(data)}")
        except json.JSONDecodeError:
            print(f"[train] {data}")
        except Exception as e:
            print(f"[train] Error tracking metric: {e}")

    async def _read_loop(self):
        assert self._train_process and self._train_process.stdout
        print("Training monitor started")
        async for raw in self._train_process.stdout:
            line = raw.decode().strip()
            if not line:
                continue
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self._handle_training_log, line)
            except json.JSONDecodeError:
                print(f"[train] {line}")
        print("Training process ended")

    async def _handle_command(self, cmd_id: str, data: dict) -> Any:
        cmd_type = data.get("type", "")

        if cmd_type == COMMAND_TYPE_CODEX_EXEC:
            prompt = data.get("prompt", "")
            if not prompt:
                raise ValueError("codex_exec command requires a non-empty 'prompt' field")
            timeout = data.get("timeout", 120)
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                None, self.codex_exec, prompt, timeout
            )

        raise ValueError(f"Unknown command type: {cmd_type!r}")

    async def _dispatch_command(self, data: dict):
        cmd_id: str = data.get("id", "")

        await self._send_ws({"id": cmd_id, "ack": True, "status": "received"})

        task = asyncio.create_task(self._run_command(cmd_id, data))
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)

    async def _run_command(self, cmd_id: str, data: dict):
        print(f"[run_command] {cmd_id}: {str(data)}")
        try:
            result = await self._handle_command(cmd_id, data)
            await self._send_ws({
                "id": cmd_id,
                "status": "completed",
                "result": result,
            })
        except Exception as e:
            await self._send_ws({
                "id": cmd_id,
                "status": "failed",
                "error": str(e),
            })

    async def _receive_instructions(self):
        print("Command receiver started")
        while True:
            try:
                async with websockets.connect(WEBSOCKET_ADDRESS) as ws:
                    self._ws = ws
                    print(f"[ws] Connected to {WEBSOCKET_ADDRESS}")
                    await ws.send(json.dumps({
                        "type": COMMAND_TYPE_IDENTIFY,
                        "run_hash": self.run.hash,
                    }))
                    async for message in ws:
                        try:
                            data = json.loads(message)
                            await self._dispatch_command(data)
                        except json.JSONDecodeError:
                            print(f"[ws] Invalid JSON: {message}")
            except Exception as e:
                self._ws = None
                print(f"[ws] Connection error: {e}, reconnecting in 2s...")
                await asyncio.sleep(2)

    async def _send_ws(self, data: dict):
        if self._ws:
            await self._ws.send(json.dumps(data))

    async def start(self):
        """Launch the training process and run all tasks concurrently."""
        self.state = "running"
        self._train_process = await asyncio.create_subprocess_exec(
            "python", "train.py",
            cwd=self.repo_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        await asyncio.gather(
            self._read_loop(),
            self._receive_instructions(),
        )
        self.state = "done"
