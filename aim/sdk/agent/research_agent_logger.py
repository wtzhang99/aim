import json

def _emit(data: dict):
    print(json.dumps(data), flush=True)

class ResearchAgentLogger:
    def log(self, metrics: dict):
        metrics_text = json.dumps(metrics)
        _emit({"type": "metrics", "metrics": metrics_text})
    
    def track_image(self, path: str):
        raise NotImplementedError("Not implemented")