import asyncio
import json
import uuid
from collections import deque
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Any

import chromadb
from openai import AsyncOpenAI

EmbedFn = Callable[[list[str]], Awaitable[list[list[float]]]]

EMBED_MODEL = "openai/text-embedding-3-small"
COLLECTION_NAME = "summaries"
RECALL_K = 5
DB_PATH = Path(__file__).parents[2] / ".summaries"


def oldest_ids_to_prune(entries: list[tuple[str, float]], keep: int) -> list[str]:
    """Return the ids to delete so only the newest `keep` entries remain."""
    ordered = sorted(entries, key=lambda entry: entry[1], reverse=True)
    return [entry_id for entry_id, _ in ordered[keep:]]


def _created_at(metadata: Mapping[str, Any] | None) -> float:
    value = (metadata or {}).get("created_at", 0)
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


def category_where(category: str, stream_id: str | None) -> dict[str, Any]:
    if stream_id is None:
        return {"category": category}
    return {"$and": [{"category": category}, {"stream_id": stream_id}]}


class EphemeralStore:
    """In-memory rolling summaries for blacklisted categories, keyed by stream id."""

    def __init__(self, maxlen: int) -> None:
        self._stream_id: str | None = None
        self._entries: deque[tuple[str, int]] = deque(maxlen=maxlen)

    def _sync(self, stream_id: str | None) -> None:
        if stream_id is not None and stream_id != self._stream_id:
            self._entries.clear()
            self._stream_id = stream_id

    def add(self, stream_id: str | None, text: str, created_at: int) -> None:
        self._sync(stream_id)
        self._entries.append((text, created_at))

    def latest(self, stream_id: str | None) -> tuple[str, int] | None:
        self._sync(stream_id)
        return max(self._entries, key=lambda entry: entry[1], default=None)

    def history(self, stream_id: str | None) -> list[tuple[str, int]]:
        self._sync(stream_id)
        return sorted(self._entries, key=lambda entry: entry[1], reverse=True)


class SummaryStore:
    """Persistent rolling ChromaDB store of summaries, pruned per category."""

    def __init__(self, embed_fn: EmbedFn, rolling_window_size: int) -> None:
        self._embed_fn = embed_fn
        self._rolling_window_size = rolling_window_size
        self._collection: chromadb.Collection | None = None
        self._init_lock = asyncio.Lock()
        self._lock = asyncio.Lock()

    async def _get_collection(self) -> chromadb.Collection:
        if self._collection is None:
            async with self._init_lock:
                if self._collection is None:
                    client = await asyncio.to_thread(
                        chromadb.PersistentClient, path=str(DB_PATH)
                    )
                    self._collection = await asyncio.to_thread(
                        client.get_or_create_collection, name=COLLECTION_NAME
                    )
        collection = self._collection
        if collection is None:
            raise RuntimeError("summary collection failed to initialize")
        return collection

    async def add(
        self, text: str, category: str, created_at: int, stream_id: str | None
    ) -> None:
        try:
            collection = await self._get_collection()
            embedding = (await self._embed_fn([text]))[0]
            metadata: dict[str, Any] = {"category": category, "created_at": created_at}
            if stream_id is not None:
                metadata["stream_id"] = stream_id

            async with self._lock:
                await asyncio.to_thread(
                    collection.add,
                    documents=[text],
                    embeddings=[embedding],
                    metadatas=[metadata],
                    ids=[str(uuid.uuid4())],
                )
            await self._prune_category(category)
        except Exception as e:
            print(f"[MEMORY] Failed to store summary: {e}")

    async def _prune_category(self, category: str) -> None:
        collection = await self._get_collection()
        async with self._lock:
            data = await asyncio.to_thread(
                collection.get,
                where=category_where(category, None),
                include=["metadatas"],
            )
            ids = data["ids"]
            metadatas = data["metadatas"] or []
            entries = [
                (entry_id, _created_at(meta)) for entry_id, meta in zip(ids, metadatas)
            ]
            to_delete = oldest_ids_to_prune(entries, self._rolling_window_size)
            if to_delete:
                await asyncio.to_thread(collection.delete, ids=to_delete)

    async def latest(
        self, category: str, stream_id: str | None = None
    ) -> tuple[str, int, str | None] | None:
        entries = await self._category_entries(category, stream_id)
        return max(entries, key=lambda entry: entry[1], default=None)

    async def history(self, category: str) -> list[tuple[str, int]]:
        entries = await self._category_entries(category)
        entries.sort(key=lambda entry: entry[1], reverse=True)
        return [(text, created_at) for text, created_at, _ in entries]

    async def _category_entries(
        self, category: str, stream_id: str | None = None
    ) -> list[tuple[str, int, str | None]]:
        collection = await self._get_collection()
        async with self._lock:
            data = await asyncio.to_thread(
                collection.get,
                where=category_where(category, stream_id),
                include=["documents", "metadatas"],
            )
        documents = data["documents"] or []
        metadatas = data["metadatas"] or []
        entries: list[tuple[str, int, str | None]] = []
        for document, meta in zip(documents, metadatas):
            sid = (meta or {}).get("stream_id")
            entries.append(
                (
                    str(document),
                    int(_created_at(meta)),
                    sid if isinstance(sid, str) else None,
                )
            )
        return entries

    async def recall(self, query: str) -> str:
        try:
            collection = await self._get_collection()
            count = await asyncio.to_thread(collection.count)
            if count == 0:
                return ""
            query_embedding = (await self._embed_fn([query]))[0]
            async with self._lock:
                results = await asyncio.to_thread(
                    collection.query,
                    query_embeddings=[query_embedding],
                    n_results=min(RECALL_K, count),
                )
            if results["documents"] and results["documents"][0]:
                return json.dumps(results["documents"][0])
        except Exception as e:
            print(f"[MEMORY] Recall failed: {e}")
        return ""


class Memory:
    """Routes summaries to the persistent store or the blacklisted ephemeral store."""

    def __init__(
        self,
        openrouter_api_key: str,
        rolling_window_size: int,
        blacklisted_categories: list[str],
    ) -> None:
        self._api_key = openrouter_api_key
        self._blacklist = {category.lower() for category in blacklisted_categories}
        self._client: AsyncOpenAI | None = None
        self._store = SummaryStore(
            embed_fn=self._embed, rolling_window_size=rolling_window_size
        )
        self._ephemeral = EphemeralStore(maxlen=rolling_window_size)

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self._api_key,
            )
        return self._client

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        response = await self._get_client().embeddings.create(
            model=EMBED_MODEL, input=texts
        )
        return [item.embedding for item in response.data]

    def is_blacklisted(self, category: str) -> bool:
        return category.lower() in self._blacklist

    async def add(
        self, category: str, stream_id: str | None, text: str, created_at: int
    ) -> None:
        if self.is_blacklisted(category):
            self._ephemeral.add(stream_id, text, created_at)
        else:
            await self._store.add(text, category, created_at, stream_id)

    async def latest(
        self, category: str, stream_id: str | None
    ) -> tuple[str, int, str | None] | None:
        if self.is_blacklisted(category):
            entry = self._ephemeral.latest(stream_id)
            return None if entry is None else (*entry, stream_id)
        return await self._store.latest(category, stream_id)

    async def history(self, category: str, stream_id: str | None) -> list[str]:
        if self.is_blacklisted(category):
            return [text for text, _ in self._ephemeral.history(stream_id)]
        return [text for text, _ in await self._store.history(category)]

    async def recall(self, query: str) -> str:
        return await self._store.recall(query)
