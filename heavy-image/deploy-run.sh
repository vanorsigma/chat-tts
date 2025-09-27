#!/bin/bash
# Run this script on the remote GPU host.
# Requires the model and chatterbox-deploy to be copied to the host into
# /opt/kiki.Q4_K_M.gguf && /opt/chatterbox-deploy

source /.venv/bin/activate
ollama create kiki -f /opt/Modelfile
ollama serve &
# llama-server -m /opt/kiki.Q4_K_M.gguf --port 8543 --jinja -ngl 99 --flash-attn on -sm row --temp 0.8 --top-k 20 --top-p 0.95 --min-p 0 --presence-penalty 1.5 -c 2048 -n 32768 --no-context-shift &

cd /opt/chatterbox-deploy
python3 server.py
