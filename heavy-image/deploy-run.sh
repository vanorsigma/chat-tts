#!/bin/bash
# Run this script on the remote GPU host.
# Requires the model and chatterbox-deploy to be copied to the host into
# /opt/kiki.Q4_K_M.gguf && /opt/chatterbox-deploy

source /.venv/bin/activate
# Run on GPU 0
export CUDA_VISIBLE_DEVICES=0
ollama serve &
# NOTE: we are likely no longer going to use self-hosted models, and will
# instead rely on APIs
# sleep 30 && ollama pull gemma3:12b-it-qat && ollama pull qwen3:8b

sleep 30
ollama create kiki -f /opt/Modelfile
export LD_LIBRARY_PATH="/.venv/lib/python3.11/site-packages/nvidia/cudnn/lib/:$LD_LIBRARY_PATH"
cd /opt/whisper-fastapi
python3 whisper_fastapi.py --host 0.0.0.0 --port 5000 --model large-v2 &

# Run on GPU 1
export CUDA_VISIBLE_DEVICES=1
cd /opt/chatterbox-deploy
python3 server.py &

export LD_LIBRARY_PATH="/.kokoro/lib64/python3.11/site-packages/nvidia/cudnn/lib/:$LD_LIBRARY_PATH"
export ONNX_PROVIDER="CUDAExecutionProvider"
source /.kokoro/bin/activate
python3 kokoro_server.py
