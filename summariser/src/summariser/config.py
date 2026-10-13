import asyncio
import os
from pathlib import Path

import aiohttp
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

CATEGORY_POLL_SECONDS = 30
STANDALONE_CHANNEL = os.getenv("SUMMARISER_CHANNEL", "vanorsigma")
DEFAULT_ASR_MODEL_DIR = str(
    Path(__file__).resolve().parents[2]
    / "models"
    / "sherpa-onnx-nemotron-speech-streaming-en-0.6b-560ms-int8-2026-04-25"
)


class SummariserConfig(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    cost: int = 0
    user: str = "standalone"
    blacklisted_categories: list[str] = Field(default_factory=list)
    ignored_users: list[str] = Field(default_factory=list)
    openrouter_api_key: str = Field(
        default_factory=lambda: os.getenv("OPENROUTER_API_KEY", "")
    )
    summary_model: str = "google/gemini-3.5-flash-lite"
    correction_model: str = "google/gemini-3.5-flash-lite"
    max_tokens: int = 100_000
    window_minutes: int = 10
    rolling_window_size: int = 10
    asr_model_dir: str = DEFAULT_ASR_MODEL_DIR
    mic_device: str = ""
    screenshot_monitor: str = "HDMI-A-1"
    communication_bus_url: str = "ws://localhost:3001/senders"


def is_standalone() -> bool:
    return bool(os.getenv("SUMMARISER_STANDALONE"))


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

    config = SummariserConfig(**raw, ignored_users=data.get("ignoredUsers") or [])
    print(f"[CONFIG] Obtained config: model={config.summary_model}, channel={channel}")
    return config, channel


async def load_summariser_config() -> tuple[SummariserConfig, str]:
    if is_standalone():
        print("[CONFIG] Standalone mode, using defaults instead of Captain")
        return SummariserConfig(), STANDALONE_CHANNEL
    return await fetch_summariser_config()


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
