import sys
from pathlib import Path

from openai import AsyncOpenAI
from pydantic_ai import Tool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.memory_store import MemoryStore

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
