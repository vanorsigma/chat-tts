# Heavy Image

Two components for the chat-tts voice pipeline, no longer deployed as a Docker image — Chattebox is on Modal (GPU TTS), Kokoro proxied through OpenRouter.

## Chatterbox (Modal)

[Chatterbox TTS](https://github.com/resemble-ai/chatterbox) — zero-shot multilingual TTS running on Modal with a T4 GPU.

### One-time setup

```bash
# Place a reference audio clip (10+ seconds) at heavy-image/to_clone.wav
# then upload it to the Modal volume:
modal run heavy-image/chatterbox.py::upload_to_clone --local-path to_clone.wav
```

### Deploy to Modal

```bash
modal deploy heavy-image/chatterbox.py
```

### Run locally (interactor)

```bash
modal run heavy-image/chatterbox.py
```

This starts a local aiohttp server on `http://localhost:8000` with a single endpoint:

```
POST /generate-audio/
{"prompt": "こんにちは", "language_id": "ja", "cfg_weight": 0.2, "exaggeration": 1.0}
→ audio/wav bytes
```

### Bus logging

The interactor hijacks `print()` and pipes all output to `ws://localhost:3001/senders` with the tag `[Chatterbox]`, matching how Captain and overlay log to the bus.

## Kokoro (OpenRouter proxy)

[Kokoro 82M](https://openrouter.ai/hexgrad/kokoro-82m) via OpenRouter — lightweight multilingual TTS. The API key is sourced from `makiConfig.openrouterApiKey` in the Captain config (`GET /api/config`).

```bash
python heavy-image/kokoro_openrouter.py
```

Starts on `http://0.0.0.0:8001` with two endpoints:

```
POST /tts
{"prompt": "Hello world", "voice": "af_heart", "speed": 1.0, "response_format": "mp3"}
→ audio/mpeg bytes (or audio/pcm if response_format=pcm)
```

```
GET /voices
→ JSON array of available voice names
```

### Environment

| Variable         | Default                  | Description                         |
|------------------|--------------------------|-------------------------------------|
| `CAPTAIN_BASE_URL` | `http://localhost:5173` | Captain base URL for config fetch   |
| `KOKORO_PORT`    | `8001`                   | Port for the Kokoro proxy server    |
