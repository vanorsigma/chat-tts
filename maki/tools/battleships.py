"""
Battleships Tool.

This is left here as a legacy, and was hastily built for the Jill vs Maki stream.
Maki lost, so that's S3 has a subathon.
"""

import random
import aiohttp
import torch
import numpy as np

import websockets
from typing import Literal
from pydantic import BaseModel
from pydantic_ai import Tool

from config import MakiConfig
from actions import TerminatingAction
from pydantic_ai import ModelRetry, Tool
from battleship.action_mask import QNetwork

from config import MakiConfig

class MakiOutputMessage(BaseModel):
    type: Literal["makioutputmessage"] = "makioutputmessage"
    message: str
    dismiss_after: int

class BattleshipsAPI:
    def __init__(self, base_url: str, token: str):
        self.session = aiohttp.ClientSession(base_url=base_url, headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        })
        self.base_url = base_url.rstrip("/")

    async def get_battleship_state(self):
        response = await self.session.get("/api/battleship/state")
        response.raise_for_status()
        return await response.json()

    async def place_ship(self, row: int, column: int, direction: str, length: int):
        payload = {
            "row": row,
            "column": column,
            "direction": direction,
            "length": length
        }
        response = await self.session.post("/api/battleship/place-ship", json=payload)
        response.raise_for_status()
        return {"status": "success"}

    async def shoot(self, row: int, column: int):
        payload = {
            "row": row,
            "column": column
        }
        response = await self.session.post("/api/battleship/bang", json=payload)
        response.raise_for_status()
        return await response.json()

    async def close(self):
        await self.session.close()


class BattleshipsTool:
    def __init__(self, config: MakiConfig, api: BattleshipsAPI) -> None:
        self.api = api
        self.config = config

        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        weights = torch.load('battleships.pth', map_location=self.device)
        model = QNetwork()
        model.to(self.device)
        model.load_state_dict(weights)

        model.eval()
        self.model = model
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

    def get_twitch_tools(self) -> list[Tool]:
        return [
            # Tool(self.place_ships, takes_ctx=False),
            Tool(self.pick_top_candidates, takes_ctx=False),
            Tool(self.inform_and_shoot, takes_ctx=False),
        ]

    async def place_ships(self):
        """Battleships Tool: place your ships"""
        ships = [5, 4, 3, 3, 2]
        occupied = set()
        placements = []
        sum_ship = sum(ships)

        for length in ships:
            placed = False
            for _ in range(100):
                orientation = random.randint(0, 1) # 0 = horizontal, 1 = vertical
                if orientation == 0: # horitzontal
                    row, col = random.randint(0, 10 - sum_ship), random.randint(0, 9)
                else:
                    row, col = random.randint(0, 9), random.randint(0, 10 - sum_ship)

                cells = [(row + i, col) for i in range(sum_ship)]

                if any(c in occupied for c in cells):
                    continue

                occupied.update(cells)
                direction = 'horizontal' if orientation == 0 else 'vertical'
                placements.append((row, col, direction, length))
                placed = True
                break

            if not placed:
                raise ModelRetry(
                    f"Could not find a valid placement for ship of length {length}."
                    "Retry place_ships"
                )

        for row, col, direction, length in placements:
            await self.api.place_ship(row, col, direction, length)

        return {"placed": len(placements)}

    async def pick_top_candidates(self):
        """Battleships Tool: Pick candidates

        Returns:
          list[list[str]]: The current board state
        """
        try:
            state = await self.api.get_battleship_state()
            jill_state = state["boards"]["JILL"]["rows"]
            print(jill_state)

            board = np.zeros((3, 10, 10), dtype=np.float32)
            for y in range(10):
                for x in range(10):
                    cell = jill_state[y][x]
                    if cell == "BLANK":
                        board[0, y, x] = 1.0
                    elif cell == "SHOT_MISS":
                        board[1, y, x] = 1.0
                    elif cell == "SHOT_HIT":
                        board[2, y, x] = 1.0

            state_t = torch.from_numpy(board).unsqueeze(0).to(self.device)
            valid_mask = torch.from_numpy(board[0] == 1.0).unsqueeze(0).to(self.device)

            with torch.no_grad():
                q = self.model(state_t, valid_mask)
                q = q.squeeze(0).cpu().numpy()

            top_idx = np.argsort(q)[::-1][:10]
            candidates = []
            for idx in top_idx:
                y, x = divmod(int(idx), 10)
                candidates.append({
                    "row": y,
                    "column": x,
                    "q_value": float(q[idx]),
                })

            return candidates
        except Exception as e:
            print('Pls help', e)

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
            print(f"[BS COMMUNICATION] Websocket closed, resetting for resiliency")
            self.websocket = None
        except AssertionError:
            print(f"[BS COMMNICATION] No websocket, would have sent {len(message)} bytes")

    async def inform_and_shoot(
            self, message: str, dismiss_after: int, x: int, y: int
    ) -> TerminatingAction:
        """Sends a message to the user. This is your only way to communicate with the user.

        Args:
            message: Any natural language message. Remember to keep your bratty personality.
            dismiss_after: A period of time to dismiss the message. Can be anywhere from 10 to 60 seconds
            x: The x-coordinate to shoot
            y: The y-coordinate to shoot

        Returns:
            TerminatingAction: This is a terminal function call
        """
        print(
            f"[BS COMMUNICATOR] Intending to send {message} to dismiss after {dismiss_after}"
        )
        try:
            await self.api.shoot(y, x)
        except Exception as e:
            raise ModelRetry(f"Invalid shoot, message: {e}, try other locations.")
        await self._ws_send(
            MakiOutputMessage(
                message=message, dismiss_after=max(0, min(60, dismiss_after))
            ).model_dump_json()
        )
        return TerminatingAction()
