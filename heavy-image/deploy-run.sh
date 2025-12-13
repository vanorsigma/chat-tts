#!/bin/bash
# Run this script on the remote GPU host.
# Requires the model and chatterbox-deploy to be copied to the host into
# /opt/kiki.Q4_K_M.gguf && /opt/chatterbox-deploy

source /.venv/bin/activate
ollama serve &
# NOTE: we are likely no longer going to use self-hosted models, and will
# instead rely on APIs
sleep 30 && ollama pull gemma3:12b-it-qat # && ollama pull qwen3:8b
ollama create kiki -f /opt/Modelfile

export LD_LIBRARY_PATH="$LD_LIBRARY_PATH:/.venv/lib/python3.11/site-packages/nvidia/cudnn/lib/"
cd /opt/whisper-fastapi
python3 whisper_fastapi.py --host 0.0.0.0 --port 5000 --model large-v2 &

cd /opt/chatterbox-deploy
python3 server.py
