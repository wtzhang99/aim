"""
Example: Using AimResearchAgent to monitor a training process.

This script creates an Aim Run, wraps it in an AimResearchAgent, and
launches the training subprocess (train.py inside research_agent_example/).

The agent will:
  1. Start `train.py` as a subprocess and capture its metric logs via stdout.
  2. Automatically track all emitted metrics into the Aim Run.
  3. Connect to the Aim web backend websocket to accept remote instructions
     (e.g. Codex calls) from the Agent UI.

Usage:
    python examples/research_agent_track.py
"""

import asyncio
import os

from aim.sdk.run import Run
from aim.sdk.agent.research_agent import AimResearchAgent

REPO_PATH = os.path.join(os.path.dirname(__file__), "research_agent_example")


async def main():
    # Create an Aim run to track metrics
    run = Run(repo="/Users/kstarxin/Documents/test_aim")

    print(f"Aim Run hash: {run.hash}")
    print(f"Training repo: {REPO_PATH}")

    # Create and start the research agent
    agent = AimResearchAgent(run=run, repo_path=REPO_PATH)
    try:
        await agent.start()
    except KeyboardInterrupt:
        print("Interrupted by user")
    finally:
        run.close()
        print("Run closed")


if __name__ == "__main__":
    asyncio.run(main())
