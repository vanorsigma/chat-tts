"""
Slime
"""

import sys
import math
import copy
from trinket.events.first.bases import FloatingWindow, FloatingWindowNoGL, GameStatistics
from trinket.events.first.game import Game
from trinket.events.first.cards.base import Card
from trinket.events.first.mobs.mob import Mob
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable, TypeVar, Generic
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout, QTextEdit, QSizePolicy
)
from PyQt6.QtCore import Qt, QTimer, QSize
from PyQt6.QtGui import QMouseEvent, QFont, QImage, QPixmap, QPainter, QPalette, QColor
from PyQt6.QtOpenGLWidgets import QOpenGLWidget

class Slime(Mob[Game]):
    def __init__(self, game: Game):
        super().__init__(game)

        self._health = 10
        self._max_health = 10

    def get_name(self) -> str:
        return 'Slime'

    def get_health(self) -> int:
        return self._health

    def get_max_health(self) -> int:
        return self._max_health

    def do_turn(self, game: Game) -> None:
        game.do_damage(5)

    def receive_damage(self, game: Game, damage: int) -> None:
        self._health = max(0, min(self._health - damage, self._max_health))

    def get_image(self) -> QImage:
        image = QImage(512, 512, QImage.Format.Format_RGB32)
        black_color = QColor(0, 0, 0)
        image.fill(black_color)
        return image
