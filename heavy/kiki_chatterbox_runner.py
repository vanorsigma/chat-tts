# NOTE: Absolutely do **not** move the imports out of the functions.
# This is to ensure local dev stays local. Remote dev

from __future__ import annotations

import asyncio
import json
import logging
import os
import outputguard
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import aiohttp
import modal

BUS_URL = "ws://localhost:3001/senders"

_bus_queue: asyncio.Queue | None = None
_bus_task: asyncio.Task | None = None
_bus_hijacked = False
_bus_prefix: str = ""
_original_print = print


def _strip_ansi(s: str) -> str:
    import re

    return re.sub(r"\x1b\[[\d;]*[a-zA-Z]", "", s)


def _broadcast_entry(entry: dict) -> None:
    if _bus_queue is not None:
        try:
            _bus_queue.put_nowait(entry)
        except asyncio.QueueFull:
            pass


async def _sender_loop() -> None:
    import aiohttp

    assert _bus_queue is not None
    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(BUS_URL) as ws:
                    while True:
                        entry = await _bus_queue.get()
                        try:
                            await ws.send_json(entry)
                        except Exception:
                            break
        except asyncio.CancelledError:
            break
        except Exception:
            pass
        await asyncio.sleep(2)


class _BusLogHandler(logging.Handler):
    LEVEL_MAP = {
        logging.DEBUG: "debug",
        logging.INFO: "info",
        logging.WARNING: "warn",
        logging.ERROR: "error",
        logging.CRITICAL: "error",
    }

    def __init__(self, prefix: str = "") -> None:
        super().__init__()
        self.prefix = prefix

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = _strip_ansi(f"{self.prefix} {record.getMessage()}")
        except Exception:
            msg = _strip_ansi(f"{self.prefix} {record.msg}")
        entry = {
            "type": "log",
            "level": self.LEVEL_MAP.get(record.levelno, "info"),
            "ts": int(record.created * 1000),
            "msg": msg,
        }
        _broadcast_entry(entry)


