"""
Entrypoint to the trinket application. This provides an additional
layer of stream interaction
"""

import itertools
import sys

import random

from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QGuiApplication, QImage, QPixmap
from PyQt6.QtMultimedia import QAudioOutput, QMediaPlayer
from PyQt6.QtWidgets import QApplication, QLabel, QWidget

from trinket.frames.emote_guess import create_emote_window_from_emote_set_id
from trinket.frames.song_guess import make_song_windows
from trinket.frames.warnings import WarningFrame, WarningLevel

def calculate_warning_level(emote_windows: int, audio_windows: int) -> WarningLevel:
    score = emote_windows * 0.1 + audio_windows * 0.5
    if 0 < score <= 1:
        return WarningLevel.FIRST

    if 1 < score <= 2:
        return WarningLevel.SECOND

    return WarningLevel.THIRD

if __name__ == '__main__':
    app = QApplication(sys.argv)

    emote_song_random = random.randint(0, 1)
    emotes = random.randint(emote_song_random, 10)
    songs = random.randint(1 - emote_song_random, 3)

    warning = WarningFrame(calculate_warning_level(emotes, songs))

    windows_emote = create_emote_window_from_emote_set_id('01J452JCVG0000352W25T9VEND', emotes)
    windows_song = make_song_windows(songs)

    for w in itertools.chain(windows_emote, windows_song):
        warning.add_frame(w)

    warning.show()

    app.exec()
