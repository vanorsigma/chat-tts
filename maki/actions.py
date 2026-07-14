from pydantic import BaseModel
from typing import Literal


class TerminatingAction(BaseModel):
    """Returned by a tool to indicate the agent run is complete."""

    done: Literal[True] = True
