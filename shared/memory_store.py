from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import Awaitable
from typing import Any, Callable, Mapping

import chromadb

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
        self._client: chromadb.PersistentClient | None = None
        self._collection: chromadb.Collection | None = None
        self._lock = asyncio.Lock()

    async def _get_collection(self) -> chromadb.Collection:
        if self._collection is None:
            self._client = await asyncio.to_thread(
                chromadb.PersistentClient, path=self._db_path
            )
            self._collection = await asyncio.to_thread(
                self._client.get_or_create_collection, name=self._collection_name
            )
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
            all_data = await asyncio.to_thread(
                collection.get, include=["metadatas"]
            )
            ids = all_data["ids"]
            metadatas = all_data["metadatas"]
            if not ids or metadatas is None:
                return
            stale_ids = [
                aid
                for aid, meta in zip(ids, metadatas)
                if meta.get("created_at", 0) < cutoff
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
            all_data = await asyncio.to_thread(
                collection.get, include=["metadatas"]
            )
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
