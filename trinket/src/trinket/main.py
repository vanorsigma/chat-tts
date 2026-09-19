"""
Entrypoint to the trinket application.
"""

import logging
import os
import signal
import socket
import sys
import threading

from PyQt6.QtCore import QSocketNotifier, QTimer
from PyQt6.QtWidgets import QApplication

from trinket.controller import TrinketController
from trinket.receiver.console import ConsoleReceiver
from trinket.receiver.model import Command, DistractSubcommand
from trinket.frames.shared import get_emote_cache

EMOTE_STARTUP_PREFETCH = 24


def _warm_emote_cache() -> None:
    logger = logging.getLogger(__name__)
    try:
        cache = get_emote_cache(TrinketController.EMOTE_SET_ID)
        cache.prefetch(cache.sample_uncached(EMOTE_STARTUP_PREFETCH))
    except RuntimeError as exc:
        logger.error("Failed to prefetch emotes at startup: %s", exc)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    app = QApplication(sys.argv)
    controller = TrinketController(app)

    threading.Thread(target=_warm_emote_cache, daemon=True).start()

    timer = QTimer()
    timer.setInterval(200)
    timer.timeout.connect(lambda: controller.on_timer_tick(timer))
    timer.start()

    app.setQuitOnLastWindowClosed(False)

    sig_read_fd, sig_write_fd = socket.socketpair()
    sig_read_fd.setblocking(False)
    sig_write_fd.setblocking(False)

    notifier = QSocketNotifier(
        sig_read_fd.fileno(), QSocketNotifier.Type.Read
    )

    def _on_notifier_activated(fd: int) -> None:
        try:
            os.read(fd, 4096)
        except (BlockingIOError, OSError):
            pass
        controller.on_signal_activated()

    notifier.activated.connect(_on_notifier_activated)

    def _sigint_handler(_signum, _frame):
        try:
            sig_write_fd.send(b"\x00")
        except OSError:
            pass

    signal.signal(signal.SIGINT, _sigint_handler)

    logger = logging.getLogger(__name__)
    if os.environ.get("TRINKET_DEV_MODE"):
        logger.info("Starting console receiver thread")
        controller.on_ws_message(Command(command=DistractSubcommand()))

        def _console_target():
            receiver = ConsoleReceiver(controller.on_ws_message, controller.cancelled)
            receiver.run_forever()

        _ws_thread = threading.Thread(target=_console_target)
    else:
        logger.info("Starting WS thread")
        _ws_thread = controller.start_ws_thread()
    _ws_thread.start()

    logger.info("Starting QApplication")
    app.exec()

    logger.info("QApplication done")
    _ws_thread.join()


if __name__ == "__main__":
    main()
