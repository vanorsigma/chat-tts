from pydantic import BaseModel, Field, field_validator
from pydantic_ai import Agent, BinaryContent, ModelSettings, Tool
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from .config import SummariserConfig
from .memory import Memory

CORRECTION_SYSTEM_PROMPT = (
    "You fix obvious ASR mistakes in a live stream transcript: homophones, "
    "repeated words, and lost punctuation. Do not paraphrase, summarise, or add "
    "content. Output only the corrected transcript, with no commentary."
)

SUMMARY_SYSTEM_PROMPT = (
    "You summarise the current proceedings of a live Twitch stream.\n\n"
    "- The current chat and corrected microphone transcript are the primary "
    "subject; summarise them.\n"
    "- Previous summaries are context only and decay with age: treat older "
    "entries as lower-weight, and let the current proceedings always dominate.\n"
    "- Use the screenshot only to correct factual details; never invent detail "
    "from it.\n"
    "- Output exactly one paragraph: no headings, lists, or markdown, and stay "
    "within Twitch's 500-character chat limit.\n"
    "- You may call recall_summaries to pull older context before writing."
)


class SummaryOut(BaseModel):
    summary: str = Field(min_length=1, max_length=498)

    @field_validator("summary", mode="before")
    @classmethod
    def one_paragraph(cls, v: str) -> str:
        return " ".join(str(v).split())


class SummaryAgent:
    def __init__(self, config: SummariserConfig, memory: Memory) -> None:
        self._memory = memory
        provider = OpenRouterProvider(api_key=config.openrouter_api_key)
        self._agent = Agent(
            OpenRouterModel(model_name=config.summary_model, provider=provider),
            output_type=SummaryOut,
            tools=[Tool(self.recall_summaries, takes_ctx=False)],
            system_prompt=SUMMARY_SYSTEM_PROMPT,
            model_settings=ModelSettings(max_tokens=config.max_tokens),
            retries=3,
        )
        self._correction_agent = Agent(
            OpenRouterModel(model_name=config.correction_model, provider=provider),
            output_type=str,
            system_prompt=CORRECTION_SYSTEM_PROMPT,
        )

    async def recall_summaries(self, query: str) -> str:
        """Recall older summaries across streams that are relevant to a query.

        Args:
            query: What to look for in the stored summaries.
        """
        return await self._memory.recall(query)

    async def correct_transcript(self, raw: str) -> str:
        if not raw.strip():
            return raw
        try:
            result = await self._correction_agent.run(raw)
            return result.output.strip() or raw
        except Exception as e:
            print(f"[SUMMARISER] Transcript correction failed: {e}")
            return raw

    async def generate(
        self,
        chat: str,
        transcript: str,
        previous: list[str],
        screenshot: BinaryContent | None,
    ) -> str:
        """Generate one paragraph. `previous` is newest-first, as Memory.history returns."""
        prompt = self._build_prompt(chat, transcript, previous)
        content = [prompt] if screenshot is None else [prompt, screenshot]
        result = await self._agent.run(content)
        return result.output.summary

    @staticmethod
    def _build_prompt(chat: str, transcript: str, previous: list[str]) -> str:
        previous_block = (
            "\n".join(f"- {entry}" for entry in reversed(previous)) or "(none yet)"
        )
        return (
            "Current chat:\n"
            f"{chat.strip() or '(no chat)'}\n\n"
            "Current microphone transcript (corrected):\n"
            f"{transcript.strip() or '(no speech)'}\n\n"
            "Previous summaries for this category, oldest first "
            "(older entries are lower-weight context):\n"
            f"{previous_block}"
        )
