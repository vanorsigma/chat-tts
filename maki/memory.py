from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import Awaitable
from pathlib import Path
from typing import Any, Callable, Mapping

import chromadb
from openai import AsyncOpenAI
from pydantic_ai import Tool

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


EMBED_MODEL = "openai/text-embedding-3-small"
MEMORIES_DB_PATH = ".maki_memories"
COLLECTION_NAME = "memories"
RECALL_K = 5
MAX_MEMORIES = 1000
TTL_DAYS = 90


class Memory:
    def __init__(self, openrouter_api_key: str) -> None:
        self._api_key = openrouter_api_key
        self._client: AsyncOpenAI | None = None
        db_path = str(Path(__file__).parent / MEMORIES_DB_PATH)
        self._store = MemoryStore(
            db_path=db_path,
            collection_name=COLLECTION_NAME,
            embed_fn=self._embed,
            max_memories=MAX_MEMORIES,
            recall_k=RECALL_K,
            ttl_days=TTL_DAYS,
        )

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self._api_key,
            )
        return self._client

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        client = self._get_client()
        resp = await client.embeddings.create(model=EMBED_MODEL, input=texts)
        return [d.embedding for d in resp.data]

    async def recall(self, query: str) -> str:
        return await self._store.recall(query)

    async def add(self, content: str) -> None:
        await self._store.add(content)

    async def prune_expired(self) -> None:
        await self._store.prune_expired()

    async def remember_memory(self, content: str) -> str:
        """Store an important event, fact, or interaction into long-term memory for future recall.

        Use this sparingly -- only when vanor, a chatter, or the current exchange produced
        something actually worth remembering. Good candidates:
        - A fact about vanor (preferences, opinions, what game they're playing)
        - A recurring joke or nickname that chatters or vanor use
        - A milestone (e.g., "vanor hit 100 viewers", "just raided X")
        - A notable outcome of your own autonomous mischief (title that worked, what you tweeted)
        - Context you had to fight to discover and will likely need again

        Do NOT store trivialities, one-off greetings, or duplicate facts. At most one call per turn.

        Args:
            content: A concise description of what to remember (1-3 sentences in natural language).
        """
        await self._store.add(content)
        print(f"[MEMORY] Stored: {content[:120]}{'...' if len(content) > 120 else ''}")
        return f"Memory stored: {content}"

    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.remember_memory, takes_ctx=False),
        ]
