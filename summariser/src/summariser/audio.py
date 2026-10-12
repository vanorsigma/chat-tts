import asyncio
import threading
import time
from collections import deque
from pathlib import Path

import sherpa_onnx
import sounddevice

from .config import SummariserConfig

SAMPLE_RATE = 16000
SAMPLES_PER_READ = int(0.1 * SAMPLE_RATE)  # 100 ms
# Endpoint rules: flush after 2.4s of silence, 1.2s once something was decoded,
# or a 20s utterance. See sherpa-onnx OnlineRecognizer.from_transducer.
RULE1_MIN_TRAILING_SILENCE = 2.4
RULE2_MIN_TRAILING_SILENCE = 1.2
RULE3_MIN_UTTERANCE_LENGTH = 20.0


def _resolve_device(mic_device: str) -> int | str | None:
    return int(mic_device) if mic_device.isdigit() else mic_device or None


def _pick(model_dir: Path, prefix: str) -> str:
    """Find `prefix*.onnx`, preferring the int8 quantised variant."""
    for pattern in (f"{prefix}*int8*.onnx", f"{prefix}*.onnx"):
        match = next(model_dir.glob(pattern), None)
        if match:
            return str(match)
    raise FileNotFoundError(f"no {prefix}*.onnx in {model_dir}")


class Transcriber:
    """Streams the microphone through a sherpa-onnx online recogniser.

    Decoding happens as audio arrives (endpoint detection marks utterance
    boundaries), so `window()` also includes the in-progress utterance.
    """

    def __init__(self, config: SummariserConfig) -> None:
        self._config = config
        self._device = _resolve_device(config.mic_device)
        self.window_minutes = config.window_minutes
        self.transcript: deque[tuple[float, str]] = deque()
        self._partial = ""
        self._stop = threading.Event()
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        try:
            recognizer = await asyncio.to_thread(self._load)
        except Exception as e:
            print(f"[AUDIO] sherpa-onnx unavailable, summarising chat only: {e}")
            return
        self._task = asyncio.create_task(asyncio.to_thread(self._run, recognizer))

    def _load(self) -> sherpa_onnx.OnlineRecognizer:
        model_dir = Path(self._config.asr_model_dir).expanduser()
        return sherpa_onnx.OnlineRecognizer.from_transducer(
            tokens=str(model_dir / "tokens.txt"),
            encoder=_pick(model_dir, "encoder"),
            decoder=_pick(model_dir, "decoder"),
            joiner=_pick(model_dir, "joiner"),
            num_threads=1,
            sample_rate=SAMPLE_RATE,
            feature_dim=80,
            enable_endpoint_detection=True,
            rule1_min_trailing_silence=RULE1_MIN_TRAILING_SILENCE,
            rule2_min_trailing_silence=RULE2_MIN_TRAILING_SILENCE,
            rule3_min_utterance_length=RULE3_MIN_UTTERANCE_LENGTH,
            decoding_method="greedy_search",
            provider="cpu",
        )

    def _run(self, recognizer: sherpa_onnx.OnlineRecognizer) -> None:
        try:
            mic = sounddevice.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
                device=self._device,
            )
        except Exception as e:
            print(f"[AUDIO] Cannot open microphone: {e}")
            return

        stream = recognizer.create_stream()
        print("[AUDIO] Live transcription started")
        with mic:
            while not self._stop.is_set():
                samples, overflowed = mic.read(SAMPLES_PER_READ)
                if overflowed:
                    print("[AUDIO] Microphone overflow, dropping samples")
                stream.accept_waveform(SAMPLE_RATE, samples.reshape(-1))
                while recognizer.is_ready(stream):
                    recognizer.decode_stream(stream)
                text = recognizer.get_result(stream)
                self._partial = text
                if recognizer.is_endpoint(stream):
                    if text:
                        print(f"[AUDIO] Transcribed: {text[:120]}")
                        self.transcript.append((time.monotonic(), text))
                        self._prune()
                    self._partial = ""
                    recognizer.reset(stream)

    def _prune(self) -> None:
        cutoff = time.monotonic() - self.window_minutes * 60
        while self.transcript and self.transcript[0][0] < cutoff:
            self.transcript.popleft()

    def window(self) -> str:
        cutoff = time.monotonic() - self.window_minutes * 60
        texts = [text for ts, text in self.transcript if ts >= cutoff]
        if self._partial:
            texts.append(self._partial)
        return " ".join(texts)

    async def close(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                print(f"[AUDIO] Capture task ended with error: {e}")


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        model_dir = Path(tmp)
        for name in ("encoder-epoch-99-avg-1.onnx", "encoder-epoch-99-avg-1.int8.onnx"):
            (model_dir / name).touch()
        (model_dir / "decoder-epoch-99-avg-1.onnx").touch()
        assert _pick(model_dir, "encoder").endswith(".int8.onnx")
        assert _pick(model_dir, "decoder").endswith(".onnx")
    print("ok")
