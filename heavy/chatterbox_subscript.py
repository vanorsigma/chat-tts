# NOTE: Absolutely do **not** move the imports out of the functions.
# This is to ensure local dev stays local.

from __future__ import annotations

import argparse
import http.server
import io
import json
import logging
import os
import sys
import threading

import soundfile
import torch

CHATTERBOX_MODEL_DIR = "/chatterbox_models"
AUDIO_PROMPT_PATH = os.path.join(CHATTERBOX_MODEL_DIR, "to_clone.wav")
HF_CACHE_DIR = os.path.join(CHATTERBOX_MODEL_DIR, "huggingface")

_lock: threading.Lock | None = None
_model = None


class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        pass

    def _json_error(self, msg: str, status: int) -> None:
        body = json.dumps({"error": msg}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"{}")
        else:
            self._json_error("not found", 404)

    def do_POST(self) -> None:
        if self.path != "/generate":
            self._json_error("not found", 404)
            return

        content_length = self.headers.get("Content-Length")
        if not content_length:
            self._json_error("missing Content-Length", 400)
            return
        try:
            raw = self.rfile.read(int(content_length))
            req = json.loads(raw)
        except Exception:
            self._json_error("invalid json", 400)
            return

        text = req.get("text", "")
        language_id = req.get("language_id", "en")
        cfg_weight = req.get("cfg_weight", 0.5)
        exaggeration = req.get("exaggeration", 0.5)

        if not os.path.exists(AUDIO_PROMPT_PATH):
            self._json_error(
                f"Audio prompt not found at {AUDIO_PROMPT_PATH}. "
                "Run `modal run chatterbox_runner.py::upload_to_clone` first.",
                500,
            )
            return

        assert _lock is not None
        with _lock:
            try:
                wav = _model.generate(
                    text=text,
                    audio_prompt_path=AUDIO_PROMPT_PATH,
                    cfg_weight=cfg_weight,
                    exaggeration=exaggeration,
                    language_id=language_id,
                )
            except Exception:
                logging.getLogger().exception("generate failed")
                self._json_error("generate error", 500)
                return

        sample_rate = 24000
        buffer = io.BytesIO()
        soundfile.write(buffer, wav[0].cpu().numpy(), sample_rate, format="wav")
        wav_bytes = buffer.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav_bytes)))
        self.end_headers()
        self.wfile.write(wav_bytes)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="[chatterbox-sub] %(message)s",
        stream=sys.stderr,
    )
    log = logging.getLogger(__name__)

    os.makedirs(HF_CACHE_DIR, exist_ok=True)

    from chatterbox.mtl_tts import (  # pyright: ignore[reportMissingImports]
        ChatterboxMultilingualTTS,
    )

    global _lock, _model
    _lock = threading.Lock()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    log.info("Loading ChatterboxMultilingualTTS on %s...", device)
    _model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    log.info("Chatterbox model loaded on %s", device)

    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", args.port), _Handler
    )
    log.info("chatterbox subscript listening on 127.0.0.1:%d", args.port)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
