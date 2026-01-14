"""
Output tool
"""

import json
from typing import TypedDict
from openai.types import Model
from twitchAPI.twitch import Twitch
from twitchAPI.type import AuthScope
from pydantic_ai import ModelRetry, Tool

class ChatterCommand(TypedDict):
    name: str
    description: str

class TwitchTool:
    def __init__(self, config: dict[str, dict[str, str]]) -> None:
        self.config = config
        self.app_id = config['twitch']['client_id']
        self.app_secret = config['twitch']['client_secret']
        self.target_channel = config['twitch']['broadcaster_name']
        self.twitch: Twitch | None = None
        self.broadcaster_id = ''
        self.moderator_id = ''
        self.chatter_commands: list[ChatterCommand] = []

        try:
            with open('commands.json', 'r') as f:
                self.chatter_commands = json.load(f)
        except Exception as e:
            print('WARNING!! Could not load natural langauge descriptions of chat commands', e)
        print(f'[TOOL] Chatter commands loaded: {self.chatter_commands}')

        try:
            with open('twitch_tokens.txt', 'r') as f:
                tokens = f.readlines()
                self.refresh_token = tokens[0].strip()
                self.user_token = tokens[1].strip()
        except:
            raise RuntimeError('create a file called twitch_tokens.txt and put the refresh token there')

    async def _lazy_init(self):
        if self.twitch is not None:
            return

        self.twitch = Twitch(self.app_id, self.app_secret)
        target_scopes = [AuthScope.MODERATOR_READ_CHATTERS, AuthScope.MODERATOR_MANAGE_BANNED_USERS, AuthScope.USER_READ_CHAT, AuthScope.USER_WRITE_CHAT]
        await self.twitch.set_user_authentication(self.user_token, target_scopes, self.refresh_token)

        user_info_gen = self.twitch.get_users(logins=[self.target_channel])
        target_user_info = await anext(user_info_gen) # Get first result
        self.broadcaster_id = target_user_info.id

        my_info = await anext(self.twitch.get_users())
        self.moderator_id = my_info.id

        self.twitch.user_auth_refresh_callback = self._save_token

        print(f"[TOOL] Connected as {my_info.display_name} moderating {target_user_info.display_name}")

    async def _save_token(self, auth_token: str, refresh_token: str):
        print('[TOOL] Twitch token saving')
        with open('twitch_tokens.txt', 'w') as f:
            self.refresh_token = refresh_token
            self.user_token = auth_token
            f.write(f'{self.refresh_token}\n{self.user_token}')

    async def _get_chatter_list(self) -> dict[str, str]:
        await self._lazy_init()
        assert self.twitch is not None
        chatters = await self.twitch.get_chatters(self.broadcaster_id, self.moderator_id)
        return {chatter.user_name: chatter.user_id for chatter in chatters.data}

    async def get_chatter_list(self) -> list[str]:
        """Twitch Tool: Gets the list of chatters
        """
        return list((await self._get_chatter_list()).keys())

    async def timeout(self, username: str, reason: str) -> bool:
        """Twitch Tool: Timeouts a particular user. If you need to time out multiple people, call this multiple times.

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
            raise ModelRetry("chatter doesn't exist, please run get_chatter_list first, then choose the closest username to timeout.")

        user_id = chatter_list[username]

        try:
            await self.twitch.ban_user(
                self.broadcaster_id,
                self.moderator_id,
                user_id,
                reason=f'[MAKI] {reason}',
                duration=30
            )
        except:
            print(f'[TOOL] Could not timeout {username}')
            return False

        print(f'[TOOL] Timed out {username} successfully')
        return True

    async def get_chatter_commands(self) -> str:
        """Twitch Tool: Gets the list of chatter commands

        Returns:
            str: Name, description pairs of valid functions. The command must be exactly the same for it to be ran.
        """
        return str([(command.get('name'), command.get('description')) for command in self.chatter_commands])

    async def perform_chatter_command(self, command: str) -> None:
        """Twitch Tool: Performs a chatter command.

        Args:
            command: A chatter command to perform. This MUST be one of the chatters found in get_chatter_commands.
        """
        if command not in list(command.get('name') for command in self.chatter_commands):
            raise ModelRetry("command doesn't exist, please run get_chatter_commands first, then choose a command to use")

        await self._lazy_init()
        assert self.twitch is not None

        try:
            await self.twitch.send_chat_message(
                self.broadcaster_id,
                self.moderator_id,
                command
            )
        except:
            print(f'[TOOL] Could not send chat message {command}')
            return

        print(f'[TOOL] Sent command {command} successfully')

    async def change_title(self, title: str) -> None:
        """Twitch Tool: Changes the stream title

        Args:
            title: A title to change to. 1 to 60 charactes only
        """
        if not (1 < len(title) < 60):
            raise ModelRetry("title is too long / short, keep it between 1 to 60 characters")

        await self._lazy_init()
        assert self.twitch is not None

        try:
            await self.twitch.send_chat_message(
                self.broadcaster_id,
                self.moderator_id,
                f'!settitle {title}'
            )
        except:
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
                self.broadcaster_id,
                self.moderator_id,
                f'%selfthought {thoughts}'
            )
        except:
            print(f'[TOOL] Could not send self thought')
            return

        print(f'[TOOL] Sent self-thought to {thoughts}')

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
                f"%poll {question};{duration};{';'.join([option.replace(';', ' ') for option in options])}"
            )
        except:
            print(f'[TOOL] Could not start poll')
            return

        print(f'[TOOL] Started poll')

    def get_twitch_tools(self) -> list[Tool]:
        return [
            Tool(self.get_chatter_list, takes_ctx=False),
            Tool(self.timeout, takes_ctx=False),
            Tool(self.get_chatter_commands, takes_ctx=False),
            Tool(self.perform_chatter_command, takes_ctx=False),
            Tool(self.change_title, takes_ctx=False),
            Tool(self.pretend_to_be_vanor, takes_ctx=False),
            Tool(self.make_poll, takes_ctx=False)
        ]

if __name__ == '__main__':
    import tomllib
    import asyncio
    with open('config.toml', "rb") as f:
        config = tomllib.load(f)

    async def bruh():
        print(await twitch.get_chatter_list())
        await twitch.timeout('MrTinus', 'testing smile')
    twitch = TwitchTool(config)
    asyncio.run(bruh())
