from pydantic import BaseModel, Field


class NovuConfig(BaseModel):
    """Novu Notification Service Configuration.

    Local dev defaults match ``docker-compose.novu.yaml`` so everything works
    out of the box.

    - ``ApiUrl`` / ``WsUrl``: internal URLs used by the backend (novu-py SDK,
      bootstrap).  Default to ``host.docker.internal`` because the Xyzen
      backend runs inside Docker.
    - ``PublicApiUrl`` / ``PublicWsUrl``: URLs returned to the browser via
      ``/notifications/config``.  Default to ``localhost`` because the
      browser runs on the host.
    """

    Enable: bool = Field(default=True, description="Enable Novu notification integration")

    # Backend → Novu (container-to-host)
    ApiUrl: str = Field(default="http://host.docker.internal:3100", description="Novu API URL (backend internal)")
    WsUrl: str = Field(default="http://host.docker.internal:3102", description="Novu WS URL (backend internal)")

    # Browser → Novu (host-to-host)
    PublicApiUrl: str = Field(default="http://localhost:3100", description="Novu API URL (returned to frontend)")
    PublicWsUrl: str = Field(default="http://localhost:3102", description="Novu WS URL (returned to frontend)")

    SecretKey: str = Field(
        default="",
        description="Novu Environment API Key (from Dashboard → Settings → API Keys). "
        "Leave empty for dev (bootstrap auto-syncs); set via XYZEN_Novu_SecretKey in production.",
    )
    AppIdentifier: str = Field(
        default="xyzen-dev",
        description="Novu application identifier (bootstrap pushes this value into Novu)",
    )

    # Default admin credentials for auto-bootstrap (dev only).
    AdminEmail: str = Field(default="admin@xyzen.dev")
    AdminPassword: str = Field(default="Admin123!")
    AdminOrgName: str = Field(default="Xyzen")
