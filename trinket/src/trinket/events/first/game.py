"""
Main Game Window
"""

import sys
import copy
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable, Callable, Self, Optional, TypeVar, Generic
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

class ObserverCalledReason(Enum):
    GENERAL = 1
    HAND_CHANGED = 2


C = TypeVar("C")
class Game(Generic[C]):
    def __init__(
        self,
        initial_statistics: GameStatistics,
        initialiser: Callable[[Optional[QWidget], GameStatistics], list[GameObserver[Self]]],
        parent_widget: Optional[QWidget] = None
    ):
        self._parent_widget = parent_widget
        self._observers = []
        self._statistics = initial_statistics
        self._state = GameState.PRE_PLAYER_SELECTION
        self._hand = []
        self._card_size = (210, 350)

        observers = initialiser(self._statistics, parent_widget=self._parent_widget)
        for observer in observers:
            self.subscribe(observer)

    def __inform_all_observers(self, reason: ObserverCalledReason = ObserverCalledReason.GENERAL) -> None:
        for observer in self._observers:
            observer.state_changed(self, reason)

    def set_card_size(self, card_size: tuple[int, int]) -> None:
        self._card_size = card_size
        self.__inform_all_observers()

    def get_card_size(self) -> tuple[int, int]:
        return self._card_size

    def hand_add(self, card: C) -> None:
        self._hand.append(card)
        self.__inform_all_observers(ObserverCalledReason.HAND_CHANGED)

    def hand_remove(self, card: C) -> None:
        if card in self._hand:
            self._hand.remove(card)
            self.__inform_all_observers(ObserverCalledReason.HAND_CHANGED)

    def get_hand(self) -> list[C]:
        return copy.deepcopy(self._hand)

    def get_parent_widget(self) -> QWidget:
        return self._parent_widget

    def change_state(self, new_state: GameState) -> None:
        self._state = new_state
        self.__inform_all_observers()

    def get_state(self) -> GameState:
        return self._state

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
