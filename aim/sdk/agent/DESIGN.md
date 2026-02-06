# Aim + Codex Research Agent

## Overview

A research agent that enables iterative ML model improvement through natural language interaction. Users chat with Codex via Aim UI, and Codex modifies training code and runs experiments. The agent owns all communication with Aim, receiving metrics from training via JSONL protocol.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Any UI (Aim UI, Custom, CLI)                      │
│  ┌─────────────────────┐  ┌───────────────────────────────────────┐ │
│  │  Metrics View       │  │  Codex Chat                           │ │
│  │  (loss, accuracy,   │  │  "Try deeper network"                 │ │
│  │   images, figures)  │  │  "Add data augmentation"              │ │
│  └─────────────────────┘  └───────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  Controls: [Start] [Stop] [Restart]                             ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                    │
                          WebSocket (ws://host:port)
                          ◄─── commands ───►
                          ◄─── ack/events ──►
                                    │
┌───────────────────────────────────┴─────────────────────────────────┐
│                    ResearchAgent (standalone server)                 │
│                                                                     │
│   agent.serve(port=8765)  ◄──────────────────────────────► Aim DB  │
│   run = Run()                                                       │
│   run.track(metrics_from_training)                                  │
│                                                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                      stdin/stdout (JSONL)
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
┌────────────────────────────┐  ┌────────────────────────────────────┐
│     Codex Sandbox          │  │       Training Process             │
│                            │  │                                    │
│  - Modify code based on    │  │  print({"type": "metric", ...})   │
│    user prompts            │  │  print({"type": "image", ...})    │
│                            │  │                                    │
└────────────────────────────┘  └────────────────────────────────────┘
                                             │
                                             ▼
                                ┌────────────────────────────┐
                                │    Training Repo           │
                                │                            │
                                │  train.py   (entry point)  │
                                │  prob.py    (problem def)  │
                                │  model.py   (architecture) │
                                │  config.yaml               │
                                └────────────────────────────┘
```

## Communication Protocol: JSONL + File References

All communication from training to agent uses JSON Lines over stdout. For large objects (images, audio, etc.), training saves to disk and sends the file path.

### Message Types

```
# Scalar metrics
{"type": "metric", "name": "loss", "value": 0.234, "step": 100, "epoch": 1}
{"type": "metric", "name": "accuracy", "value": 0.95, "step": 100}

# Objects (saved to disk, path sent)
{"type": "image", "name": "predictions", "path": "/tmp/session/pred_001.png", "step": 100}
{"type": "figure", "name": "confusion_matrix", "path": "/tmp/session/cm.json", "step": 100}
{"type": "audio", "name": "sample", "path": "/tmp/session/audio.wav", "step": 100}
{"type": "distribution", "name": "weights", "path": "/tmp/session/weights.npy", "step": 100}
{"type": "artifact", "name": "checkpoint", "path": "/tmp/session/model.pt"}

# Control & logging
{"type": "log", "level": "info", "message": "Starting epoch 5"}
{"type": "status", "status": "running", "epoch": 5}
{"type": "status", "status": "done"}
```

### Commands (Agent → Training via stdin)

```
{"cmd": "stop"}
{"cmd": "pause"}
{"cmd": "resume"}
{"cmd": "update_lr", "lr": 0.0001}
{"cmd": "update_config", "batch_size": 64}
```

## Training Repo Protocol

Training repositories must follow these conventions:

```
training_repo/
├── train.py          # REQUIRED: Entry point, uses aim_logger
├── prob.py           # REQUIRED: Problem definition
├── model.py          # Model architecture (Codex modifies)
├── config.yaml       # Hyperparameters (Codex modifies)
└── requirements.txt  # Dependencies
```

### prob.py (Problem Definition)

```python
PROBLEM = {
    "name": "mnist_classification",
    "description": "Classify handwritten digits",
    "dataset": "mnist",
    "metric": "accuracy",       # Primary metric to optimize
    "target": 0.99,             # Target performance
}
```

### train.py (Entry Point)

```python
from aim_logger import track, track_image, done, check_command
import torch

# Training loop
for epoch in range(num_epochs):
    for step, (x, y) in enumerate(dataloader):
        # Check for commands from agent
        cmd = check_command()
        if cmd and cmd.get("cmd") == "stop":
            done()
            exit()
        
        # Training step
        loss = train_step(model, x, y)
        
        # Track scalar
        track(loss.item(), "loss", step=global_step, epoch=epoch)
        
        # Track image periodically
        if step % 100 == 0:
            pred = model(x[:4])
            track_image(pred, "predictions", step=global_step)

done()
```

## Implementation

### Training Logger (for training repos)

```python
# aim_logger.py - Lightweight logger for training scripts

import json
import sys
import select
import os
from pathlib import Path

SESSION_DIR = Path(os.environ.get("AIM_SESSION_DIR", "/tmp/aim_session"))
SESSION_DIR.mkdir(parents=True, exist_ok=True)

def _emit(data: dict):
    print(json.dumps(data), flush=True)

def track(value: float, name: str, step: int = None, epoch: int = None):
    """Track scalar metric."""
    _emit({"type": "metric", "name": name, "value": value, "step": step, "epoch": epoch})

def track_image(image, name: str, step: int = None):
    """Track image (saves to disk, emits path)."""
    import numpy as np
    from PIL import Image as PILImage
    
    path = SESSION_DIR / f"{name}_{step}.png"
    
    if hasattr(image, 'numpy'):
        image = image.detach().cpu().numpy()
    if isinstance(image, np.ndarray):
        if image.ndim == 3 and image.shape[0] in [1, 3, 4]:
            image = np.transpose(image, (1, 2, 0))
        if image.max() <= 1.0:
            image = (image * 255).astype(np.uint8)
        image = PILImage.fromarray(image)
    image.save(path)
    
    _emit({"type": "image", "name": name, "path": str(path), "step": step})

def track_figure(figure, name: str, step: int = None):
    """Track matplotlib/plotly figure."""
    path = SESSION_DIR / f"{name}_{step}.png"
    figure.savefig(path)
    _emit({"type": "figure", "name": name, "path": str(path), "step": step})

def track_audio(audio, name: str, step: int = None, sample_rate: int = 22050):
    """Track audio."""
    import scipy.io.wavfile as wav
    path = SESSION_DIR / f"{name}_{step}.wav"
    wav.write(path, sample_rate, audio)
    _emit({"type": "audio", "name": name, "path": str(path), "step": step})

def log(message: str, level: str = "info"):
    """Log message."""
    _emit({"type": "log", "level": level, "message": message})

def done():
    """Signal training complete."""
    _emit({"type": "status", "status": "done"})

def check_command() -> dict:
    """Non-blocking check for command from agent via stdin."""
    if select.select([sys.stdin], [], [], 0)[0]:
        line = sys.stdin.readline()
        if line:
            return json.loads(line)
    return None
```

### Research Agent

```python
# aim/sdk/agent/research_agent.py

import subprocess
import json
import threading
import tempfile
import os
from aim import Run
from aim.sdk.objects import Image, Figure, Audio, Distribution

class ResearchAgent:
    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self.run: Run = None
        self._process = None
        self._thread = None
        self._session_dir = None
        self.metrics = {}  # Real-time metrics access
    
    def start(self, experiment: str = "research") -> str:
        """Start training, capture output via JSONL."""
        self._session_dir = tempfile.mkdtemp(prefix="aim_session_")
        self.run = Run(experiment=experiment)
        
        env = {**os.environ, "AIM_SESSION_DIR": self._session_dir}
        self._process = subprocess.Popen(
            ["python", "train.py"],
            cwd=self.repo_path,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
        )
        
        self._thread = threading.Thread(target=self._read_loop)
        self._thread.start()
        return self.run.hash
    
    def _read_loop(self):
        """Read JSONL from training, track to Aim."""
        for line in self._process.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                self._handle(data)
            except json.JSONDecodeError:
                print(f"[train] {line}")
        self.run.close()
    
    def _handle(self, data: dict):
        """Handle message by type."""
        t = data.get("type")
        
        if t == "metric":
            self.run.track(data["value"], name=data["name"], 
                          step=data.get("step"), epoch=data.get("epoch"))
            self.metrics[data["name"]] = data["value"]
        
        elif t == "image":
            self.run.track(Image(data["path"]), name=data["name"], step=data.get("step"))
        
        elif t == "figure":
            self.run.track(Figure(data["path"]), name=data["name"], step=data.get("step"))
        
        elif t == "audio":
            self.run.track(Audio(data["path"]), name=data["name"], step=data.get("step"))
        
        elif t == "distribution":
            import numpy as np
            self.run.track(Distribution(np.load(data["path"])), 
                          name=data["name"], step=data.get("step"))
        
        elif t == "artifact":
            self.run.log_artifact(data["path"], name=data["name"])
        
        elif t == "log":
            getattr(self.run, f"log_{data.get('level', 'info')}")(data["message"])
    
    def send(self, cmd: str, **params):
        """Send command to training via stdin."""
        self._process.stdin.write(json.dumps({"cmd": cmd, **params}) + "\n")
        self._process.stdin.flush()
    
    def stop(self):
        self.send("stop")
        self.wait()
    
    def update_lr(self, lr: float):
        self.send("update_lr", lr=lr)
    
    def wait(self):
        if self._thread:
            self._thread.join()
    
    def chat(self, message: str) -> dict:
        """Chat with Codex, modify code, run training."""
        # 1. Call Codex to modify code based on message
        response = self._call_codex(message)
        
        # 2. Start new training run
        run_hash = self.start()
        
        # 3. Wait for completion
        self.wait()
        
        return {
            "response": response,
            "run_hash": run_hash,
            "metrics": self.metrics,
        }
    
    def _call_codex(self, message: str) -> str:
        """Call Codex to modify training code."""
        # Implementation depends on Codex API
        pass
```

## UI-Agent Communication: WebSocket

The agent runs its own WebSocket server, completely decoupled from any UI. Any frontend (Aim UI, custom UI, CLI) connects as a client. This enables:

- **Bidirectional real-time communication**
- **Command acknowledgment** — every command gets a response confirming execution
- **UI-agnostic** — agent can be used with any visualization tool
- **Standalone** — user imports agent and runs it anywhere

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     User runs agent anywhere                             │
│                                                                         │
│   from aim.sdk.agent import ResearchAgent                               │
│   agent = ResearchAgent("./training_repo")                              │
│   asyncio.run(agent.serve(port=8765))                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket (ws://host:port)
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│    Aim UI         │   │   Custom UI       │   │   CLI Client      │
│                   │   │                   │   │                   │
│ Connects to       │   │ Connects to       │   │ Connects to       │
│ ws://agent:8765   │   │ ws://agent:8765   │   │ ws://agent:8765   │
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

### WebSocket Message Protocol

#### Client → Agent (Commands)

Every command includes an optional `id` for client-side correlation.

```json
{"id": "abc123", "action": "start", "experiment": "my_exp"}
{"id": "abc124", "action": "stop"}
{"id": "abc125", "action": "status"}
{"id": "abc126", "action": "command", "cmd": "update_lr", "params": {"lr": 0.001}}
{"id": "abc127", "action": "chat", "message": "Try a deeper network"}
```

#### Agent → Client (Acknowledgments)

Every command receives an acknowledgment with `ack: true/false`.

```json
{"ack": true, "id": "abc123", "action": "start", "run_hash": "a1b2c3d4"}
{"ack": true, "id": "abc124", "action": "stop"}
{"ack": true, "id": "abc125", "action": "status", "status": "running", "run_hash": "a1b2c3d4", "metrics": {"loss": 0.234}}
{"ack": false, "id": "abc126", "error": "Training not running"}
```

#### Agent → Client (Events)

Events are broadcast to all connected clients in real-time.

```json
{"event": "metric", "name": "loss", "value": 0.234, "step": 100}
{"event": "metric", "name": "accuracy", "value": 0.95, "step": 100}
{"event": "image", "name": "predictions", "path": "/tmp/session/pred_100.png", "step": 100}
{"event": "log", "level": "info", "message": "Starting epoch 5"}
{"event": "status", "status": "running", "epoch": 5}
{"event": "done", "run_hash": "a1b2c3d4"}
```

### Agent with WebSocket Server

```python
# aim/sdk/agent/research_agent.py

import asyncio
import websockets
import json
import subprocess
import threading
from typing import Optional
from aim import Run

class ResearchAgent:
    def __init__(self, repo_path: str, aim_repo: str = None):
        self.repo_path = repo_path
        self.aim_repo = aim_repo
        self.run: Optional[Run] = None
        self._process = None
        self._clients = set()
        self._loop = None
        self._status = "idle"
        self.metrics = {}
    
    # ─────────────────────────────────────────────────────────────────
    # WebSocket Server
    # ─────────────────────────────────────────────────────────────────
    
    async def serve(self, host: str = "localhost", port: int = 8765):
        """Start WebSocket server."""
        self._loop = asyncio.get_running_loop()
        async with websockets.serve(self._handle_client, host, port):
            print(f"Agent listening on ws://{host}:{port}")
            await asyncio.Future()
    
    async def _handle_client(self, ws):
        """Handle connected client."""
        self._clients.add(ws)
        try:
            async for message in ws:
                response = await self._handle_command(json.loads(message))
                await ws.send(json.dumps(response))  # Always acknowledge
        finally:
            self._clients.discard(ws)
    
    async def _handle_command(self, cmd: dict) -> dict:
        """Handle command and return acknowledgment."""
        cmd_id = cmd.get("id")
        action = cmd.get("action")
        
        try:
            if action == "start":
                run_hash = self._start_training(cmd.get("experiment", "research"))
                return {"ack": True, "id": cmd_id, "action": "start", "run_hash": run_hash}
            
            elif action == "stop":
                self._stop_training()
                return {"ack": True, "id": cmd_id, "action": "stop"}
            
            elif action == "status":
                return {"ack": True, "id": cmd_id, "action": "status", 
                        "status": self._status, 
                        "run_hash": self.run.hash if self.run else None,
                        "metrics": self.metrics}
            
            elif action == "command":
                self._send_to_training(cmd.get("cmd"), **cmd.get("params", {}))
                return {"ack": True, "id": cmd_id, "action": "command", "cmd": cmd.get("cmd")}
            
            elif action == "chat":
                result = self._chat(cmd.get("message"))
                return {"ack": True, "id": cmd_id, "action": "chat", **result}
            
            else:
                return {"ack": False, "id": cmd_id, "error": f"Unknown action: {action}"}
        
        except Exception as e:
            return {"ack": False, "id": cmd_id, "error": str(e)}
    
    # ─────────────────────────────────────────────────────────────────
    # Event Broadcasting
    # ─────────────────────────────────────────────────────────────────
    
    async def _broadcast(self, event: dict):
        """Broadcast event to all connected clients."""
        if self._clients:
            msg = json.dumps(event)
            await asyncio.gather(*[c.send(msg) for c in self._clients], return_exceptions=True)
    
    def _emit(self, event_type: str, data: dict):
        """Emit event from sync context (training reader thread)."""
        event = {"event": event_type, **data}
        if self._loop:
            asyncio.run_coroutine_threadsafe(self._broadcast(event), self._loop)
    
    # ─────────────────────────────────────────────────────────────────
    # Training Management (same as before, with _emit calls added)
    # ─────────────────────────────────────────────────────────────────
    
    def _start_training(self, experiment: str) -> str:
        if self._status == "running":
            raise RuntimeError("Training already running")
        
        self._status = "running"
        self.run = Run(experiment=experiment, repo=self.aim_repo)
        self.metrics = {}
        
        self._process = subprocess.Popen(
            ["python", "train.py"],
            cwd=self.repo_path,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        
        threading.Thread(target=self._read_loop, daemon=True).start()
        self._emit("status", {"status": "started", "run_hash": self.run.hash})
        return self.run.hash
    
    def _stop_training(self):
        self._send_to_training("stop")
        self._status = "stopping"
    
    def _send_to_training(self, cmd: str, **params):
        if self._process and self._process.stdin:
            self._process.stdin.write(json.dumps({"cmd": cmd, **params}) + "\n")
            self._process.stdin.flush()
    
    def _read_loop(self):
        """Read JSONL from training, emit events."""
        for line in self._process.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                self._handle_training_output(data)
            except json.JSONDecodeError:
                self._emit("log", {"level": "stdout", "message": line})
        
        self._status = "idle"
        self._emit("done", {"run_hash": self.run.hash})
        self.run.close()
    
    def _handle_training_output(self, data: dict):
        """Handle JSONL from training, track to Aim, emit to clients."""
        t = data.get("type")
        
        if t == "metric":
            self.run.track(data["value"], name=data["name"], 
                          step=data.get("step"), epoch=data.get("epoch"))
            self.metrics[data["name"]] = data["value"]
        
        elif t == "image":
            from aim.sdk.objects import Image
            self.run.track(Image(data["path"]), name=data["name"], step=data.get("step"))
        
        # ... other types (figure, audio, etc.)
        
        # Emit to all connected clients
        self._emit(t, data)
    
    def _chat(self, message: str) -> dict:
        """Chat with Codex, modify code, run training."""
        response = self._call_codex(message)
        run_hash = self._start_training("research")
        return {"response": response, "run_hash": run_hash}
    
    def _call_codex(self, message: str) -> str:
        """Call Codex to modify training code."""
        # Implementation depends on Codex API
        pass
```

### Client Examples

#### Python Client

```python
import asyncio
import websockets
import json

async def main():
    async with websockets.connect("ws://localhost:8765") as ws:
        # Start training
        await ws.send(json.dumps({"id": "1", "action": "start"}))
        
        async for msg in ws:
            data = json.loads(msg)
            
            if "ack" in data:
                # Command acknowledgment
                if data["ack"]:
                    print(f"Command {data['id']} succeeded: {data}")
                else:
                    print(f"Command {data['id']} failed: {data['error']}")
            
            elif "event" in data:
                # Streaming event
                print(f"Event: {data['event']} - {data}")
                if data["event"] == "done":
                    break

asyncio.run(main())
```

#### JavaScript Client (Browser)

```javascript
const ws = new WebSocket("ws://localhost:8765");

ws.onopen = () => {
    // Start training
    ws.send(JSON.stringify({ id: "1", action: "start" }));
};

ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    
    if ("ack" in data) {
        console.log("Command response:", data);
    } else if ("event" in data) {
        console.log("Event:", data.event, data);
        updateUI(data);
    }
};

// Send command
function sendCommand(action, params = {}) {
    ws.send(JSON.stringify({ id: Date.now().toString(), action, ...params }));
}
```

#### CLI Client (curl + websocat)

```bash
# Install websocat: brew install websocat

# Connect and interact
echo '{"action": "start"}' | websocat ws://localhost:8765

# Stream events
websocat ws://localhost:8765
```

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Data Flow                                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Any UI Client                             │  │
│  │                                                               │  │
│  │  ws.send({action: "start"})  ──────────────────────┐         │  │
│  │  ws.send({action: "chat", message: "..."})  ───────┤         │  │
│  │                                                     │         │  │
│  │  ws.onmessage: {ack: true, ...}  ◄─────────────────┤         │  │
│  │  ws.onmessage: {event: "metric", ...}  ◄───────────┤         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                       │             │
│                                            WebSocket  │             │
│                                                       ▼             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    ResearchAgent                              │  │
│  │                                                               │  │
│  │  _handle_command() ─► start/stop/chat                        │  │
│  │       │                                                       │  │
│  │       ├──► _call_codex() ─► Modify Code                      │  │
│  │       │                                                       │  │
│  │       └──► subprocess ─────────────────────┐                 │  │
│  │                                             │                 │  │
│  │                                             ▼                 │  │
│  │                                    Training Process           │  │
│  │                                             │                 │  │
│  │                                      stdout (JSONL)           │  │
│  │                                             │                 │  │
│  │  _handle_training_output() ◄────────────────┘                │  │
│  │       │                                                       │  │
│  │       ├──► run.track(value)  ─► Aim DB                       │  │
│  │       │                                                       │  │
│  │       └──► _emit(event) ─► broadcast to all clients          │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
aim/sdk/agent/
├── __init__.py
├── research_agent.py     # Main agent class with WebSocket server
├── DESIGN.md             # This document
```

```
training_repo/            # User's training repository
├── train.py              # Entry point (REQUIRED)
├── prob.py               # Problem definition (REQUIRED)
├── model.py              # Model architecture
├── config.yaml           # Hyperparameters
├── aim_logger.py         # Logger (copy or install)
└── requirements.txt
```

### Dependencies

The agent requires only one additional dependency for WebSocket:

```
websockets>=10.0
```

## Example Session

### Starting the Agent

```python
import asyncio
from aim.sdk.agent import ResearchAgent

agent = ResearchAgent("./mnist_training")

# Start WebSocket server (blocking)
asyncio.run(agent.serve(host="localhost", port=8765))
```

```bash
# Output:
# Agent listening on ws://localhost:8765
```

### Client Interaction (Python)

```python
import asyncio
import websockets
import json

async def train_session():
    async with websockets.connect("ws://localhost:8765") as ws:
        
        # Iteration 1: Baseline
        await ws.send(json.dumps({"id": "1", "action": "chat", "message": "Run baseline MLP training"}))
        # Wait for ack and events...
        # → accuracy: 92%
        
        # Iteration 2: Better architecture
        await ws.send(json.dumps({"id": "2", "action": "chat", "message": "Switch to CNN with 2 conv layers"}))
        # → accuracy: 96%
        
        # Iteration 3: Regularization
        await ws.send(json.dumps({"id": "3", "action": "chat", "message": "Add dropout and batch normalization"}))
        # → accuracy: 98%
        
        # Iteration 4: Fine-tuning
        await ws.send(json.dumps({"id": "4", "action": "chat", "message": "Reduce learning rate to 0.0001"}))
        # → accuracy: 99.1% ✓

asyncio.run(train_session())
```

### Direct API Usage (without WebSocket)

For programmatic use without a UI, the agent can still be used directly:

```python
from aim.sdk.agent import ResearchAgent

agent = ResearchAgent("./mnist_training")

# Start training directly (no server)
run_hash = agent._start_training(experiment="research")

# Wait for completion
agent.wait()

print(agent.metrics)  # {"loss": 0.01, "accuracy": 0.991}
```

## Key Design Decisions

1. **Agent owns the Run**: Single point of contact with Aim
2. **JSONL protocol**: Simple, debuggable, works with any language
3. **File references for objects**: Handles any size (images, audio, checkpoints)
4. **stdin/stdout IPC**: Simple, no dependencies, works with subprocess
5. **Training code is simple**: Just print JSON, no Aim import needed
6. **WebSocket for UI communication**: Bidirectional, real-time, with command acknowledgment
7. **Agent is standalone**: Runs its own server, any UI connects as client (fully decoupled)

## Future Extensions

- [x] WebSocket for real-time UI updates
- [ ] Multiple concurrent sessions
- [ ] Checkpoint/resume support
- [ ] Auto-suggestions based on metrics
- [ ] Integration with Codex sandbox API
