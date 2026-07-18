"""
Combined Modal deployment for Kiki (chat) and Embedding servers.

Usage:
  Upload models:  modal run kiki.py::upload_models
  Deploy all:     modal deploy kiki.py
  Run interactor: modal run kiki.py
      Starts a local aiohttp server (port 9124) that:
        1) recalls relevant memories from local ChromaDB
        2) calls the embedding server via Modal RPC
        3) prepends recalled memories to the message
        4) sends to the Kiki chat server via Modal RPC
        5) optionally stores a new memory on remember=1
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import aiohttp.web
import modal
from openai import AsyncOpenAI

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
    "4. **Memory Management:** Long-term memories from past interactions will be provided before "
    "each user message. Use them for context when relevant. Consider whether the current exchange "
    "is notable enough to signal for long-term storage.\n"
    "5. **Rating:** Rate the message from -500 to 50 based on how cute/seiso (clean/pure) the "
    "comment is. Seiso comments (wholesome, innocent, adorable) should score higher karma. "
    "Lewd, weird, or mean comments should score lower. Default/neutral is 0.\n"
    "6. **Pin Decision:** Determine whether this message is pin-worthy -- i.e., notable, funny, "
    "sweet, or important enough to pin in chat. Use `pin_worthy: true` if it deserves attention.\n"
    "7. **Remember Signal:** Set `remember: 1` if this exchange contains something worth recalling "
    "long-term (e.g., a fact about a user, a shared joke, a notable event, or a milestone). "
    "Otherwise set `remember: 0`. Avoid saving trivial or repeat information.\n"
    "8. **Thoughts:** Do not spend too much time thinking.\n"
    "\n"
    "## OUTPUT FORMAT\n"
    "Respond ONLY with a single-line JSON object. Do not use Markdown wrappers. Use the `_thought` "
    "key for your required internal reasoning (keep it brief) so the end-user application can "
    'parse the JSON and display only the "kamoji" and "emoji" values.\n'
    "\n"
    "Schema:\n"
    '{"_thought": "Brief reasoning for kaomoji, emoji, memory, rating, and pin decision...", '
    '"kamoji": "...", "emoji": "...", "rating": 0, '
    '"pin_worthy": false, "remember": 0}\n'
    "\n"
    "# EXAMPLE INPUT\n"
    "vanorsigma: kiki you are stinky"
)

MODEL_DIR = "/models"
MODEL_FILE = "kikiv2.Q4_K_M.gguf"

PORT = 8000
MINUTES = 60

MODEL_NAME = "kikiv2"
EMBED_MODEL_NAME = "nomic-embed-text-v2-moe"
RATING_MIN = -500.0
RATING_MAX = 50.0
WEB_PORT = 9124
TIMEOUT_SECS = 5.0

MEMORIES_DB_PATH = ".kiki_memories"
COLLECTION_NAME = "memories"
RECALL_K = 5
MAX_MEMORIES = 1000

_kiki_semaphore = asyncio.Semaphore(3)
_warmed_up = asyncio.Event()


llm_image = (
    modal.Image.from_registry(
        "nvidia/cuda:13.3.0-cudnn-runtime-ubuntu24.04", add_python="3.11"
    )
    .apt_install(["curl", "zstd"])
    .run_commands("curl -fsSL https://ollama.com/install.sh | sh")
    .pip_install(
        [
            "chromadb>=0.6.0",
            "aiohttp>=3.13.2",
            "openai>=2.9.0",
        ]
    )
)

app = modal.App("kiki")

model_vol = modal.Volume.from_name("kiki-models", create_if_missing=True)


@app.local_entrypoint()
def upload_models():
    """Upload kiki to the Modal Volume."""
    local_dir = Path(__file__).parent / "modelfiles"

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


@app.cls(
    image=llm_image,
    gpu="T4",
    scaledown_window=30 * MINUTES,
    startup_timeout=10 * MINUTES,
    volumes={MODEL_DIR: model_vol},
    max_containers=1,
)
class KikiServer:
    @modal.enter()
    def start(self):
        env = os.environ.copy()
        env["OLLAMA_HOST"] = f"0.0.0.0:{PORT}"
        env["OLLAMA_NUM_PARALLEL"] = "3"
        env["OLLAMA_KEEP_ALIVE"] = "-1"
        env["OLLAMA_LOAD_TIMEOUT"] = "30m"

        print("Starting ollama server...")
        self.process = subprocess.Popen(["ollama", "serve"], env=env)

        self._wait_ready()
        print("Server started...")

        self._client = AsyncOpenAI(
            base_url=f"http://localhost:{PORT}/v1",
            api_key="not important",
        )

        modelfile_path = os.path.join(MODEL_DIR, f"{MODEL_NAME}.Modelfile")
        if not os.path.exists(modelfile_path):
            raise RuntimeError(f"Modelfile not found at {modelfile_path}")
        print("Going to try loading the Modelfile...")
        result = subprocess.run(
            ["ollama", "create", MODEL_NAME, "-f", modelfile_path],
            env=env,
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ollama create failed: {result.stderr.decode()}")
        print("Model created:", result.stdout.decode().strip())

    def _wait_ready(self):
        import urllib.request

        deadline = time.time() + 5 * MINUTES
        while time.time() < deadline:
            try:
                urllib.request.urlopen(f"http://localhost:{PORT}/")
                print("Kiki server is ready.")
                return
            except Exception:
                time.sleep(2)
        raise RuntimeError("Kiki server failed to start within timeout")

    @modal.method()
    async def chat(self, content: str, timeout: float | None = None) -> dict:
        if timeout is None:
            timeout = TIMEOUT_SECS
        response = await self._client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
            timeout=timeout,
        )
        choice = response.choices[0].message
        if choice.content is None:
            raise RuntimeError("NoMessage -- AI did not return any messages")
        logging.info("Raw response: %s", choice.content)
        return json.loads(choice.content)

    @modal.exit()
    def stop(self):
        self.process.terminate()
        self.process.wait()


@app.cls(
    image=llm_image,
    gpu="T4",
    scaledown_window=30 * MINUTES,
    startup_timeout=10 * MINUTES,
    max_containers=1,
)
class EmbeddingServer:
    @modal.enter()
    def start(self):
        env = os.environ.copy()
        env["OLLAMA_HOST"] = f"0.0.0.0:{PORT}"
        env["OLLAMA_NUM_PARALLEL"] = "3"
        env["OLLAMA_KEEP_ALIVE"] = "-1"

        print("Starting ollama embedding server...")
        self.process = subprocess.Popen(["ollama", "serve"], env=env)

        self._wait_ready()

        self._client = AsyncOpenAI(
            base_url=f"http://localhost:{PORT}/v1",
            api_key="not important",
        )

        result = subprocess.run(
            ["ollama", "pull", "nomic-embed-text-v2-moe:latest"],
            env=env,
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ollama pull failed: {result.stderr.decode()}")
        print("Embedding model pulled:", result.stdout.decode().strip())

    def _wait_ready(self):
        import urllib.request

        deadline = time.time() + 5 * MINUTES
        while time.time() < deadline:
            try:
                urllib.request.urlopen(f"http://localhost:{PORT}/")
                print("Embedding server is ready.")
                return
            except Exception:
                time.sleep(2)
        raise RuntimeError("Embedding server failed to start within timeout")

    @modal.method()
    async def embed(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.embeddings.create(model=EMBED_MODEL_NAME, input=texts)
        return [d.embedding for d in resp.data]

    @modal.exit()
    def stop(self):
        self.process.terminate()
        self.process.wait()


_kiki_handle: KikiServer | None = None
_embed_handle: EmbeddingServer | None = None


def _get_kiki() -> KikiServer:
    global _kiki_handle
    if _kiki_handle is None:
        _kiki_handle = KikiServer()
    return _kiki_handle


def _get_embed() -> EmbeddingServer:
    global _embed_handle
    if _embed_handle is None:
        _embed_handle = EmbeddingServer()
    return _embed_handle


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.memory_store import MemoryStore

_embed_fn = lambda texts: asyncio.wait_for(
    _get_embed().embed.remote.aio(texts), timeout=1.0
)

_memory_store = MemoryStore(
    db_path=MEMORIES_DB_PATH,
    collection_name=COLLECTION_NAME,
    embed_fn=_embed_fn,
    max_memories=MAX_MEMORIES,
    recall_k=RECALL_K,
)


async def _prune_loop() -> None:
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            await _memory_store.prune_expired()
        except Exception:
            logging.exception("Periodic memory prune failed")


async def _warmup() -> None:
    try:
        logging.info("Warming up Kiki server...")
        kiki_obj = await asyncio.wait_for(
            _get_kiki().chat.remote.aio("system: warmup", 300),
            timeout=600,
        )
        logging.info("Kiki warmup ok: %s", kiki_obj)
    except Exception:
        logging.exception("Kiki warmup failed, warmup aborted")
        return

    try:
        logging.info("Warming up embedding server...")
        embed_vecs = await asyncio.wait_for(
            _get_embed().embed.remote.aio(["warmup"]),
            timeout=300,
        )
        logging.info("Embedding warmup ok (%d vectors)", len(embed_vecs))
    except Exception:
        logging.exception("Embedding warmup failed, warmup aborted")
        return

    _warmed_up.set()
    logging.info("Warmup complete, server ready")


_USERNAME_RE = re.compile(r"^([^:]+):\s*(.*)")


def _parse_username(message: str) -> tuple[str, str]:
    m = _USERNAME_RE.match(message)
    if m:
        return m.group(1), m.group(2)
    return "", message


async def send(message: str) -> str:
    username, raw_message = _parse_username(message)

    recall_json = await _memory_store.recall(message)
    if recall_json:
        content = recall_json + "\n" + message
    else:
        content = message

    async with _kiki_semaphore:
        obj = await _get_kiki().chat.remote.aio(content)

    if obj.get("remember", 0) in (1, True):
        response_text = f'{obj.get("kamoji", "")} {obj.get("emoji", "")}'
        doc_text = f"{username}: {raw_message}\nKiki: {response_text}"
        asyncio.create_task(
            _memory_store.add(
                doc_text,
                {
                    "username": username,
                    "user_message": raw_message,
                    "assistant_response": response_text,
                },
            )
        )

    return json.dumps(
        {
            "kamoji": obj.get("kamoji", "(=^･ω･^=)"),
            "emoji": obj.get("emoji", "❤️"),
            "rating": max(RATING_MIN, min(RATING_MAX, obj.get("rating", 0))),
            "pin_worthy": obj.get("pin_worthy", False),
        }
    )


async def handle(request: aiohttp.web.Request) -> aiohttp.web.Response:
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
        body = await send(message)
        return aiohttp.web.Response(
            text=body,
            status=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except Exception:
        logging.exception("Error while prompting AI")
        return aiohttp.web.Response(
            text='{"error": "Guh"}',
            status=500,
        )


@app.local_entrypoint()
async def main(host: str = "localhost", port: int = WEB_PORT):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import shared.bus_logging as bl

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stdout,
    )

    bl.install_bus_logging("[Kiki]")

    asyncio.create_task(_prune_loop())
    asyncio.create_task(_warmup())

    web_app = aiohttp.web.Application()
    web_app.router.add_get("/", handle)
    runner = aiohttp.web.AppRunner(web_app)
    await runner.setup()
    site = aiohttp.web.TCPSite(runner, host, port)
    await site.start()
    print(f"Kiki interactor listening on http://{host}:{port}/")

    try:
        await asyncio.Event().wait()
    finally:
        if bl._bus_task is not None:
            bl._bus_task.cancel()
            try:
                await bl._bus_task
            except asyncio.CancelledError:
                pass
        import builtins
        builtins.print = bl._original_print
