from pydantic import BaseModel
from typing import Literal


class TerminatingAction(BaseModel):
    """
    Empty action representing the terminating action
    """

    answer_to_the_universe: Literal["42"]
