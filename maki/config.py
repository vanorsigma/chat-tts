import os

import aiohttp
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class MakiConfig(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    twitch_client_id: str
    twitch_client_secret: str
    broadcaster_name: str
    openrouter_api_key: str
    maki_model: str
    evaluator_model: str
    max_tokens: int
    communication_bus_url: str
    screenshot_display: int


def _captain_base_url() -> str:
    env = os.getenv("CAPTAIN_BASE_URL", "http://localhost:5173")
    return env.rstrip("/")


async def fetch_maki_config() -> MakiConfig:
    base = _captain_base_url()
    url = f"{base}/api/config"
    print(f"[CONFIG] Fetching config from {url}")
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            resp.raise_for_status()
            data = await resp.json()
    maki_cfg = data.get("makiConfig")
    print(
        f"[CONFIG] Obtained config: model={maki_cfg.get('makiModel')}, broadcaster={maki_cfg.get('broadcasterName')}"
    )
    if not maki_cfg:
        raise RuntimeError(
            f"Captain at {url} returned no makiConfig. "
            "Populate makiConfig in captain/config.yml."
        )
    parsed = MakiConfig(**maki_cfg)
    print(f"[CONFIG] Parsed config successfully")
    return parsed
