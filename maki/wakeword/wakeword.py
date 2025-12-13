"""
Wakeword API
"""
import openwakeword
import numpy as np
import pyaudio
import openwakeword
import asyncio
import threading
from asyncio import CancelledError, Lock
from openwakeword.model import Model
from pathlib import Path
from typing import Callable, Coroutine, Any

from pydantic_ai.agent.abstract import NoneType

class Wakeword:
    """
    Wakeword shenanigans

    Args:
        directory: Models directory
        threshold: The threshold to detect the wakeword
    """
    def __init__(self,
                 directory='./wakeword/models',
                 threshold=0.5
                 ):
        self._directory = Path(directory)
        self.model_paths = self._get_all_onnx()
        # self._callbacks_lock = Lock()
        # self._callbacks = []
        self._threshold = threshold
        self.event = threading.Event()

        paths_as_str = list(map(str, self.model_paths))
        self.model = Model(paths_as_str)

    # async def register_wakeword_callback(
    #         self, callback: Callable[[], None]) -> Callable[[], Coroutine[Any, Any, None]]:
    #     """
    #     Registers a callback.

    #     Args:
    #         callback: the callback to call when the wakeword is called

    #     Return:
    #         An async function to unregister a callback
    #     """
    #     async with self._callbacks_lock:
    #         self._callbacks.append(callback)

    #     async def __unregister_callback():
    #         async with self._callbacks_lock:
    #             self._callbacks.remove(callback)
    #     return __unregister_callback

    # async def __call_all_callbacks(self) -> None:
    #     async with asyncio.TaskGroup() as tg:
    #         async with self._callbacks_lock:
    #             for callback in self._callbacks:
    #                 tg.create_task(callback())

    def _get_all_onnx(self) -> list[Path]:
        return [p for p in self._directory.iterdir() if p.suffix != 'onnx']

    # async def run(self):
    #     """
    #     Runs the wakeword detection.
    #     """
    #     paths_as_str = list(map(str, self.model_paths))
    #     model = Model(paths_as_str)
    #     audio = pyaudio.PyAudio()
    #     mic = audio.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=1280)

    #     while True:
    #         audio_data = np.frombuffer(mic.read(1280), dtype=np.int16)
    #         prediction = model.predict(audio_data)
    #         summed_score = np.sum(list(num for num in prediction.values()))
    #         if summed_score > self._threshold:
    #             await self.__call_all_callbacks()

    def _thread_target(self):
        audio = pyaudio.PyAudio()
        mic = audio.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=1280)

        while True:
            if self.event.is_set():
                self.event.clear()
                return

            audio_data = np.frombuffer(mic.read(1280), dtype=np.int16)
            prediction = self.model.predict(audio_data)
            summed_score = np.sum(list(num for num in prediction.values()))
            if summed_score > self._threshold:
                self.model.reset()
                mic.close()
                return

    async def run_then_return(self):
        """
        Run wakeword detection, return only if wake
        """
        thread = threading.Thread(target=self._thread_target)
        thread.start()
        await asyncio.sleep(0.25)

        try:
            while thread.is_alive():
                await asyncio.sleep(0.25) # yield to executor
            thread.join()
        except CancelledError:
            print('[WAKEWORD] Got hit with a cancel')
            self.event.set()
            self.model.reset()
            thread.join()

        return

        # audio = pyaudio.PyAudio()
        # mic = audio.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=1280)
        # queue = asyncio.Queue()

        # while True:
        #     audio_data = np.frombuffer(mic.read(1280), dtype=np.int16)
        #     prediction = self.model.predict(audio_data)
        #     summed_score = np.sum(list(num for num in prediction.values()))
        #     if summed_score > self._threshold:
        #         return
        #     await asyncio.sleep(0.25)
            # yield to executor