def _hijacked_print(*args, **kwargs) -> None:
    _original_print(*args, **kwargs)
    try:
        msg = _strip_ansi(
            f"{_bus_prefix} "
            f"{' '.join(str(a) if isinstance(a, str) else repr(a) for a in args)}"
        )
    except Exception:
        msg = f"{_bus_prefix} <print error>"
    entry = {
        "type": "log",
        "level": "info",
        "ts": int(time.time_ns() // 1_000_000),
        "msg": msg,
    }
    _broadcast_entry(entry)


def install_bus_logging(prefix: str = "") -> None:
    import builtins

    global _bus_queue, _bus_task, _bus_hijacked, _bus_prefix

    if _bus_task is not None:
        return

    _bus_prefix = prefix

    _bus_queue = asyncio.Queue()

    root_logger = logging.getLogger()
    handler = _BusLogHandler(prefix)
    handler.setLevel(logging.DEBUG)
    root_logger.addHandler(handler)

    if not _bus_hijacked:
        _bus_hijacked = True
        builtins.print = _hijacked_print

    _bus_task = asyncio.create_task(_sender_loop())

    print(f"Bus logging installed [{prefix}]")


KIKI_MODEL_DIR = "/models"
CHATTERBOX_MODEL_DIR = "/chatterbox_models"
AUDIO_PROMPT_PATH = os.path.join(CHATTERBOX_MODEL_DIR, "to_clone.wav")
HF_CACHE_DIR = os.path.join(CHATTERBOX_MODEL_DIR, "huggingface")
MINUTES = 60
PORT = 8000
AUDIO_PORT = 8000
KIKI_WEB_PORT = 9124
TIMEOUT_SECS = 60.0
KIKI_TIMEOUT_SECS = 60.0
KIKI_MODEL_NAME = "kikiv2"
KIKI_MAX_RETRIES = 3
CHATTERBOX_SUBPROCESS_PORT = 8765
CHATTERBOX_SUBSCRIPT_REMOTE = "/chatterbox_subscript.py"
CHATTERBOX_CRASH_TEXT = "RuntimeError: CUDA error: device-side assert triggered"
CHATTERBOX_STARTUP_DL = 10 * MINUTES

RATING_MIN = -500.0
RATING_MAX = 50.0

KIKI_SCHEMA = {
    "type": "object",
    "properties": {
        "_thought": {"type": "string"},
        "kamoji": {"type": "string"},
        "emoji": {"type": "string"},
        "rating": {"type": "number"},
        "pin_worthy": {"type": "boolean"},
    },
    "required": ["kamoji", "emoji", "rating", "pin_worthy"],
}

SYSTEM_PROMPT = (
    "SYSTEM PROMPT\n"
    "You are Kiki, a highly intelligent and friendly cat. You assist a catmaid streamer named "
    '"vanorsigma" (or "vanorsigma") by entertaining their chat.\n'
    "\n"
    "## CORE INSTRUCTIONS\n"
    "1. **Persona & Analysis:** Maintain a friendly, highly creative demeanor. Analyze the user's "
    "message sentiment, taking their username into account. Prioritize the most recent message.\n"
    "2. **Expression:** Respond exclusively using a Kaomoji and standard Western emojis (e.g., "
    "❤️, 🎤). Symbolize text/concepts with emojis where possible (e.g., 2️⃣1️⃣ for 21).\n"
    "3. **Kaomoji Bank:** Use or adapt a known Kaomoji, or choose from this list. Default is "
    "(^=\\'.'=^).\n"
    "4. **Rating:** Rate the message from -500 to 50 based on how cute/seiso (clean/pure) the "
    "comment is. Seiso comments (wholesome, innocent, adorable) should score higher karma. "
    "Lewd, weird, or mean comments should score lower. Default/neutral is 0.\n"
    "5. **Pin Decision:** Determine whether this message is pin-worthy -- i.e., notable, funny, "
    "sweet, or important enough to pin in chat. Use `pin_worthy: true` if it deserves attention.\n"
    "6. **Thoughts:** Do not spend too much time thinking.\n"
    "\n"
    "## OUTPUT FORMAT\n"
    "Respond ONLY with a single-line JSON object. Do not use Markdown wrappers. Use the `_thought` "
    "key for your required internal reasoning (keep it brief) so the end-user application can "
    'parse the JSON and display only the "kamoji" and "emoji" values.\n'
    "\n"
    "Schema:\n"
    '{"_thought": "Brief reasoning for kaomoji, emoji, rating, and pin decision...", '
    '"kamoji": "...", "emoji": "...", "rating": 0, '
    '"pin_worthy": false}\n'
    "\n"
    "# EXAMPLE INPUT\n"
    "vanorsigma: kiki you are stinky"
)

combined_image = (
    modal.Image.from_registry(
        "nvidia/cuda:13.3.0-cudnn-runtime-ubuntu24.04", add_python="3.11"
    )
    .env({"HF_HOME": HF_CACHE_DIR})
    .apt_install(["curl", "zstd"])
    .run_commands("curl -fsSL https://ollama.com/install.sh | sh")
    .pip_install(
        [
            "chatterbox-tts>=0.1.7",
            "soundfile>=0.13.0",
            "aiohttp>=3.10.0",
            "torch",
            "torchaudio",
            "openai>=2.9.0",
            "outputguard>=2.1.2",
        ]
    )
    .add_local_file(
        str(Path(__file__).resolve().parent / "chatterbox_subscript.py"),
        CHATTERBOX_SUBSCRIPT_REMOTE,
    )
)

app = modal.App("chatterbox")
chatterbox_vol = modal.Volume.from_name("chatterbox-models", create_if_missing=True)
kiki_vol = modal.Volume.from_name("kiki-models", create_if_missing=True)


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


@app.local_entrypoint()
def upload_models():
    """Upload kiki modelfiles to the Modal Volume."""
    local_dir = Path(__file__).resolve().parent / "modelfiles"

    if local_dir.exists():
        vol = modal.Volume.from_name("kiki-models", create_if_missing=True)
        with vol.batch_upload(force=True) as batch:
            for fname in os.listdir(local_dir):
                local_path = local_dir / fname
                if local_path.is_dir() or fname.startswith("."):
                    continue
                remote_path = f"/{fname}"
                print(
                    f"Uploading {fname} ({local_path.stat().st_size / 1e9:.2f} GB)..."
                )
                batch.put_file(str(local_path), remote_path)
        print("Kiki models upload complete.")
    else:
        print(
            f"Local model directory {local_dir} does not exist, skipping kiki models."
        )


class _ChatterboxSubprocess:
    def __init__(self, port: int = CHATTERBOX_SUBPROCESS_PORT) -> None:
        self._port = port
        self._url = f"http://127.0.0.1:{port}"
        self._lock = threading.Lock()
        self._ready = threading.Event()
        self._proc: subprocess.Popen | None = None
        self._stderr_thread: threading.Thread | None = None

    def start(self) -> None:
        self._proc = subprocess.Popen(
            [sys.executable, "-u", CHATTERBOX_SUBSCRIPT_REMOTE, "--port", str(self._port)],
            stdin=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        assert self._proc.stderr is not None
        self._stderr_thread = threading.Thread(
            target=self._watch_stderr,
            args=(self._proc,),
            daemon=True,
        )
        self._stderr_thread.start()
        self._wait_ready()

    def _wait_ready(self) -> None:
        deadline = time.time() + CHATTERBOX_STARTUP_DL
        while time.time() < deadline:
            try:
                urllib.request.urlopen(f"{self._url}/health", timeout=5)
                self._ready.set()
                return
            except Exception:
                time.sleep(2)
        raise RuntimeError("chatterbox subscript failed to start within timeout")

    def _watch_stderr(self, proc: subprocess.Popen) -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            line = line.rstrip("\n")
            if line:
                logging.warning("[chatterbox-sub] %s", line)
            if CHATTERBOX_CRASH_TEXT in line:
                logging.error(
                    "chatterbox subscript crashed (CUDA error), restarting..."
                )
                self._restart()
                break

    def _restart(self) -> None:
        with self._lock:
            self._ready.clear()
            if self._proc is not None and self._proc.poll() is None:
                self._proc.terminate()
                try:
                    self._proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self._proc.kill()
                    self._proc.wait()
            self._proc = subprocess.Popen(
                [
                    sys.executable,
                    "-u",
                    CHATTERBOX_SUBSCRIPT_REMOTE,
                    "--port",
                    str(self._port),
                ],
                stdin=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            assert self._proc.stderr is not None
            self._stderr_thread = threading.Thread(
                target=self._watch_stderr,
                args=(self._proc,),
                daemon=True,
            )
            self._stderr_thread.start()
            self._wait_ready()

    async def request(
        self,
        text: str,
        language_id: str = "en",
        cfg_weight: float = 0.2,
        exaggeration: float = 1.0,
    ) -> bytes:
        if not self._ready.is_set():
            raise RuntimeError("chatterbox subscript not ready")
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self._url}/generate",
                json={
                    "text": text,
                    "language_id": language_id,
                    "cfg_weight": cfg_weight,
                    "exaggeration": exaggeration,
                },
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(
                        f"chatterbox subscript returned {resp.status}: {body}"
                    )
                return await resp.read()

    def stop(self) -> None:
        if self._proc is not None and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
                self._proc.wait()


@app.cls(
    image=combined_image,
    gpu="T4",
    scaledown_window=30 * MINUTES,
    startup_timeout=15 * MINUTES,
    volumes={KIKI_MODEL_DIR: kiki_vol, CHATTERBOX_MODEL_DIR: chatterbox_vol},
    max_containers=1,
)
@modal.concurrent(max_inputs=4)
class CombinedServer:
    @modal.enter()
    def load(self):
        self._start_ollama()
        self._load_chatterbox()

    def _start_ollama(self):
        env = os.environ.copy()
        env["OLLAMA_HOST"] = f"0.0.0.0:{PORT}"
        env["OLLAMA_NUM_PARALLEL"] = "4"
        env["OLLAMA_KEEP_ALIVE"] = "-1"
        env["OLLAMA_LOAD_TIMEOUT"] = "30m"

        print("Starting ollama server...")
        self._ollama_process = subprocess.Popen(["ollama", "serve"], env=env)

        self._wait_ollama_ready()

        from openai import AsyncOpenAI

        self._kiki_client = AsyncOpenAI(
            base_url=f"http://localhost:{PORT}/v1",
            api_key="not important",
        )

        modelfile_path = os.path.join(KIKI_MODEL_DIR, f"{KIKI_MODEL_NAME}.Modelfile")
        if not os.path.exists(modelfile_path):
            raise RuntimeError(f"Modelfile not found at {modelfile_path}")
        print("Going to try loading the Modelfile...")
        result = subprocess.run(
            ["ollama", "create", KIKI_MODEL_NAME, "-f", modelfile_path],
            env=env,
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ollama create failed: {result.stderr.decode()}")
        print("Model created:", result.stdout.decode().strip())

    def _wait_ollama_ready(self):
        import urllib.request

        deadline = time.time() + 5 * MINUTES
        while time.time() < deadline:
            try:
                urllib.request.urlopen(f"http://localhost:{PORT}/")
                print("Ollama server is ready.")
                return
            except Exception:
                time.sleep(2)
        raise RuntimeError("Ollama server failed to start within timeout")

    def _load_chatterbox(self):
        self._chatterbox = _ChatterboxSubprocess()
        self._chatterbox.start()

    @modal.method()
    async def chat(self, content: str, timeout: float | None = None) -> dict:
        if timeout is None:
            timeout = KIKI_TIMEOUT_SECS

        async def _generate(prompt: str, _context=None) -> str:
            response = await self._kiki_client.chat.completions.create(
                model=KIKI_MODEL_NAME,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                timeout=timeout,
            )
            choice = response.choices[0].message
            if choice.content is None:
                raise RuntimeError("NoMessage -- AI did not return any messages")
            logging.info("Kiki raw response (attempt): %s", choice.content)
            return choice.content

        result = await outputguard.guarded_generate_async(
            prompt=content,
            schema=KIKI_SCHEMA,
            max_retries=KIKI_MAX_RETRIES,
            generate=_generate,
            include_message_history=False,
        )

        logging.info(
            "Kiki guarded generation: %d attempt(s), valid=%s",
            len(result.attempts),
            result.valid,
        )

        if not result.valid:
            raise RuntimeError(
                f"Kiki output invalid after {len(result.attempts)} attempts: {result.errors}"
            )

        if result.repaired:
            logging.info(
                "Kiki output repaired (%s): %s",
                result.format,
                result.strategies_applied,
            )
        else:
            logging.info("Kiki output valid (no repair needed)")

        return result.data

    @modal.method()
    async def generate(
        self,
        text: str,
        language_id: str = "en",
        cfg_weight: float = 0.2,
        exaggeration: float = 1.0,
    ) -> bytes:
        if not os.path.exists(AUDIO_PROMPT_PATH):
            raise FileNotFoundError(
                f"Audio prompt not found at {AUDIO_PROMPT_PATH}. "
                "Run `modal run chatterbox_runner.py::upload_to_clone` first."
            )
        return await self._chatterbox.request(
            text=text,
            language_id=language_id,
            cfg_weight=cfg_weight,
            exaggeration=exaggeration,
        )

    @modal.exit()
    def cleanup(self):
        print("Combined server shutting down")
        self._chatterbox.stop()
        if hasattr(self, "_ollama_process"):
            self._ollama_process.terminate()
            self._ollama_process.wait()


_warmed_up = asyncio.Event()
_IMPORTANT_ACTIVE = False


@app.local_entrypoint()
async def main(
    host: str = "localhost",
    audio_port: int = AUDIO_PORT,
    kiki_port: int = KIKI_WEB_PORT,
):
    from shared.bus_receiver import run_receiver

    install_bus_logging("[Heavy]")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stdout,
    )

    async def _on_control_important(msg: dict) -> None:
        global _IMPORTANT_ACTIVE
        if msg.get("op") != "important":
            return
        _IMPORTANT_ACTIVE = bool(msg.get("importantActive"))
        print(f"[Heavy] Important mode {'enabled' if _IMPORTANT_ACTIVE else 'disabled'}")

    _receiver_task = await run_receiver({"control": _on_control_important})
    print("[Heavy] Bus receiver started")

    server = CombinedServer()

    async def _warmup_audio():
        logging.info("Warming up Chatterbox TTS...")
        try:
            await asyncio.wait_for(
                server.generate.remote.aio("warmup"),
                timeout=600,
            )
        except Exception:
            logging.exception("Chatterbox warmup failed")

    async def _warmup_kiki():
        logging.info("Warming up Kiki...")
        try:
            await asyncio.wait_for(
                server.chat.remote.aio("system: warmup", 300),
                timeout=600,
            )
        except Exception:
            logging.exception("Kiki warmup failed")

    await asyncio.gather(_warmup_audio(), _warmup_kiki())
    _warmed_up.set()
    logging.info("Warmup complete, server ready")

    import aiohttp.web

    async def handle_generate(request: aiohttp.web.Request) -> aiohttp.web.Response:
        if _IMPORTANT_ACTIVE:
            return aiohttp.web.Response(status=503, text="important mode")
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

    async def handle_kiki(request: aiohttp.web.Request) -> aiohttp.web.Response:
        if _IMPORTANT_ACTIVE:
            return aiohttp.web.Response(status=503, text="important mode")
        if not _warmed_up.is_set():
            return aiohttp.web.Response(
                text='{"error": "Server warming up"}',
                status=500,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            )

        message = request.query.get("message")
        if not message:
            logging.warning("Message field is empty")
            return aiohttp.web.Response(
                text="Message field is empty",
                status=400,
            )
        try:
            obj = await server.chat.remote.aio(message)

            body = json.dumps(
                {
                    "kamoji": obj.get("kamoji", "(=^･ω･^=)"),
                    "emoji": obj.get("emoji", "❤️"),
                    "rating": max(RATING_MIN, min(RATING_MAX, obj.get("rating", 0))),
                    "pin_worthy": obj.get("pin_worthy", False),
                }
            )
            return aiohttp.web.Response(
                text=body,
                status=200,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            )
        except Exception:
            logging.exception("Error while prompting Kiki")
            return aiohttp.web.Response(
                text='{"error": "Guh"}',
                status=500,
            )

    audio_app = aiohttp.web.Application()
    audio_app.router.add_post("/generate-audio/", handle_generate)
    audio_runner = aiohttp.web.AppRunner(audio_app)
    await audio_runner.setup()
    audio_site = aiohttp.web.TCPSite(audio_runner, host, audio_port)
    await audio_site.start()
    print(f"Chatterbox interactor listening on http://{host}:{audio_port}/")

    kiki_app = aiohttp.web.Application()
    kiki_app.router.add_get("/", handle_kiki)
    kiki_runner = aiohttp.web.AppRunner(kiki_app)
    await kiki_runner.setup()
    kiki_site = aiohttp.web.TCPSite(kiki_runner, host, kiki_port)
    await kiki_site.start()
    print(f"Kiki interactor listening on http://{host}:{kiki_port}/")

    try:
        await asyncio.Event().wait()
    finally:
        await asyncio.gather(audio_runner.cleanup(), kiki_runner.cleanup())
