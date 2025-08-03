"""
Represents a card. A CardWindow can initialize any card
"""

import sys
import copy
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QFont

@dataclass
class Card(ABC):
    name: str
    description: str

    @abstractmethod
    def do_action(self, game: Game):
        pass
