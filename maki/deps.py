from __future__ import annotations
from dataclasses import dataclass, field

from config import MakiConfig
from tools.communication import Communication
from tools.twitch import TwitchTool, TwitchChatClient
from tools.screenshot import ScreenshotTool
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from memory import Memory
    from triggers.base import TriggerContext


@dataclass
class MakiDeps:
    config: MakiConfig
    twitch: TwitchTool
    twitch_chat: TwitchChatClient
    communication: Communication
    screenshot: ScreenshotTool
    memory: Memory
    trigger_context: TriggerContext | None = None
    recall_context: str = field(default="")
