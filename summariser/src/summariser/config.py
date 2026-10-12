import asyncio
import os

import aiohttp
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

CATEGORY_POLL_SECONDS = 30


class SummariserConfig(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    cost: int
    user: str
    blacklisted_categories: list[str]
    openrouter_api_key: str
    summary_model: str
    correction_model: str
    max_tokens: int
    window_minutes: int
    rolling_window_size: int
    summary_interval_minutes: int
    asr_model_dir: str
    mic_device: str
    screenshot_monitor: str
    communication_bus_url: str


def captain_base_url() -> str:
    return os.getenv("CAPTAIN_BASE_URL", "http://localhost:4173").rstrip("/")


async def fetch_summariser_config() -> tuple[SummariserConfig, str]:
    base = captain_base_url()
    url = f"{base}/api/config"
    print(f"[CONFIG] Fetching config from {url}")
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            resp.raise_for_status()
            data = await resp.json()

    if not isinstance(data, dict):
        raise RuntimeError(f"Captain at {url} returned no config object.")

    raw = data.get("summariserConfig")
    if not raw:
        raise RuntimeError(
            f"Captain at {url} returned no summariserConfig. "
            "Populate summariserConfig in captain/config.yml."
        )
    if not isinstance(raw, dict):
        raise RuntimeError(f"Captain at {url} returned a malformed summariserConfig.")

    channel = data.get("channelName")
    if not channel:
        raise RuntimeError(f"Captain at {url} returned no channelName.")

    config = SummariserConfig(**raw)
    print(f"[CONFIG] Obtained config: model={config.summary_model}, channel={channel}")
    return config, channel


class CategoryTracker:
    """Polls Captain for the active category and stream id."""

    def __init__(self) -> None:
        self.category: str | None = None
        self.stream_id: str | None = None
        self.is_live: bool = False

    async def run(self) -> None:
        while True:
            await self._refresh()
            await asyncio.sleep(CATEGORY_POLL_SECONDS)

    async def _refresh(self) -> None:
        url = f"{captain_base_url()}/api/twitch/category"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status != 200:
                        print(
                            f"[CATEGORY] Poll returned {resp.status}, keeping previous"
                        )
                        return
                    data = await resp.json()
        except Exception as e:
            print(f"[CATEGORY] Poll failed: {e}")
            return

        if not isinstance(data, dict):
            print("[CATEGORY] Poll returned a non-object, keeping previous")
            return

        self.category = data.get("category")
        self.stream_id = data.get("streamId")
        self.is_live = bool(data.get("isLive"))
        print(
            f"[CATEGORY] {self.category!r} stream={self.stream_id} live={self.is_live}"
        )
