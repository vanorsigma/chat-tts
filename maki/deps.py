from __future__ import annotations
from dataclasses import dataclass, field

from config import MakiConfig
from tools.communication import Communication
from tools.twitch import TwitchTool, TwitchChatClient
from tools.screenshot import ScreenshotTool
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from memory import Memory


@dataclass
class MakiDeps:
    config: MakiConfig
    twitch: TwitchTool
    twitch_chat: TwitchChatClient
    communication: Communication
    screenshot: ScreenshotTool
    memory: Memory
    autonomous: bool = False
    recall_context: str = field(default="")
