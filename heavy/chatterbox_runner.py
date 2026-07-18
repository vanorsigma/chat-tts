# NOTE: Absolutely do **not** move the imports out of the functions.
# This is to ensure local dev stays local. Remote dev

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import sys
import time
from pathlib import Path

import modal
import soundfile
import torch

MODEL_DIR = "/models"
AUDIO_PROMPT_PATH = os.path.join(MODEL_DIR, "to_clone.wav")
HF_CACHE_DIR = os.path.join(MODEL_DIR, "huggingface")
MINUTES = 60
PORT = 8000
TIMEOUT_SECS = 60.0

chatterbox_image = (
    modal.Image.from_registry(
        "nvidia/cuda:13.3.0-cudnn-runtime-ubuntu24.04", add_python="3.11"
    )
    .env({"HF_HOME": HF_CACHE_DIR})
    .pip_install(
        [
            "chatterbox-tts>=0.1.7",
            "soundfile>=0.13.0",
            "aiohttp>=3.10.0",
            "torch",
            "torchaudio",
        ]
    )
)

app = modal.App("chatterbox")
model_vol = modal.Volume.from_name("chatterbox-models", create_if_missing=True)


@app.local_entrypoint()
def upload_to_clone(local_path: str = "to_clone.wav"):
    local = Path(local_path)
    if not local.exists():
        print(f"Error: {local_path} not found")
        sys.exit(1)

    vol = modal.Volume.from_name("chatterbox-models", create_if_missing=True)
    with vol.batch_upload(force=True) as batch:
        batch.put_file(str(local), "/to_clone.wav")
    print(f"Uploaded {local_path} to chatterbox-models volume")


@app.cls(
    image=chatterbox_image,
    gpu="T4",
    scaledown_window=30 * MINUTES,
    startup_timeout=10 * MINUTES,
    volumes={MODEL_DIR: model_vol},
    max_containers=1,
)
class ChatterboxServer:
    @modal.enter()
    def load(self):
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        os.makedirs(HF_CACHE_DIR, exist_ok=True)
        print("Loading ChatterboxMultilingualTTS...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = ChatterboxMultilingualTTS.from_pretrained(device=self.device)
        print(f"Model loaded on {self.device}")

    @modal.method()
    async def generate(
        self,
        text: str,
        language_id: str = "ja",
        cfg_weight: float = 0.2,
        exaggeration: float = 1.0,
    ) -> bytes:
        if not os.path.exists(AUDIO_PROMPT_PATH):
            raise FileNotFoundError(
                f"Audio prompt not found at {AUDIO_PROMPT_PATH}. "
                "Run `modal run chatterbox_runner.py::upload_to_clone` first."
            )
        wav = self.model.generate(
            text=text,
            audio_prompt_path=AUDIO_PROMPT_PATH,
            cfg_weight=cfg_weight,
            exaggeration=exaggeration,
            language_id=language_id,
        )
        sample_rate = 24000
        buffer = io.BytesIO()
        soundfile.write(buffer, wav[0].cpu().numpy(), sample_rate, format="wav")
        buffer.seek(0)
        return buffer.read()

    @modal.exit()
    def cleanup(self):
        print("Chatterbox server shutting down")


_warmed_up = asyncio.Event()


@app.local_entrypoint()
async def main(host: str = "localhost", port: int = PORT):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from shared.bus_logging import install_bus_logging

    install_bus_logging("[Chatterbox]")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stdout,
    )

    server = ChatterboxServer()

    logging.info("Warming up Chatterbox server...")
    try:
        _ = await asyncio.wait_for(
            server.generate.remote.aio("warmup"),
            timeout=600,
        )
    except Exception:
        logging.exception("Warmup failed, server may be degraded")
    _warmed_up.set()
    logging.info("Chatterbox server ready")

    import aiohttp.web

    async def handle_generate(request: aiohttp.web.Request) -> aiohttp.web.Response:
        if not _warmed_up.is_set():
            return aiohttp.web.Response(
                text="Server warming up",
                status=500,
                headers={"Access-Control-Allow-Origin": "*"},
            )
        try:
            body = json.loads(await request.read())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return aiohttp.web.Response(text="invalid json", status=400)

        prompt = body.get("prompt", body.get("text", ""))
        if not prompt:
            return aiohttp.web.Response(text="prompt required", status=400)

        language_id = body.get("language_id", "ja")
        cfg_weight = body.get("cfg_weight", 0.2)
        exaggeration = body.get("exaggeration", 1.0)

        logging.info("Generate: text='%s...' lang=%s", prompt[:40], language_id)

        try:
            wav_bytes = await asyncio.wait_for(
                server.generate.remote.aio(
                    prompt,
                    language_id=language_id,
                    cfg_weight=cfg_weight,
                    exaggeration=exaggeration,
                ),
                timeout=TIMEOUT_SECS,
            )
            return aiohttp.web.Response(
                body=wav_bytes,
                content_type="audio/wav",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache",
                },
            )
        except asyncio.TimeoutError:
            logging.error("Generate timed out after %ss", TIMEOUT_SECS)
            return aiohttp.web.Response(text="generate timeout", status=504)
        except Exception as e:
            logging.exception("Generate failed")
            return aiohttp.web.Response(text=str(e), status=500)

    web_app = aiohttp.web.Application()
    web_app.router.add_post("/generate-audio/", handle_generate)
    runner = aiohttp.web.AppRunner(web_app)
    await runner.setup()
    site = aiohttp.web.TCPSite(runner, host, port)
    await site.start()
    print(f"Chatterbox interactor listening on http://{host}:{port}/")

    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()
