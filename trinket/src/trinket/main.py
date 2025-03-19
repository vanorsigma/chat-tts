"""
Entrypoint to the trinket application. This provides an additional
layer of stream interaction
"""

import itertools
import sys
import threading
import signal
from queue import Queue

import random

from PyQt6.QtCore import QTimer
from PyQt6.QtWidgets import QApplication

from trinket.frames.emote_guess import create_emote_window_from_emote_set_id
from trinket.frames.song_guess import make_song_windows
from trinket.frames.warnings import WarningFrame, WarningLevel
from trinket.frames.rotate import RotateFrame
from trinket.support import CancellationToken
from trinket.receiver.ws import TTSWebsocketClient
from trinket.receiver.model import Command

def calculate_warning_level(emote_windows: int, audio_windows: int) -> WarningLevel:
    score = emote_windows * 0.1 + audio_windows * 0.5
    if 0 < score <= 1:
        return WarningLevel.FIRST

    if 1 < score <= 2:
        return WarningLevel.SECOND

    return WarningLevel.THIRD

WARNING_FRAME: WarningFrame | None = None
ROTATE_FRAME: RotateFrame | None = None
CANCELLED = CancellationToken()
TASK_QUEUE = Queue[Command]()

def spawn_distractions() -> None:
    emote_song_random = random.randint(0, 1)
    emotes = random.randint(emote_song_random, 10)
    songs = random.randint(1 - emote_song_random, 3)

    WARNING_FRAME.close()

    windows_emote = create_emote_window_from_emote_set_id('01J452JCVG0000352W25T9VEND', emotes)
    windows_song = make_song_windows(songs)

    for w in itertools.chain(windows_emote, windows_song):
        WARNING_FRAME.add_frame(w)

    WARNING_FRAME.set_warning_level(calculate_warning_level(emotes, songs))
    WARNING_FRAME.show()
    return

def gui_thread_timer_callback(app: QApplication, timer: QTimer) -> None:
    global WARNING_FRAME, ROTATE_FRAME # pylint: disable=global-statement

    if CANCELLED.is_cancelled():
        timer.stop()
        app.quit()

    if TASK_QUEUE.empty():
        return

    command: Command = TASK_QUEUE.get()
    match command.command.type:
        case  "distract":
            if WARNING_FRAME is not None:
                if not WARNING_FRAME.is_completed():
                    return
                WARNING_FRAME.close()
            spawn_distractions()
        case "rotate":
            if ROTATE_FRAME is not None:
                ROTATE_FRAME.close()

            ROTATE_FRAME = RotateFrame(command.command.speed)
            ROTATE_FRAME.show()
        case "cancel":
            if WARNING_FRAME is not None:
                WARNING_FRAME.close()

            if ROTATE_FRAME is not None:
                ROTATE_FRAME.close()

def ws_message_callback(command: Command) -> None:
    TASK_QUEUE.put(command)

def ws_thread() -> None:
    client = TTSWebsocketClient('ws://192.168.1.2:3001/receivers', ws_message_callback, CANCELLED)
    client.run_forever()

def handler(_signum, _frame):
    cmd = Command()
    TASK_QUEUE.put(cmd)
    CANCELLED.cancel()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    WARNING_FRAME = WarningFrame(WarningLevel.FIRST)
    ws_thread = threading.Thread(target=ws_thread)

    timer = QTimer()
    timer.setInterval(1000)
    timer.timeout.connect(lambda: gui_thread_timer_callback(app, timer))
    timer.start()

    app.setQuitOnLastWindowClosed(False)

    signal.signal(signal.SIGINT, handler)

    print('Starting WS thread')
    ws_thread.start()

    print('Starting QApplication')
    app.exec()

    print('QApplication done')
    ws_thread.join()
