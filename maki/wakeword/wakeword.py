"""
Wakeword API
"""

import numpy as np
import pyaudio
import asyncio
import threading
from asyncio import CancelledError
from openwakeword.model import Model
from pathlib import Path


class Wakeword:
    """
    Wakeword detection.

    Args:
        directory: Models directory
        threshold: The threshold to detect the wakeword
    """

    def __init__(self, directory="./wakeword/models", threshold=0.5):
        self._directory = Path(directory)
        self._directory.mkdir(parents=True, exist_ok=True)
        self.model_paths = self._get_all_onnx()
        print(
            f"[WAKEWORD] Found {len(self.model_paths)} ONNX model(s): {[p.name for p in self.model_paths]}"
        )
        paths_as_str = list(map(str, self.model_paths))
        self.model = Model(paths_as_str) if paths_as_str else None
        if self.model is None:
            print("[WAKEWORD] No models loaded — wakeword detection disabled")
        self._threshold = threshold

    def _get_all_onnx(self) -> list[Path]:
        return [p for p in self._directory.iterdir() if p.suffix == ".onnx"]

    def _thread_target(
        self,
        stop_event: threading.Event,
        loop: asyncio.AbstractEventLoop,
        wake_event: asyncio.Event,
    ):
        audio = pyaudio.PyAudio()
        mic = audio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=16000,
            input=True,
            frames_per_buffer=1280,
        )
        print(
            f"[WAKEWORD] Audio stream opened, listening (threshold={self._threshold})"
        )

        try:
            while not stop_event.is_set():
                audio_data = np.frombuffer(mic.read(1280), dtype=np.int16)
                if self.model is None:
                    continue
                prediction = self.model.predict(audio_data)
                if not prediction:
                    continue
                max_model, max_score = max(prediction.items(), key=lambda kv: kv[1])
                if max_score > self._threshold:
                    print(f"[WAKEWORD] Detected '{max_model}' (score={max_score:.3f})")
                    self.model.reset()
                    loop.call_soon_threadsafe(wake_event.set)
                    mic.close()
                    return
        finally:
            if mic.is_active():
                mic.close()
            audio.terminate()
            print("[WAKEWORD] Audio stream closed")

    async def run_then_return(self):
        if self.model:
            self.model.reset()

        loop = asyncio.get_running_loop()
        wake_event = asyncio.Event()
        stop_event = threading.Event()
        thread = threading.Thread(
            target=self._thread_target, args=(stop_event, loop, wake_event)
        )
        thread.start()
        print("[WAKEWORD] Detection thread started")

        try:
            await wake_event.wait()
            thread.join()
            print("[WAKEWORD] Detection thread joined — wakeword triggered")
        except CancelledError:
            print("[WAKEWORD] Cancelling wakeword detection")
            stop_event.set()
            if self.model:
                self.model.reset()
            thread.join()
            print("[WAKEWORD] Detection thread cancelled and joined")

        return
