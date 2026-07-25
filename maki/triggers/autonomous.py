import asyncio
import random

from triggers.base import Priority, Trigger, TriggerContext
from audio import capture_utterance
from prompts import AUTONOMOUS_ADDENDUM


class AutonomousTimer:
    MEAN_S = 900
    SD_S = 300
    MIN_S = 1
    MAX_S = 1800

    def sample_delay(self) -> int:
        return max(
            self.MIN_S, min(self.MAX_S, int(random.gauss(self.MEAN_S, self.SD_S)))
        )


_AUTONOMOUS_TEXT_FALLBACK = (
    "You have autonomously activated. The streamer is unaware. "
    "Gather context (screenshot/chat) and perform one funny action, "
    "then terminate via inform_output."
)


class AutonomousTrigger(Trigger):
    name = "Autonomous"
    priority = Priority.AUTONOMOUS

    def __init__(self, timer: AutonomousTimer | None = None) -> None:
        self._timer = timer or AutonomousTimer()

    async def arm(self) -> TriggerContext:
        delay = self._timer.sample_delay()
        print(f"[AUTONOMOUS] Timer set for {delay}s ({delay/60:.1f} min)")
        await asyncio.sleep(delay)
        print("[AUTONOMOUS] Timer fired")
        try:
            audio = await asyncio.wait_for(capture_utterance(), timeout=8)
            return TriggerContext(
                priority=self.priority,
                modality="audio",
                prompt=audio,
                addendum_prompt=AUTONOMOUS_ADDENDUM,
            )
        except (asyncio.TimeoutError, RuntimeError) as e:
            print(f"[AUTONOMOUS] Audio capture failed ({e}); using text fallback")
            return TriggerContext(
                priority=self.priority,
                modality="text",
                prompt=_AUTONOMOUS_TEXT_FALLBACK,
                addendum_prompt=AUTONOMOUS_ADDENDUM,
            )
