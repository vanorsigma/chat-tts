"""
Output tool
"""

import asyncio
import json
import random
import re
import collections
from typing import TypedDict
from twitchAPI.twitch import Twitch
from twitchAPI.type import AuthScope
from pydantic_ai import ModelRetry, Tool

from config import MakiConfig, BotToken


class ChatterCommand(TypedDict):
    name: str
    description: str


def _parse_tier_from_title(title: str) -> int:
    m = re.search(r"[Tt]ier\s*([123])", title)
    return int(m.group(1)) if m else 1


class TwitchChatClient:
    """
    Connects to Twitch IRC anonymously and stores the last 50 messages.
    """

    def __init__(self, channel: str, sub_badge_map: dict[str, int] | None = None):
        self.channel = f"#{channel.lstrip('#')}"
        self.nick = f"justinfan{random.randint(10000, 99999)}"
        self.buffer = collections.deque(maxlen=50)
        self.reader: asyncio.StreamReader | None = None
        self.writer: asyncio.StreamWriter | None = None
        self._listen_task: asyncio.Task[None] | None = None
        self.sub_badge_map: dict[str, int] | None = sub_badge_map
        self.sub_tiers: dict[str, int] = {}

    def set_sub_badge_map(self, m: dict[str, int]) -> None:
        self.sub_badge_map = m

    async def connect(self, loop: asyncio.AbstractEventLoop):
        """Establishes connection and joins the channel."""
        print(
            f"[TWITCH-IRC] Connecting to irc.chat.twitch.tv:6697 as {self.nick} for {self.channel}"
        )
        self.reader, self.writer = await asyncio.open_connection(
            "irc.chat.twitch.tv", 6697, ssl=True
        )

        self.writer.write(f"CAP REQ :twitch.tv/tags\r\n".encode())
        self.writer.write(f"NICK {self.nick}\r\n".encode())
        self.writer.write(f"JOIN {self.channel}\r\n".encode())
        await self.writer.drain()
        print(f"[TWITCH-IRC] Connected and joined {self.channel}")

        self._listen_task = loop.create_task(self._listen())

    def _extract_subscriber_tier(self, badges_value: str) -> int:
        if not badges_value:
            return 0
        for entry in badges_value.split(","):
            entry = entry.strip()
            if entry.startswith("subscriber/"):
                version_id = entry.split("/", 1)[1]
                if self.sub_badge_map and version_id in self.sub_badge_map:
                    return self.sub_badge_map[version_id]
                return 1
        return 0

    async def _listen(self):
        if self.reader is None or self.writer is None:
            print(f"[Twitch TOOL Aux] Unable to create to reader & writer")
            return

        try:
            while not self.reader.at_eof():
                line = await self.reader.readline()
                raw_msg = line.decode("utf-8", errors="ignore").strip()

                if not raw_msg:
                    continue

                if raw_msg.startswith("PING"):
                    self.writer.write(f"PONG {raw_msg.split()[1]}\r\n".encode())
                    await self.writer.drain()

                elif "PRIVMSG" in raw_msg:
                    tags_data: dict[str, str] = {}
                    body = raw_msg
                    if body.startswith("@"):
                        tag_part, body = body.split(" ", 1)
                        for item in tag_part.lstrip("@").split(";"):
                            if "=" in item:
                                k, v = item.split("=", 1)
                                tags_data[k] = v

                    parts = body.split(":", 2)
                    if len(parts) >= 3:
                        user = parts[1].split("!")[0]
                        content = parts[2]
                        display_name = tags_data.get("display-name") or user
                        badges = tags_data.get("badges", "")
                        tier = self._extract_subscriber_tier(badges)

                        self.sub_tiers[display_name] = tier
                        self.buffer.append(
                            {
                                "user": display_name,
                                "message": content,
                                "tier": tier,
                            }
                        )
        except (asyncio.CancelledError, ConnectionError):
            pass

    def get_chat_messages(self) -> list[dict]:
        """Twitch Tool: Gets the last 50 chat messages

        Returns:
            list[dict]: Last 50 messages, each with keys user, message, tier
        """
        return list(self.buffer)

    def get_tier3_messages(self) -> list[dict]:
        return [m for m in self.buffer if m.get("tier", 0) == 3]

    def get_sub_tiers(self) -> dict[str, int]:
        return dict(self.sub_tiers)

    def get_twitch_tools(self) -> list[Tool]:
        return [
            Tool(self.get_chat_messages, takes_ctx=False),
        ]


