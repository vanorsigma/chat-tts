"""
Controller that wires the GUI timer and WebSocket thread together.
"""

import logging
import threading
from queue import Queue

import itertools
import random

from PyQt6.QtCore import QTimer
from PyQt6.QtWidgets import QApplication

from trinket.frames.emote_guess import create_emote_window_from_emote_set_id
from trinket.frames.song_guess import make_song_windows
from trinket.frames.boss_fight import make_boss_fight
from trinket.frames.warning import WarningFrame, WarningLevel
from trinket.frames.rotate import RotateFrame
from trinket.support import CancellationToken
from trinket.receiver.ws import TTSWebsocketClient
from trinket.receiver.model import Command

logger = logging.getLogger(__name__)


def calculate_warning_level(
    emote_windows: int, audio_windows: int, boss_fights: int
) -> WarningLevel:
    score = emote_windows * 0.1 + audio_windows * 0.5 + boss_fights * 999
    if 0 < score <= 1:
        return WarningLevel.FIRST

    if 1 < score <= 2:
        return WarningLevel.SECOND

    if 2 < score <= 10:
        return WarningLevel.THIRD

    return WarningLevel.FOURTH


class TrinketController:
    """
    Manages the lifecycle of warning/rotate frames,
    processes incoming commands from the WebSocket,
    and schedules work on the GUI thread via QTimer.
    """

    EMOTE_SET_ID = "01J452JCVG0000352W25T9VEND"

    def __init__(self, app: QApplication):
        self.app = app
        self.cancelled = CancellationToken()
        self.task_queue: Queue[Command] = Queue()
        self.warning_frame = WarningFrame()
        self.rotate_frame: RotateFrame | None = None

    def on_ws_message(self, command: Command) -> None:
        self.task_queue.put(command)

    def on_timer_tick(self, timer: QTimer) -> None:
        if self.cancelled.is_cancelled():
            timer.stop()
            self.app.quit()

        if self.task_queue.empty():
            return

        command: Command = self.task_queue.get()
        match command.command.type:
            case "distract":
                if self.warning_frame is not None:
                    if not self.warning_frame.is_completed():
                        return
                    self.warning_frame.close()
                logger.info("Going to spawn distractions")
                self.spawn_distractions()
            case "rotate":
                if self.rotate_frame is not None:
                    self.rotate_frame.close()
                self.rotate_frame = RotateFrame(command.command.speed)
                self.rotate_frame.show()
            case "cancel":
                if self.warning_frame is not None:
                    self.warning_frame.close()
                if self.rotate_frame is not None:
                    self.rotate_frame.close()
            case _:
                logger.warning("Unknown command type: %s", command.command.type)

    def spawn_distractions(self) -> None:
        assert self.warning_frame

        emote_song_random = random.randint(0, 1)
        emotes = random.randint(emote_song_random, 10)
        songs = random.randint(1 - emote_song_random, 3)
        boss_fights = 0 if random.randint(0, 100) < 80 else 1

        self.warning_frame.close()

        windows_emote = create_emote_window_from_emote_set_id(self.EMOTE_SET_ID, emotes)
        # windows_song = make_song_windows(songs)
        windows_song = []

        boss_fight_windows = [
            make_boss_fight(self.EMOTE_SET_ID) for _ in range(boss_fights)
        ]

        for w in itertools.chain(windows_emote, windows_song, boss_fight_windows):
            self.warning_frame.add_frame(w)

        self.warning_frame.set_warning_level(
            calculate_warning_level(emotes, songs, boss_fights)
        )
        self.warning_frame.show()

    def on_signal(self, _signum, _frame) -> None:
        self.cancelled.cancel()

    def on_signal_activated(self) -> None:
        self.cancelled.cancel()
        self.app.quit()

    def _ws_thread_target(self) -> None:
        client = TTSWebsocketClient(
            "ws://localhost:3001/receivers", self.on_ws_message, self.cancelled
        )
        client.run_forever()

    def start_ws_thread(self) -> threading.Thread:
        return threading.Thread(target=self._ws_thread_target)
