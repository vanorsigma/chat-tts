import torch
import soundfile
import os
import io
import struct
import urllib.request
import onnxruntime as ort
import numpy as np
import time
from typing import AsyncGenerator
from kokoro_onnx import Kokoro
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# ort.set_default_logger_severity(0)
# print(ort.get_available_providers())

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
MODEL_PATH = "kokoro-v1.0.onnx"
SYNC_MODE = False  # enabling this will reduce time-to-first-sample
VOICES_PATH = "voices.dat"
voices = ["af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa", "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable", "bm_george", "bm_lewis"]

def download_if_missing(url, path):
    if not os.path.exists(path):
        print(f"Downloading {path}...")
        urllib.request.urlretrieve(url, path)
        print("Download complete.")

download_if_missing(MODEL_URL, MODEL_PATH)
download_if_missing(VOICES_URL, VOICES_PATH)
kokoro = Kokoro(MODEL_PATH, VOICES_PATH)

app = FastAPI(
    title="Kokoro API",
    description="An API server",
    version="1.0.0",
)

class TTSRequest(BaseModel):
    prompt: str
    voice: str
    speed: float

def build_wav_header(sample_rate: int, channels: int = 1) -> bytes:
    file_size = 0xFFFFFFFF
    byte_rate = sample_rate * channels * 2 # 16 bit audio, 2 bytes per sample item

    header = b'RIFF' + \
        struct.pack('<I', file_size) + \
        b'WAVEfmt ' + \
        b'\x10\x00\x00\x00' + \
        b'\x01\x00' + \
        struct.pack('<H', channels) + \
        struct.pack('<I', sample_rate) + \
        struct.pack('<I', byte_rate) + \
        struct.pack('<H', channels * 2) + \
        b'\x10\x00' + \
        b'data' + \
        struct.pack('<I', file_size)

    return header

@app.post("/tts")
async def tts(request: TTSRequest):
    # start_time = time.perf_counter()
    try:
        print(f"TTS request for prompt: '{request.prompt}' with voice {request.voice}")

        # TODO: probably, british voices can't speak american?

        if SYNC_MODE:
            samples, sample_rate = kokoro.create(
                request.prompt,
                voice=request.voice,
                speed=request.speed,
            )

            buffer = io.BytesIO()
            soundfile.write(buffer, samples, sample_rate, format='wav')
            buffer.seek(0)
            # print(f'Responded in: {time.perf_counter() - start_time}')
            return StreamingResponse(buffer, media_type='audio/wav')

        stream = kokoro.create_stream(
            request.prompt,
            voice=request.voice,
            speed=request.speed,
        )

        async def process_sample() -> AsyncGenerator[bytes, None]:
            yield build_wav_header(sample_rate=24000, channels=1)

            # time_printed = False
            async for sample, _ in stream:
                # turn float32 -> int16
                samples = (sample * 32767).astype(np.int16)
                # if not time_printed:
                #     print(f'First response in: {time.perf_counter() - start_time}')
                #     time_printed = True
                yield samples.tobytes()

        return StreamingResponse(process_sample(), media_type="audio/wav")
    except Exception as e:
        print(f"An unexpected error occured: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"An internal server error occurred: {str(e)}"
        )

@app.get("/voices")
async def list_voices():
    return JSONResponse(voices)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
