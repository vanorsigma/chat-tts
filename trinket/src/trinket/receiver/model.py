"""
Models for the receiver. This models the communication stuff received
by the WebSocket.
"""

from dataclasses import dataclass, field
from typing import Any, Literal, Union

from dataclasses_json import DataClassJsonMixin, config


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
    value: dict[Any, Any],
) -> Union[CancelSubcommand, DistractSubcommand, RotateSubcommand]:
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

    type: Literal["trinket"] = "trinket"
    command: Union[CancelSubcommand, DistractSubcommand, RotateSubcommand] = field(
        default_factory=CancelSubcommand,
        metadata=config(decoder=_subcommand_deserializer),
    )
