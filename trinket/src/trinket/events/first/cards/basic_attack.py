"""
A basic attack card
"""

import sys
import copy
from abc import ABC, abstractmethod
from trinket.events.first.game import Game, GameObserver, GameState
from trinket.events.first.cards.base import Card
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QFont, QImage, QColor

class AttackCard(Card):
    def do_action(self, game: Game):
        mobs = game.get_mobs()
        if len(mobs) == 0:
            return

        mob = mobs[0]
        game.damage_mob(mob, 1)

    def get_name(self) -> str:
        return "Attack"

    def get_description(self) -> str:
        return "Attacks an enemy"

    def get_image(self) -> QImage:
        image = QImage(512, 512, QImage.Format.Format_RGB32)
        black_color = QColor(0, 0, 0)
        image.fill(black_color)
        return image

    def get_base_cost(self) -> int:
        return 1
