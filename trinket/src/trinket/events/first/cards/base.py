"""
Represents a card. A CardWindow can initialize any card
"""

import sys
import copy
from abc import ABC, abstractmethod
from trinket.events.first.game import Game
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QFont, QImage

class Card(ABC):
    def __init__(self, game: Game):
        pass

    @abstractmethod
    def do_action(self, game: Game):
        pass

    @abstractmethod
    def get_name(self) -> str:
        pass

    @abstractmethod
    def get_description(self) -> str:
        pass

    @abstractmethod
    def get_image(self) -> QImage:
        pass

    @abstractmethod
    def get_base_cost(self) -> int:
        pass
