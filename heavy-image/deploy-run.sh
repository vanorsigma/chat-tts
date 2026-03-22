#!/bin/bash
# Run this script on the remote GPU host.

source /.venv/bin/activate
# Run on GPU 0
export CUDA_VISIBLE_DEVICES=0
ollama serve &

cd /opt/
python3 download_kiki.py
mkdir kiki/
mv kiki.Q4_K_M.gguf kiki/
mv kiki.BF16-mmproj.gguf kiki/

sleep 30
ollama create kiki -f /opt/Modelfile
export LD_LIBRARY_PATH="/.venv/lib/python3.11/site-packages/nvidia/cudnn/lib/:$LD_LIBRARY_PATH"

# Run on GPU 1
export CUDA_VISIBLE_DEVICES=1
cd /opt/chatterbox-deploy
python3 server.py &

export LD_LIBRARY_PATH="/.kokoro/lib64/python3.11/site-packages/nvidia/cudnn/lib/:$LD_LIBRARY_PATH"
export ONNX_PROVIDER="CPUExecutionProvider"
source /.kokoro/bin/activate
python3 kokoro_server.py
