"""
Models for the receiver. This models the communication stuff received
by the WebSocket.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Literal, Optional, Union

from dataclasses_json import DataClassJsonMixin, config

logger = logging.getLogger(__name__)


@dataclass
class CancelSubcommand(DataClassJsonMixin):
    """
    Cancels any ongoing trinkets
    """

    type: Literal["cancel"] = "cancel"


@dataclass
class DistractSubcommand(DataClassJsonMixin):
    """
    Starts a distraction
    """

    type: Literal["distract"] = "distract"


@dataclass
class RotateSubcommand(DataClassJsonMixin):
    """
    Begins a rotation
    """

    speed: int
    type: Literal["rotate"] = "rotate"


def _subcommand_deserializer(
    value: Union[dict[Any, Any], CancelSubcommand, DistractSubcommand, RotateSubcommand],
) -> Union[CancelSubcommand, DistractSubcommand, RotateSubcommand]:
    if isinstance(value, (CancelSubcommand, DistractSubcommand, RotateSubcommand)):
        return value
    match value.get("type"):
        case "cancel":
            return CancelSubcommand.from_dict(value)
        case "distract":
            return DistractSubcommand.from_dict(value)
        case "rotate":
            return RotateSubcommand.from_dict(value)
        case _:
            raise ValueError("Invalid type")


@dataclass
class Command(DataClassJsonMixin):
    """
    A trinket command from the websocket
    """

    command: Union[CancelSubcommand, DistractSubcommand, RotateSubcommand] = field(
        metadata=config(decoder=_subcommand_deserializer),
    )
    type: Literal["trinket"] = "trinket"

    @classmethod
    def try_from_bus_message(cls, raw: str) -> Optional["Command"]:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict) or data.get("type") != "trinket":
            return None
        try:
            return cls.from_dict(data)
        except (KeyError, ValueError, TypeError):
            logger.exception("malformed trinket command")
            return None
