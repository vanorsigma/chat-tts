from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from functools import lru_cache
from typing import Any

import aiohttp
import aiohttp.web

KOKORO_VOICES = [
    "af_heart",
    "af_alloy",
    "af_aoede",
    "af_bella",
    "af_jessica",
    "af_kore",
    "af_nicole",
    "af_nova",
    "af_river",
    "af_sarah",
    "af_sky",
    "am_adam",
    "am_echo",
    "am_eric",
    "am_fenrir",
    "am_liam",
    "am_michael",
    "am_onyx",
    "am_puck",
    "am_santa",
    "bf_alice",
    "bf_emma",
    "bf_isabella",
    "bf_lily",
    "bm_daniel",
    "bm_fable",
    "bm_george",
    "bm_lewis",
]

OPENROUTER_MODEL = "hexgrad/kokoro-82m"
CAPTAIN_BASE_URL = os.getenv("CAPTAIN_BASE_URL", "http://localhost:4173").rstrip("/")
PORT = int(os.getenv("KOKORO_PORT", "8001"))
DEFAULT_VOICE = "af_heart"
DEFAULT_RESPONSE_FORMAT = "mp3"

_config_lock = asyncio.Lock()
_cached_key: str | None = None
_cached_key_ts: float = 0
_CACHE_TTL = 300.0


@lru_cache(maxsize=128)
def _tts_cache(voice: str, message_lower: str) -> dict[str, Any]:
    return {"audio": None, "content_type": None, "generation_id": None}


async def fetch_openrouter_key() -> str:
    global _cached_key, _cached_key_ts

    async with _config_lock:
        now = time.monotonic()
        if _cached_key and now - _cached_key_ts < _CACHE_TTL:
            return _cached_key

        url = f"{CAPTAIN_BASE_URL}/api/config"
        print(f"Fetching config from {url}")
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                resp.raise_for_status()
                data = await resp.json()

        maki_cfg = data.get("makiConfig") or {}
        key = maki_cfg.get("openrouterApiKey")
        if not key:
            print("ERROR: openrouterApiKey not found in captain config")
            logging.error("openrouterApiKey not found in captain config at %s", url)
            raise RuntimeError(
                "openrouterApiKey not found. "
                "Set makiConfig.openrouterApiKey in captain/config.yml"
            )

        _cached_key = key
        _cached_key_ts = now
        print("OpenRouter API key loaded (cached)")
        return key


async def handle_tts(
    request: aiohttp.web.Request,
) -> aiohttp.web.StreamResponse:  # noqa: F811
    try:
        body = json.loads(await request.read())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return aiohttp.web.Response(text="invalid json", status=400)

    prompt = body.get("prompt", body.get("input", ""))
    if not prompt:
        return aiohttp.web.Response(text="prompt/input required", status=400)

    voice = body.get("voice", DEFAULT_VOICE)
    speed = body.get("speed", 1.0)
    response_format = body.get("response_format", DEFAULT_RESPONSE_FORMAT)

    print(f"TTS: prompt='{prompt[:50]}...' voice={voice} fmt={response_format}")

    entry = _tts_cache(voice, prompt.lower())
    if entry["audio"] is not None:
        print(f"TTS cache hit: voice={voice}")
        headers_out = {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
            "X-Cache-Hit": "true",
        }
        if entry["generation_id"]:
            headers_out["X-Generation-Id"] = entry["generation_id"]
        return aiohttp.web.Response(
            body=entry["audio"],
            content_type=entry["content_type"],
            headers=headers_out,
        )

    print(f"TTS cache miss: voice={voice}")

    try:
        api_key = await fetch_openrouter_key()
    except RuntimeError as e:
        logging.error("Config fetch failed: %s", e)
        return aiohttp.web.Response(text=str(e), status=500)

    openrouter_body = {
        "model": OPENROUTER_MODEL,
        "input": prompt,
        "voice": voice,
        "response_format": response_format,
        "stream": True,
    }
    if speed != 1.0:
        openrouter_body["speed"] = speed

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://openrouter.ai/api/v1/audio/speech",
                headers=headers,
                json=openrouter_body,
            ) as resp:
                if not resp.ok:
                    err_body = await resp.text()
                    logging.error("OpenRouter TTS error %s: %s", resp.status, err_body)
                    return aiohttp.web.Response(
                        text=f"OpenRouter error {resp.status}: {err_body}",
                        status=resp.status,
                    )

                content_type = resp.headers.get(
                    "Content-Type",
                    "audio/mpeg" if response_format == "mp3" else "audio/pcm",
                )
                generation_id = resp.headers.get("X-Generation-Id")

                headers_out = {
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache",
                }
                if generation_id:
                    headers_out["X-Generation-Id"] = generation_id

                stream_resp = aiohttp.web.StreamResponse(
                    status=200,
                    headers=headers_out,
                )
                stream_resp.content_type = content_type
                await stream_resp.prepare(request)

                buf = bytearray()
                async for chunk in resp.content.iter_any():
                    buf.extend(chunk)
                    await stream_resp.write(chunk)
                    await stream_resp.drain()

                entry["audio"] = bytes(buf)
                entry["content_type"] = content_type
                entry["generation_id"] = generation_id
                print(f"TTS cached: voice={voice} ({len(buf)} bytes)")

                print(f"TTS done: {len(buf)} bytes, gen={generation_id}")
                await stream_resp.write_eof()
                return stream_resp
    except aiohttp.ClientError as e:
        logging.error("OpenRouter request failed: %s", e)
        return aiohttp.web.Response(text=f"upstream error: {e}", status=502)


async def handle_voices(request: aiohttp.web.Request) -> aiohttp.web.Response:
    return aiohttp.web.json_response(KOKORO_VOICES)


async def main():
    from shared.bus_logging import install_bus_logging

    install_bus_logging("[Kokoro]")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stdout,
    )

    try:
        key = await fetch_openrouter_key()
        print(f"[Kokoro] OpenRouter key obtained (sk-or-v1-{key[12:16]}...)")
    except RuntimeError as e:
        print(f"[Kokoro] FATAL: {e}")
        sys.exit(1)

    web_app = aiohttp.web.Application()
    web_app.router.add_post("/tts", handle_tts)
    web_app.router.add_get("/voices", handle_voices)

    runner = aiohttp.web.AppRunner(web_app)
    await runner.setup()
    site = aiohttp.web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    print(f"[Kokoro] Listening on http://0.0.0.0:{PORT}/")

    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
