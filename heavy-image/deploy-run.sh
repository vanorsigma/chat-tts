#!/bin/bash
# Run this script on the remote GPU host.
# Requires the model and chatterbox-deploy to be copied to the host into
# /opt/kiki.Q4_K_M.gguf && /opt/chatterbox-deploy

source /.venv/bin/activate
ollama serve &
sleep 30 && ollama pull gemma3:12b-it-qat
ollama create kiki -f /opt/Modelfile

cd /opt/chatterbox-deploy
python3 server.py
