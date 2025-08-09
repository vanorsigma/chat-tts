"""
A mob
"""

import sys
import math
import copy
from trinket.events.first.bases import FloatingWindow, FloatingWindowNoGL, GameStatistics
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

G = TypeVar("G")
class Mob(ABC, Generic[G]):
    def __init__(self, game: G) -> None:
        pass

    @abstractmethod
    def get_name(self) -> str:
        pass

    @abstractmethod
    def get_health(self) -> int:
        pass

    @abstractmethod
    def get_max_health(self) -> int:
        pass

    @abstractmethod
    def do_turn(self, game: G) -> None:
        pass

    @abstractmethod
    def receive_damage(self, game: G, damage: int) -> None:
        pass

    @abstractmethod
    def get_image(self) -> QImage:
        pass
