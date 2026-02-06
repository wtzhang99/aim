"""
Minimal training script that demonstrates ResearchAgentLogger.

This script simulates a simple training loop and emits metrics via
the logger so the AimResearchAgent can capture them through stdout.
"""

import math
import time

from aim.sdk.agent.research_agent_logger import ResearchAgentLogger

logger = ResearchAgentLogger()

NUM_EPOCHS = 100
LEARNING_RATE = 0.01

# Simulate a simple loss curve: exponential decay with some noise
for epoch in range(1, NUM_EPOCHS + 1):
    loss = 1.0 * math.exp(-0.15 * epoch) + 0.02 * (epoch % 3)
    accuracy = 1.0 - loss * 0.8

    logger.log({
        "loss": round(loss, 4),
        "accuracy": round(accuracy, 4),
        "epoch": epoch,
        "lr": LEARNING_RATE,
    })

    # Simulate training time per epoch
    time.sleep(5)

print("Training complete")
