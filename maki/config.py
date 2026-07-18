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
    text_speed: int = 30


class BotToken(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    access_token: str
    refresh_token: str | None = None
    scope: list[str] | None = None
    expires_in: int | None = None
    obtainment_timestamp: int | None = None


def captain_base_url() -> str:
    env = os.getenv("CAPTAIN_BASE_URL", "http://localhost:5173")
    return env.rstrip("/")


async def fetch_maki_config() -> MakiConfig:
    base = captain_base_url()
    url = f"{base}/api/config"
    print(f"[CONFIG] Fetching config from {url}")
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            resp.raise_for_status()
            data = await resp.json()
    maki_cfg = data.get("makiConfig")
    if not maki_cfg:
        raise RuntimeError(
            f"Captain at {url} returned no makiConfig. "
            "Populate makiConfig in captain/config.yml."
        )
    print(
        f"[CONFIG] Obtained config: model={maki_cfg.get('makiModel')}, broadcaster={maki_cfg.get('broadcasterName')}"
    )
    parsed = MakiConfig(**maki_cfg)
    print(f"[CONFIG] Parsed config successfully")
    return parsed


async def fetch_bot_token() -> BotToken:
    base = captain_base_url()
    url = f"{base}/api/twitch/bot-token"
    print(f"[CONFIG] Fetching bot token from {url}")
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status == 404:
                raise RuntimeError(
                    f"Captain at {url} returned no bot token. "
                    "Run `bun run authflow.ts bot` in the captain directory first."
                )
            resp.raise_for_status()
            data = await resp.json()
    bot_token = BotToken(**data)
    print(f"[CONFIG] Obtained bot token: scopes={bot_token.scope}")
    return bot_token
