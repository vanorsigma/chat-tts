from dataclasses import dataclass

from config import MakiConfig
from tools.communication import Communication
from tools.search import SearchTool
from tools.twitch import TwitchTool, TwitchChatClient
from tools.screenshot import ScreenshotTool


@dataclass
class MakiDeps:
    config: MakiConfig
    twitch: TwitchTool
    twitch_chat: TwitchChatClient
    communication: Communication
    search: SearchTool
    screenshot: ScreenshotTool
