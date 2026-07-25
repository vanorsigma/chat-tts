import asyncio
import io

import numpy as np
import sounddevice
import soundfile as sf
import webrtcvad

SAMPLE_RATE = 16000
FRAME_DURATION_MS = 30
FRAME_SIZE_BYTES = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000) * 2
SILENCE_THRESHOLD_MS = 500


async def capture_utterance() -> bytes:
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes] = asyncio.Queue()
    result_data: np.ndarray | None = None
    done = asyncio.Event()

    silence_limit = int(SILENCE_THRESHOLD_MS / FRAME_DURATION_MS)
    vad = webrtcvad.Vad(0)

    async def _vad_consumer():
        nonlocal result_data
        raw_buffer = bytearray()
        silence_frames = 0
        triggered = False
        speech_buffer: list[np.ndarray] = []

        while not done.is_set():
            try:
                raw_chunk = await asyncio.wait_for(queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue

            raw_buffer.extend(raw_chunk)

            while len(raw_buffer) >= FRAME_SIZE_BYTES:
                frame_bytes = raw_buffer[:FRAME_SIZE_BYTES]
                del raw_buffer[:FRAME_SIZE_BYTES]

                is_speech = vad.is_speech(frame_bytes, SAMPLE_RATE)
                chunk = (
                    np.frombuffer(frame_bytes, dtype=np.int16).astype(np.float32)
                    / 32768.0
                )

                if triggered:
                    speech_buffer.append(chunk)
                    if is_speech:
                        silence_frames = 0
                    else:
                        silence_frames += 1

                    if silence_frames > silence_limit:
                        print(
                            f"[VAD] Silence detected ({SILENCE_THRESHOLD_MS}ms), capturing utterance"
                        )
                        result_data = np.concatenate(speech_buffer)
                        done.set()
                        return
                else:
                    if is_speech:
                        triggered = True
                        speech_buffer.append(chunk)
                        print("[VAD] Speech started, capturing...")

    def _callback(
        indata: np.ndarray,
        _frames: int,
        _time: int,
        status: int,
    ):
        if status:
            print(f"Mic status: {status}")
        loop.call_soon_threadsafe(queue.put_nowait, indata.reshape((-1,)).tobytes())

    print("[VAD] Starting audio capture stream")
    with sounddevice.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
        callback=_callback,
    ):
        consumer_task = asyncio.create_task(_vad_consumer())
        try:
            await done.wait()
        finally:
            consumer_task.cancel()
            try:
                await consumer_task
            except asyncio.CancelledError:
                pass

    if result_data is None:
        print("[VAD] Capture ended with no audio data")
        raise RuntimeError("Voice capture ended with no audio data")

    duration_ms = int(len(result_data) / SAMPLE_RATE * 1000)
    print(f"[VAD] Utterance captured: {duration_ms}ms, {len(result_data)} samples")

    buffer = io.BytesIO()
    sf.write(buffer, result_data, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    buffer.seek(0)
    wav_size = len(buffer.getvalue())
    print(f"[VAD] WAV encoded: {wav_size} bytes")
    return buffer.getvalue()