class TwitchTool:
    def __init__(self, config: MakiConfig, bot_token: BotToken) -> None:
        self.app_id = config.twitch_client_id
        self.app_secret = config.twitch_client_secret
        self.target_channel = config.broadcaster_name
        self.bot_token = bot_token
        self.twitch: Twitch | None = None
        self.broadcaster_id = ""
        self.moderator_id = ""
        self.chatter_commands: list[ChatterCommand] = []

        try:
            with open("commands.json", "r") as f:
                self.chatter_commands = json.load(f)
        except Exception as e:
            print(
                "WARNING!! Could not load natural langauge descriptions of chat commands",
                e,
            )
        print(f"[TOOL] Chatter commands loaded: {self.chatter_commands}")

    async def _lazy_init(self):
        if self.twitch is not None:
            return

        print(f"[TWITCH-API] Initializing Twitch API client")
        self.twitch = Twitch(self.app_id, self.app_secret)
        target_scopes = [
            AuthScope.MODERATOR_READ_CHATTERS,
            AuthScope.MODERATOR_MANAGE_BANNED_USERS,
            AuthScope.USER_WRITE_CHAT,
        ]
        await self.twitch.set_user_authentication(
            self.bot_token.access_token, target_scopes, self.bot_token.refresh_token
        )

        user_info_gen = self.twitch.get_users(logins=[self.target_channel])
        target_user_info = await anext(user_info_gen)
        self.broadcaster_id = target_user_info.id

        my_info = await anext(self.twitch.get_users())
        self.moderator_id = my_info.id

        self.twitch.user_auth_refresh_callback = self._save_token

        print(
            f"[TWITCH-API] Connected as {my_info.display_name} (id={self.moderator_id}) moderating {target_user_info.display_name} (id={self.broadcaster_id})"
        )

    async def _fetch_subscriber_badge_map(self) -> dict[str, int]:
        await self._lazy_init()
        assert self.twitch is not None
        result: dict[str, int] = {}
        try:
            global_badges = await self.twitch.get_global_chat_badges()
            for badge_set in global_badges:
                if badge_set.set_id == "subscriber":
                    for version in badge_set.versions:
                        result[version.id] = _parse_tier_from_title(version.title)

            channel_badges = await self.twitch.get_chat_badges(self.broadcaster_id)
            for badge_set in channel_badges:
                if badge_set.set_id == "subscriber":
                    for version in badge_set.versions:
                        result[version.id] = _parse_tier_from_title(version.title)
        except Exception:
            print(
                f"[TWITCH-API] Failed to fetch subscriber badge map, defaulting to tier 1"
            )
        print(f"[TWITCH-API] Subscriber badge map: {len(result)} versions")
        return result

    async def _save_token(self, auth_token: str, refresh_token: str):
        print("[TWITCH-API] Saving refreshed tokens to twitch_tokens.txt")
        with open("twitch_tokens.txt", "w") as f:
            f.write(f"{refresh_token}\n{auth_token}")
        self.bot_token.access_token = auth_token
        self.bot_token.refresh_token = refresh_token
        print("[TWITCH-API] Tokens saved")

    async def _get_chatter_list(self) -> dict[str, str]:
        await self._lazy_init()
        assert self.twitch is not None
        chatters = await self.twitch.get_chatters(
            self.broadcaster_id, self.moderator_id
        )
        return {chatter.user_name: chatter.user_id for chatter in chatters.data}

    async def get_stream_title_and_game(self) -> tuple[str, str]:
        await self._lazy_init()
        assert self.twitch is not None
        info = await self.twitch.get_channel_information(self.broadcaster_id)
        return info[0].title, info[0].game_name

    async def get_prompt_ctx(self) -> str:
        """
        Gets some context related to the stream for Maki to figure things out
        """
        chatter_list = random.choices(await self.get_chatter_list(), k=50)
        title, game = await self.get_stream_title_and_game()

        return f"Chatters online: {str(chatter_list)}\nCurrent title: {title}\nCurrent game: {game}"

    async def get_chatter_list(self) -> list[str]:
        """Twitch Tool: Gets the list of chatters"""
        return list((await self._get_chatter_list()).keys())

    async def timeout(self, username: str, reason: str) -> bool:
        """Twitch Tool: Timeouts a particular user. If you need to time out multiple people, call this multiple times.
        Note that if this tool fails, it means you do not have permission to timeout that particular user.

        Args:
           username: The username to timeout
           reason: Funny bratty message for the timeout

        Returns:
           bool: Whether the timeout attempt was successful
        """
        await self._lazy_init()
        assert self.twitch is not None
        chatter_list = await self._get_chatter_list()
        if username not in chatter_list.keys():
            raise ModelRetry(
                "chatter doesn't exist, please run get_chatter_list first, then choose the closest username to timeout."
            )

        user_id = chatter_list[username]

        try:
            await self.twitch.ban_user(
                self.broadcaster_id,
                self.moderator_id,
                user_id,
                reason=f"[MAKI] {reason}",
                duration=30,
            )
        except Exception:
            print(f"[TOOL] Could not timeout {username}")
            return False

        print(f"[TOOL] Timed out {username} successfully")
        return True

    async def get_chatter_commands(self) -> str:
        """Twitch Tool: Gets the list of chatter commands

        Returns:
            str: Name, description pairs of valid functions. The command must be exactly the same for it to be ran.
        """
        return str(
            [
                (command.get("name"), command.get("description"))
                for command in self.chatter_commands
            ]
        )

    async def perform_chatter_command(self, command: str) -> None:
        """Twitch Tool: Performs a chatter command.

        Args:
            command: A chatter command to perform. This MUST be one of the chatters found in get_chatter_commands.
        """
        if command not in list(
            command.get("name") for command in self.chatter_commands
        ):
            raise ModelRetry(
                "command doesn't exist, please run get_chatter_commands first, then choose a command to use"
            )

        await self._lazy_init()
        assert self.twitch is not None

        try:
            await self.twitch.send_chat_message(
                self.broadcaster_id, self.moderator_id, command
            )
        except Exception:
            print(f"[TOOL] Could not send chat message {command}")
            return

        print(f"[TOOL] Sent command {command} successfully")

    async def change_title(self, title: str) -> None:
        """Twitch Tool: Changes the stream title. Some common titles, maintain the deprecating style, but do not use directly:
        - lobotomizing my corp
        - worst dev stream in existence
        - cooking mapo tofu with no skills

        Args:
            title: A title to change to. 1 to 60 charactes only
        """
        if not (1 <= len(title) <= 60):
            raise ModelRetry(
                "title is too long / short, keep it between 1 to 60 characters"
            )

        await self._lazy_init()
        assert self.twitch is not None

        try:
            await self.twitch.send_chat_message(
                self.broadcaster_id, self.moderator_id, f"!settitle {title}"
            )
        except Exception:
            print(f'[TOOL] Could not set the title to "{title}"')
            return

        print(f'[TOOL] Set the title to "{title}"')

    async def pretend_to_be_vanor(self, thoughts: str) -> None:
        """General Tool: Pretend to speak as vanor

        Args:
            thoughts: A thought to say as vanor
        """
        await self._lazy_init()
        assert self.twitch is not None

        try:
            await self.twitch.send_chat_message(
                self.broadcaster_id, self.moderator_id, f"%selfthought {thoughts}"
            )
        except Exception:
            print(f"[TOOL] Could not send self thought")
            return

        print(f"[TOOL] Sent self-thought to {thoughts}")

    async def make_poll(self, question: str, options: list[str], duration: int):
        """General Tool: Make a poll for users to interact with

        Args:
            question: The question of the poll
            options: The options in the poll. Cannot have semi-colons in them
            duration: Duration of the poll in seconds
        """
        await self._lazy_init()
        assert self.twitch is not None

        try:
            await self.twitch.send_chat_message(
                self.broadcaster_id,
                self.moderator_id,
                f"%poll {question};{duration};{';'.join([option.replace(';', ' ') for option in options])}",
            )
        except Exception:
            print(f"[TOOL] Could not start poll")
            return

        print(f"[TOOL] Started poll")

    def get_twitch_tools(self) -> list[Tool]:
        return [
            Tool(self.get_chatter_list, takes_ctx=False),
            Tool(self.timeout, takes_ctx=False),
            Tool(self.get_chatter_commands, takes_ctx=False),
            Tool(self.perform_chatter_command, takes_ctx=False),
            Tool(self.change_title, takes_ctx=False),
            Tool(self.pretend_to_be_vanor, takes_ctx=False),
            Tool(self.make_poll, takes_ctx=False),
        ]
