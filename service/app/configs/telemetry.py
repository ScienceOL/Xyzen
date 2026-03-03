from pydantic_settings import BaseSettings


class TelemetryConfig(BaseSettings):
    Enabled: bool = False
    Endpoint: str = "http://localhost:4317"
    ServiceName: str = "xyzen-service"
    Insecure: bool = True
    SampleRate: float = 1.0
