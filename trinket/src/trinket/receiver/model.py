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
    Cancels any ongoing distractions
    """
    annoyance: float
    type: Literal["distract"] = "distract"

def _subcommand_deserializer(value: dict[Any, Any]) -> Union[CancelSubcommand, DistractSubcommand]:
    match value.get("type"):
        case "cancel":
            return CancelSubcommand.from_dict(value)
        case "distract":
            return DistractSubcommand.from_dict(value)
        case _:
            raise ValueError("Invalid type")

@dataclass
class Command(DataClassJsonMixin):
    """
    A trinket command from the websocket
    """
    command: Union[CancelSubcommand, DistractSubcommand] \
        = field(default_factory=CancelSubcommand.from_dict,
                metadata=config(decoder=_subcommand_deserializer))
    type: Literal["trinket"] = "trinket"
