"""
Communication tool
"""

import websockets
from typing import Literal
from pydantic import BaseModel, Field
from pydantic_ai import Tool

from config import MakiConfig
from actions import TerminatingAction


class Segment(BaseModel):
    text: str = Field(description="The text for this segment")
    speed: int = Field(
        ge=1,
        le=200,
        description="Characters-per-second reveal speed for this segment (1-200, higher = faster). Use low speeds (5-20) for dramatic/suspenseful moments and high speeds (60-150) for excitement or rapid-fire delivery.",
    )


class MakiLoading(BaseModel):
    type: Literal["makiloading"] = "makiloading"


class MakiActivated(BaseModel):
    type: Literal["makiactivated"] = "makiactivated"
    state: bool


class MakiOutputMessage(BaseModel):
    type: Literal["makioutputmessage"] = "makioutputmessage"
    message: str | None = None
    dismiss_after: int
    segments: list[Segment] | None = None


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
        self, segments: list[Segment], dismiss_after: int
    ) -> TerminatingAction:
        """Sends a message to the user. This is your only way to communicate with the user.

        Split your text into segments to control the reveal pacing — use slow speeds
        (5-20) for dramatic pauses, suspense, or deadpan delivery, medium speeds
        (30-60) for normal conversation, and fast speeds (80-150) for excitement,
        rapid-fire quips, or hype moments. Varying speeds within one message makes
        your delivery feel alive and expressive. Every message should use at least
        one speed change unless it's a trivial one-liner.

        Args:
            segments: A list of Segment objects, each with text and reveal speed (chars/sec, 1-200).
            dismiss_after: How long the entire message stays on screen (10-60 seconds).

        Returns:
            TerminatingAction: This is a terminal function call
        """
        print(
            f"[COMMUNICATOR] Intending to send {len(segments)} segments to dismiss after {dismiss_after}"
        )
        clamped_segments = [
            Segment(text=s.text, speed=max(1, min(200, s.speed))) for s in segments
        ]
        await self._ws_send(
            MakiOutputMessage(
                segments=clamped_segments,
                dismiss_after=max(0, min(60, dismiss_after)),
            ).model_dump_json()
        )
        return TerminatingAction()

    def get_tools(self) -> list[Tool]:
        return [Tool(self.inform_output, takes_ctx=False)]
