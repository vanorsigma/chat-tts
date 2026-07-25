from triggers.base import Priority, Trigger, TriggerContext
from audio import capture_utterance
from tools.communication import Communication
from wakeword.wakeword import Wakeword


class VadTrigger(Trigger):
    name = "VAD"
    priority = Priority.VAD

    def __init__(self, wakeword: Wakeword, communication: Communication) -> None:
        self._wakeword = wakeword
        self._comm = communication

    async def arm(self) -> TriggerContext:
        await self._wakeword.run_then_return()
        await self._comm.inform_activated(True)
        audio = await capture_utterance()
        await self._comm.inform_loading()
        return TriggerContext(
            priority=self.priority,
            modality="audio",
            prompt=audio,
            addendum_prompt="",
        )
