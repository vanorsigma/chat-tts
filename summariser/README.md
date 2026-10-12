# Summariser

A stream summariser for the people who are too lazy to watch the stream, or
joined the stream late.

Triggered by the `%summary` comamnd, which is located in Captain.

## Live transcription

Microphone audio is streamed through a [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
online recogniser; long story short, it's a live transcriber.

```bash
cd summariser
mkdir -p models && cd models
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemotron-speech-streaming-en-0.6b-560ms-int8-2026-04-25.tar.bz2
tar xf sherpa-onnx-nemotron-speech-streaming-en-0.6b-560ms-int8-2026-04-25.tar.bz2
rm sherpa-onnx-nemotron-speech-streaming-en-0.6b-560ms-int8-2026-04-25.tar.bz2
```

Run:

```bash
cd summariser
uv run summariser
```
