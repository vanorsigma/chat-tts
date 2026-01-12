import torch
import io
import soundfile
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
import os
import sys

AUDIO_PROMPT_PATH = "to_clone.wav"

if not os.path.exists(AUDIO_PROMPT_PATH):
    print(f"Error: The required audio prompt file was not found at '{AUDIO_PROMPT_PATH}'. Exiting.")
    sys.exit(1)

try:
    print("Loading ChatterboxMultilingualTTS model...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    print(f"Model loaded successfully on device: {device}")
except Exception as e:
    print(f"Error loading model: {e}")
    raise RuntimeError(f"Could not load the TTS model: {e}") from e

app = FastAPI(
    title="Chatterbox TTS API",
    description="An API server",
    version="1.0.0",
)

class SelfThoughtRequest(BaseModel):
    prompt: str


@app.post("/generate-audio/")
async def generate_audio(request: SelfThoughtRequest):
    try:
        print(f"Processing request for prompt: '{request.prompt}'")

        wav = model.generate(
            text=request.prompt,
            audio_prompt_path=AUDIO_PROMPT_PATH,
            cfg_weight=0.2,
            exaggeration=1.0,
            language_id='ja',
        )

        sample_rate = 24000

        buffer = io.BytesIO()
        soundfile.write(buffer, wav[0].cpu().numpy(), sample_rate, format='wav')
        buffer.seek(0)

        return StreamingResponse(buffer, media_type="audio/wav")

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"An internal server error occurred: {str(e)}"
        )

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
