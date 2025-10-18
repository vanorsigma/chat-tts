"""
Things mhm
"""

from typing import Literal

from pydantic import BaseModel


class WSRequest(BaseModel):
    """
    Request for a checkin message
    Example: {"type": "checkinrequest", "username": "mayoigo_qwq"}
    """

    type: Literal["checkinrequest"] = "checkinrequest"
    username: str


class WSResponse(BaseModel):
    """
    Responds with a message given a username.
    """

    type: Literal["checkinresponse"] = "checkinresponse"
    username: str
    message: str


class WSClearResponse(BaseModel):
    """
    Signals to the overlay that this particular username's checkin has been read
    """

    type: Literal["checkincleared"] = "checkincleared"
    username: str
