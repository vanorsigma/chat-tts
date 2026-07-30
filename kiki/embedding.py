"""
Standalone Modal deployment for the embedding and memory server.

Formerly part of kiki.py; extracted so Kiki's chat path no longer
carries memory.  Provides:
  - EmbeddingServer   (GPU Modal class, ollama + nomic-embed-text-v2-moe)
  - MemoryStore       (local ChromaDB, recalls and stores vector memories)
  - Local interactor  (aiohttp on :9125 with /recall and /add)

Usage:
  Deploy:     modal deploy kiki/embedding.py
  Run local:  modal run kiki/embedding.py   (interactor on :9125)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
import time
import uuid
from collections.abc import Awaitable
from typing import Any, Callable, Mapping

import aiohttp.web
import chromadb
import modal

from shared.bus_receiver import run_receiver
from chromadb.api import ClientAPI
from openai import AsyncOpenAI

import builtins
import re

BUS_URL = "ws://localhost:3001/senders"

_bus_queue: asyncio.Queue | None = None
_bus_task: asyncio.Task | None = None
_bus_hijacked = False
_bus_prefix: str = ""
_original_print = builtins.print


def _strip_ansi(s: str) -> str:
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


PORT = 8000
MINUTES = 60

EMBED_MODEL_NAME = "nomic-embed-text-v2-moe"
WEB_PORT = 9125
TIMEOUT_SECS = 5.0

MEMORIES_DB_PATH = ".kiki_memories"
COLLECTION_NAME = "memories"
RECALL_K = 5
MAX_MEMORIES = 1000

_embed_handle: EmbeddingServer | None = None
_warmed_up = asyncio.Event()
_IMPORTANT_ACTIVE = False

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

app = modal.App("kiki-embedding")


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


def _get_embed() -> EmbeddingServer:
    global _embed_handle
    if _embed_handle is None:
        _embed_handle = EmbeddingServer()
    return _embed_handle


EmbedFn = Callable[[list[str]], Awaitable[list[list[float]]]]


class MemoryStore:
    def __init__(
        self,
        db_path: str,
        collection_name: str,
        embed_fn: EmbedFn,
        max_memories: int = 1000,
        recall_k: int = 5,
        ttl_days: int = 90,
    ) -> None:
        self._db_path = db_path
        self._collection_name = collection_name
        self._embed_fn = embed_fn
        self._max_memories = max_memories
        self._recall_k = recall_k
        self._ttl_days = ttl_days
        self._client: ClientAPI | None = None
        self._collection: chromadb.Collection | None = None
        self._lock = asyncio.Lock()

    async def _get_collection(self) -> chromadb.Collection:
        if self._collection is None:
            self._client = await asyncio.to_thread(
                chromadb.PersistentClient, path=self._db_path
            )
            assert self._client is not None
            self._collection = await asyncio.to_thread(
                self._client.get_or_create_collection, name=self._collection_name
            )
        assert self._collection is not None
        return self._collection

    async def recall(self, query: str) -> str:
        try:
            collection = await self._get_collection()
            count = await asyncio.to_thread(collection.count)
            if count == 0:
                return ""

            query_emb = (await self._embed_fn([query]))[0]
            async with self._lock:
                results = await asyncio.to_thread(
                    collection.query,
                    query_embeddings=[query_emb],
                    n_results=min(self._recall_k, count),
                )
            if results["documents"] and results["documents"][0]:
                return json.dumps(results["documents"][0])
        except Exception:
            import traceback

            traceback.print_exc()
        return ""

    async def add(
        self, content: str, metadata: Mapping[str, Any] | None = None
    ) -> None:
        try:
            collection = await self._get_collection()
            count = await asyncio.to_thread(collection.count)
            if count >= self._max_memories:
                await self._prune_oldest()

            emb = (await self._embed_fn([content]))[0]
            meta = dict(metadata) if metadata else {}
            meta.setdefault("created_at", time.time())

            async with self._lock:
                await asyncio.to_thread(
                    collection.add,
                    documents=[content],
                    embeddings=[emb],
                    metadatas=[meta],
                    ids=[str(uuid.uuid4())],
                )
        except Exception:
            import traceback

            traceback.print_exc()

    async def prune_expired(self) -> None:
        try:
            collection = await self._get_collection()
            cutoff = time.time() - self._ttl_days * 86400
            all_data = await asyncio.to_thread(collection.get, include=["metadatas"])
            ids = all_data["ids"]
            metadatas = all_data["metadatas"]
            if not ids or metadatas is None:
                return
            stale_ids = [
                aid
                for aid, meta in zip(ids, metadatas)
                if _meta_created_at(meta) < cutoff
            ]
            if stale_ids:
                async with self._lock:
                    await asyncio.to_thread(collection.delete, ids=stale_ids)
        except Exception:
            import traceback

            traceback.print_exc()

    async def _prune_oldest(self) -> None:
        try:
            collection = await self._get_collection()
            all_data = await asyncio.to_thread(collection.get, include=["metadatas"])
            ids = all_data["ids"]
            metadatas = all_data["metadatas"]
            if not ids or metadatas is None:
                return
            paired = sorted(
                zip(ids, metadatas),
                key=lambda x: _meta_created_at(x[1]),
            )
            to_remove = max(0, len(paired) - self._max_memories + 5)
            if to_remove > 0:
                async with self._lock:
                    await asyncio.to_thread(
                        collection.delete,
                        ids=[pid for pid, _ in paired[:to_remove]],
                    )
        except Exception:
            import traceback

            traceback.print_exc()


def _meta_created_at(meta: Mapping[str, Any]) -> float:
    v = meta.get("created_at", 0)
    if isinstance(v, (int, float)):
        return float(v)
    return 0.0


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


async def handle_recall(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if _IMPORTANT_ACTIVE:
        return aiohttp.web.Response(status=503, text="important mode")
    if not _warmed_up.is_set():
        return aiohttp.web.Response(
            text='{"error": "Server warming up"}',
            status=500,
            content_type="application/json",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )

    query = request.query.get("query")
    if not query:
        return aiohttp.web.Response(
            text='{"error": "query required"}',
            status=400,
            content_type="application/json",
        )

    try:
        docs = await _memory_store.recall(query)
        return aiohttp.web.Response(
            text=docs if docs else "[]",
            status=200,
            content_type="application/json",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except Exception:
        logging.exception("Recall failed")
        return aiohttp.web.Response(
            text='{"error": "recall failed"}',
            status=500,
            content_type="application/json",
        )


async def handle_add(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if _IMPORTANT_ACTIVE:
        return aiohttp.web.Response(status=503, text="important mode")
    if not _warmed_up.is_set():
        return aiohttp.web.Response(
            text='{"error": "Server warming up"}',
            status=500,
            content_type="application/json",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )

    try:
        body = json.loads(await request.read())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return aiohttp.web.Response(
            text='{"error": "invalid json"}',
            status=400,
            content_type="application/json",
        )

    content = body.get("content")
    if not content:
        return aiohttp.web.Response(
            text='{"error": "content required"}',
            status=400,
            content_type="application/json",
        )

    metadata = body.get("metadata", None)

    try:
        await _memory_store.add(str(content), metadata=metadata)
        return aiohttp.web.Response(
            text='{"ok": true}',
            status=200,
            content_type="application/json",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except Exception:
        logging.exception("Add memory failed")
        return aiohttp.web.Response(
            text='{"error": "add failed"}',
            status=500,
            content_type="application/json",
        )


@app.local_entrypoint()
async def main(host: str = "localhost", port: int = WEB_PORT):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stdout,
    )

    install_bus_logging("[Embedding]")

    async def _on_control_important(msg: dict) -> None:
        global _IMPORTANT_ACTIVE
        if msg.get("op") != "important":
            return
        _IMPORTANT_ACTIVE = bool(msg.get("importantActive"))
        print(f"[Embedding] Important mode {'enabled' if _IMPORTANT_ACTIVE else 'disabled'}")

    _receiver_task = await run_receiver({"control": _on_control_important})
    print("[Embedding] Bus receiver started")

    asyncio.create_task(_prune_loop())
    asyncio.create_task(_warmup())

    web_app = aiohttp.web.Application()
    web_app.router.add_get("/recall", handle_recall)
    web_app.router.add_post("/add", handle_add)
    runner = aiohttp.web.AppRunner(web_app)
    await runner.setup()
    site = aiohttp.web.TCPSite(runner, host, port)
    await site.start()
    print(f"Embedding interactor listening on http://{host}:{port}/")

    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()
