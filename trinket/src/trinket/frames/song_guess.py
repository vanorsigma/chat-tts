"""
Guess songs in the song folder
"""

import sys
import random
import os

from PyQt6.QtWidgets import QApplication, QWidget, QVBoxLayout, QLayout, QPushButton
from PyQt6.QtCore import Qt, QUrl, pyqtSignal
from PyQt6.QtGui import QTextCursor, QTextCharFormat, QColor
from PyQt6.QtMultimedia import QAudioOutput, QMediaPlayer
from trinket.frames.shared import SingleLineTextEdit, CloseSignalableWidget

RESOURCES_SONG_PATH = "resources/songs"

class SongWindow(CloseSignalableWidget): # pylint: disable=too-few-public-methods
    """
    The Song Window, pepega
    """
    playing_signal = pyqtSignal(bool)

    def __init__(self, song_path: str):
        super().__init__()

        self.playing = False

        self.song_name = song_path.replace('_', ' ').split('.')[0]
        self.setWindowTitle('SongGuess')
        self.setWindowFlags(Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint)
        self.layout = QVBoxLayout(self)

        self.play_button = QPushButton('▶')
        self.play_button.clicked.connect(self.__btn_clicked)
        self.layout.addWidget(self.play_button)

        self.text_edit = SingleLineTextEdit(self)
        self.text_edit.setFixedHeight(30)
        self.text_edit.setPlaceholderText('Guess')
        self.text_edit.textChanged.connect(self.__text_edit_changed)
        self.layout.addWidget(self.text_edit)

        self.media_player = QMediaPlayer()
        self.audio_output = QAudioOutput()
        self.media_player.setAudioOutput(self.audio_output)
        self.media_player.setSource(QUrl.fromLocalFile(f'{RESOURCES_SONG_PATH}/{song_path}'))
        self.media_player.setLoops(QMediaPlayer.Loops.Infinite)
        self.audio_output.setVolume(0.1)

        self.setLayout(self.layout)
        self.layout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)

        screen = QApplication.screens()[0].size()
        self.setGeometry(random.randint(0, screen.width() - 300),
                         random.randint(0, screen.height() - 300),
                         300, 300)

    def __btn_clicked(self) -> None:
        if not self.playing:
            self.play_button.setText('⏸')
            self.media_player.play()
            self.playing = True
        else:
            self.play_button.setText('▶')
            self.media_player.pause()
            self.playing = False

        self.playing_signal.emit(self.playing)

    def __text_edit_changed(self) -> None:
        self.text_edit.blockSignals(True)

        correct = self.song_name.lower()
        inputted = self.text_edit.toPlainText().lower()
        if correct == inputted:
            self.media_player.pause()
            self.playing_signal.emit(False)
            self.close()

        restore = self.text_edit.textCursor()

        for i, (c1, c2) in enumerate(zip(correct, inputted)):
            cursor = self.text_edit.textCursor()
            cursor.setPosition(i)
            cursor.setPosition(i + 1, QTextCursor.MoveMode.KeepAnchor)

            color = QColor('green') if c1 == c2 else QColor('red')

            font_format = QTextCharFormat()
            font_format.setForeground(color)

            cursor.setCharFormat(font_format)
            cursor.clearSelection()
            self.text_edit.setTextCursor(cursor)

        self.text_edit.setTextCursor(restore)
        self.text_edit.blockSignals(False)

def make_song_windows(no_windows: int, seed: int | None = None) -> list[SongWindow]:
    """
    Creates song windows from the songs in the resources folder
    """
    if seed is not None:
        random.seed(seed)

    ws = []
    for _ in range(no_windows):
        song_path = random.choice(os.listdir(RESOURCES_SONG_PATH))
        ws.append(SongWindow(song_path))
    return ws

if __name__ == '__main__':
    app = QApplication(sys.argv)

    windows = make_song_windows(1)
    for w in windows:
        w.show()

    app.exec()
