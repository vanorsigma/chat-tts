import asyncio

from triggers.base import Priority, Trigger, TriggerContext
from tools.battleships import BattleshipsAPI
from prompts import BATTLESHIPS_ADDENDUM


BATTLESHIPS_PROMPT = (
    "You are reacting to a battleships update. Choose a coordinate to torpedo, via the battleships tool or otherwise."
    " Then, terminate via inform_and_shoot."
    " Your current board state: "
)


class BattleshipHTTP(Trigger):
    name = "Battleship"
    priority = Priority.BATTLESHIP

    def __init__(self, api: BattleshipsAPI, player: str = 'maki') -> None:
        self.api = api
        self.player = player

    async def arm(self) -> TriggerContext:
        while True:
            print(f"[BATTLESHIPS] Polling...")
            await asyncio.sleep(1)
            poll_results = await self.api.get_battleship_state()
            current_player: str = poll_results['current_player']
            print(f'[BATTLESHIP] Current player: {current_player}')
            if current_player.lower() == self.player:
                return TriggerContext(
                    priority=self.priority,
                    modality="text",
                    prompt=BATTLESHIPS_PROMPT + str(poll_results),
                    addendum_prompt=BATTLESHIPS_ADDENDUM
                )

            else:
                await asyncio.sleep(16)
