# NOTE: Do **not** move the imports out of the functions.
# This is to ensure local dev stays local. Remote dev only.

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import uuid
from functools import lru_cache
from typing import Any

import aiohttp
import aiohttp.web
import modal

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

DEFAULT_VOICE = "af_heart"
DEFAULT_RESPONSE_FORMAT = "mp3"
PORT = int(os.getenv("KOKORO_PORT", "8001"))
MINUTES = 60

_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(["espeak-ng", "ffmpeg", "libsndfile1"])
    .pip_install(["kokoro>=0.9.2", "soundfile", "torch", "numpy"])
    .env({"HF_HOME": "/root/.cache/huggingface"})
    .run_commands(
        'python -c "from kokoro import KPipeline; [KPipeline(lang_code=c) for c in (\'a\',\'b\')]"'
    )
)

app = modal.App("kokoro")


def _voice_lang_code(voice: str) -> str:
    if voice.startswith("bf") or voice.startswith("bm"):
        return "b"
    return "a"


@app.cls(
    image=_image,
    cpu=2,
    memory=4096,
    scaledown_window=10 * MINUTES,
    max_containers=1,
)
class KokoroServer:
    @modal.enter()
    def load(self):
        self._pipelines: dict[str, Any] = {}

    def _get_pipeline(self, lang_code: str):
        if lang_code not in self._pipelines:
            from kokoro import KPipeline

            self._pipelines[lang_code] = KPipeline(lang_code=lang_code)
        return self._pipelines[lang_code]

    @modal.method()
    def tts(self, prompt: str, voice: str, speed: float, response_format: str) -> bytes:
        import io
        import subprocess

        import soundfile
        import torch

        lang_code = _voice_lang_code(voice)
        pipeline = self._get_pipeline(lang_code)

        chunks = []
        generator = pipeline(prompt, voice=voice, speed=speed)
        for _gs, _ps, audio in generator:
            chunks.append(audio)

        if not chunks:
            raise RuntimeError("kokoro returned no audio chunks")

        waveform = torch.cat(chunks, dim=0)
        if waveform.dim() == 1:
            waveform = waveform.unsqueeze(0)
        waveform_np = waveform.cpu().numpy()

        if response_format == "mp3":
            wav_buf = io.BytesIO()
            soundfile.write(wav_buf, waveform_np.squeeze(), 24000, format="WAV")
            wav_buf.seek(0)
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", "pipe:0", "-f", "mp3", "pipe:1"],
                input=wav_buf.read(),
                capture_output=True,
                check=True,
            )
            return result.stdout

        audio_int16 = (torch.from_numpy(waveform_np).clamp(-1, 1) * 32767).to(torch.int16)
        return audio_int16.numpy().tobytes()

    @modal.exit()
    def cleanup(self):
        print("[Kokoro] Modal container shutting down")


@lru_cache(maxsize=128)
def _tts_cache(voice: str, message_lower: str) -> dict[str, Any]:
    return {"audio": None, "content_type": None, "generation_id": None}


async def handle_tts(request: aiohttp.web.Request) -> aiohttp.web.Response:
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

    if voice not in KOKORO_VOICES:
        return aiohttp.web.Response(
            text=f"unknown voice: {voice}", status=400
        )

    content_type = "audio/mpeg" if response_format == "mp3" else "audio/pcm"

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
            content_type=content_type,
            headers=headers_out,
        )

    print(f"TTS cache miss: voice={voice}")
    generation_id = str(uuid.uuid4())

    server = KokoroServer()
    try:
        audio_bytes = await server.tts.remote.aio(
            prompt, voice, float(speed), response_format
        )
    except Exception as e:
        logging.error("Modal TTS call failed: %s", e)
        return aiohttp.web.Response(text=str(e), status=500)

    entry["audio"] = audio_bytes
    entry["content_type"] = content_type
    entry["generation_id"] = generation_id
    print(f"TTS cached: voice={voice} ({len(audio_bytes)} bytes)")

    headers_out = {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
        "X-Generation-Id": generation_id,
    }
    return aiohttp.web.Response(
        body=audio_bytes,
        content_type=content_type,
        headers=headers_out,
    )


async def handle_voices(request: aiohttp.web.Request) -> aiohttp.web.Response:
    return aiohttp.web.json_response(KOKORO_VOICES)


@app.local_entrypoint()
async def main():
    from shared.bus_logging import install_bus_logging

    install_bus_logging("[Kokoro]")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stdout,
    )

    async def _warmup():
        logging.info("Warming up Kokoro TTS...")
        server = KokoroServer()
        try:
            await server.tts.remote.aio("warmup", "af_heart", 1.0, "mp3")
        except Exception:
            logging.exception("Kokoro warmup failed")

    _warmup_task = asyncio.create_task(_warmup())

    web_app = aiohttp.web.Application()
    web_app.router.add_post("/tts", handle_tts)
    web_app.router.add_get("/voices", handle_voices)

    runner = aiohttp.web.AppRunner(web_app)
    await runner.setup()
    site = aiohttp.web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    print(f"[Kokoro] Modal interactor listening on http://0.0.0.0:{PORT}/")

    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()
