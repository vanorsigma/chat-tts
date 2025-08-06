"""
A basic healing card
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

class HealingObserver:
    def state_changed(self, game: Game):
        if game.get_state() == GameState.POST_PLAYER_SELECTION:
            game.unsubscribe(self)

            stats = game.get_statistics()
            stats.health = min(stats.health + 10, stats.max_health)
            game.update_statistics(stats)

class HealingCard(Card):
    def do_action(self, game: Game):
        # game.subscribe(HealingObserver())
        pass

    def get_name(self) -> str:
        return "Healing"

    def get_description(self) -> str:
        return "Heals the player"

    def get_image(self) -> QImage:
        image = QImage(512, 512, QImage.Format.Format_RGB32)
        black_color = QColor(0, 0, 0)
        image.fill(black_color)
        return image

    def get_base_cost(self) -> int:
        return 2
