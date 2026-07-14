"""
Communication tool
"""

import websockets
from typing import Literal
from pydantic import BaseModel
from pydantic_ai import Tool

from config import MakiConfig
from actions import TerminatingAction


class MakiLoading(BaseModel):
    type: Literal["makiloading"] = "makiloading"


class MakiActivated(BaseModel):
    type: Literal["makiactivated"] = "makiactivated"
    state: bool


class MakiOutputMessage(BaseModel):
    type: Literal["makioutputmessage"] = "makioutputmessage"
    message: str
    dismiss_after: int


class Communication:
    def __init__(self, config: MakiConfig) -> None:
        self.sender_url = config.communication_bus_url
        self.websocket = None

    async def _lazy_init(self) -> bool:
        if self.websocket:
            return True

        try:
            self.websocket = await websockets.connect(self.sender_url)
            print(f"[COMMUNICATION] Connected to WebSocket at {self.sender_url}")
            return True
        except Exception as e:
            print(
                f"[COMMUNICATION] Cannot connect to websocket at {self.sender_url}: {e}"
            )
            self.websocket = None
        return False

    async def _ws_send(self, message: str) -> None:
        """
        Guardless send, do not use externally.

        Args:
            message: The message string to send
        """
        if not await self._lazy_init():
            return

        try:
            assert self.websocket
            await self.websocket.send(message)
        except websockets.exceptions.ConnectionClosed:
            print(f"[COMMUNICATION] Websocket closed, resetting for resiliency")
            self.websocket = None
        except AssertionError:
            print(f"[COMMNICATION] No websocket, would have sent {len(message)} bytes")

    async def inform_loading(self) -> None:
        """
        Informs the user that maki is loading. Not a tool.
        """
        print("[COMMUNICATION] Informing loading")
        await self._ws_send(MakiLoading().model_dump_json())

    async def inform_activated(self, state: bool) -> None:
        """
        Informs the user that maki is activated. Not a tool.
        """
        print("[COMMUNICATION] Informing activated")
        await self._ws_send(MakiActivated(state=state).model_dump_json())

    async def inform_output(
        self, message: str, dismiss_after: int
    ) -> TerminatingAction:
        """Sends a message to the user. This is your only way to communicate with the user.

        Args:
            message: Any natural language message. Remember to keep your bratty personality.
            dismiss_after: A period of time to dismiss the message. Can be anywhere from 10 to 60 seconds.

        Returns:
            TerminatingAction: This is a terminal function call
        """
        print(
            f"[COMMUNICATOR] Intending to send {message} to dismiss after {dismiss_after}"
        )
        await self._ws_send(
            MakiOutputMessage(
                message=message, dismiss_after=max(0, min(60, dismiss_after))
            ).model_dump_json()
        )
        return TerminatingAction()

    def get_tools(self) -> list[Tool]:
        return [Tool(self.inform_output, takes_ctx=False)]
