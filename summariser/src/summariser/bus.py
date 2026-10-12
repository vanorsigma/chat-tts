import json

import websockets

from .config import SummariserConfig


class Bus:
    """Lazy-reconnecting sender for the summary and screenshot control messages."""

    def __init__(self, config: SummariserConfig) -> None:
        self._url = config.communication_bus_url
        self._websocket: websockets.ClientConnection | None = None

    async def _lazy_init(self) -> bool:
        if self._websocket:
            return True
        try:
            self._websocket = await websockets.connect(self._url)
            print(f"[BUS] Connected to {self._url}")
            return True
        except Exception as e:
            print(f"[BUS] Cannot connect to {self._url}: {e}")
            self._websocket = None
            return False

    async def _send(self, payload: dict[str, object]) -> None:
        if not await self._lazy_init():
            return
        websocket = self._websocket
        if websocket is None:
            return
        try:
            await websocket.send(json.dumps(payload))
        except websockets.exceptions.ConnectionClosed:
            print("[BUS] Websocket closed, resetting for resiliency")
            self._websocket = None

    async def set_screenshot_mode(self, active: bool) -> None:
        print(f"[BUS] Overlay screenshot mode {'on' if active else 'off'}")
        await self._send(
            {"type": "control", "op": "screenshot", "screenshotActive": active}
        )

    async def send_summary(
        self, category: str, text: str, created_at: int, stream_id: str | None
    ) -> None:
        await self._send(
            {
                "type": "summary",
                "category": category,
                "text": text,
                "createdAt": created_at,
                "streamId": stream_id,
            }
        )

    async def close(self) -> None:
        if self._websocket:
            try:
                await self._websocket.close()
            except Exception:
                pass
