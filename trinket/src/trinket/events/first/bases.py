"""
Base classes for the stuff that may spawn on the screen
"""

import sys
import copy
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable, TypeVar, Generic
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtOpenGLWidgets import QOpenGLWidget
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QFont


class FloatingWindow(QOpenGLWidget):
    """
    Frameless, always-on-top windows
    """
    def __init__(self, size=(300, 200), title="Floating Window") -> None:
        super().__init__()
        self.setWindowTitle(title)
        self.setFixedSize(size[0], size[1])

        self.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint
        )

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setStyleSheet("""
            QWidget {
                background-color: rgba(30, 30, 30, 200); /* Dark gray, semi-transparent */
                color: #ffffff; /* White text */
                border: 2px solid #555555;
                border-radius: 10px;
                font-family: Arial;
            }
        """)

@dataclass
class GameStatistics:
    health: int
    mana: int
    enemies_killed: int

    max_health: int
    max_mana: int

T = TypeVar("T")
@runtime_checkable
class GameObserver(Protocol, Generic[T]):
    @abstractmethod
    def state_changed(self, game: T):
        """
        This function is called when the state of the game is changed
        """
