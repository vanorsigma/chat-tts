"""
Main Game Window
"""

import sys
import copy
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable, Callable, Self
from PyQt6.QtWidgets import (
    QApplication,
    QWidget,
    QProgressBar,
    QLabel,
    QVBoxLayout,
    QHBoxLayout,
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QFont
from trinket.events.first.bases import GameStatistics, GameObserver
from enum import Enum


class GameState(Enum):
    PRE_PLAYER_SELECTION = 1
    PLAYER_SELECTION = 2
    POST_PLAYER_SELECTION = 3
    PRE_ENEMY_TURN = 4
    ENEMY_TURN = 5
    POST_ENEMY_TURN = 6


class Game:
    def __init__(
        self,
        initial_statistics: GameStatistics,
        initialiser: Callable[[GameStatistics], list[GameObserver[Self]]],
    ):
        self._observers = []
        self._statistics = initial_statistics
        self._state = GameState.PRE_PLAYER_SELECTION

        observers = initialiser(self._statistics)
        for observer in observers:
            self.subscribe(observer)

    def __inform_all_observers(self) -> None:
        for observer in self._observers:
            observer.state_changed(self)

    def change_state(self, new_state: GameState) -> None:
        self._state = new_state
        self.__inform_all_observers()

    def subscribe(self, observer: GameObserver) -> None:
        if not isinstance(observer, GameObserver):
            raise RuntimeError("Trying to subscribe to a non-GameObsever!")
        self._observers.append(observer)

    def unsubscribe(self, observer: GameObserver) -> None:
        if not isinstance(observer, GameObserver):
            raise RuntimeError("Trying to unsubscribe to a non-GameObsever!")

        if observer in self._observers:
            self._observers.remove(observer)

    def update_statistics(self, statistics: GameStatistics) -> None:
        self._statistics = statistics
        self.__inform_all_observers()

    def get_statistics(self) -> GameStatistics:
        return copy.deepcopy(self._statistics)
