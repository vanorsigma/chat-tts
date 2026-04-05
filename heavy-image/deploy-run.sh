#!/bin/bash
# Run this script on the remote GPU host.

source /.venv/bin/activate
# Run on GPU 0
# export CUDA_VISIBLE_DEVICES=0
# ollama serve &

cd /opt/
python3 download_kiki.py
mkdir kiki/
mv kiki.Q4_K_M.gguf kiki/
mv kiki.BF16-mmproj.gguf kiki/

# sleep 30
# ollama create kiki -f /opt/Modelfile
pushd /app
./llama-server \
    -m /opt/kiki/kiki.Q4_K_M.gguf \
    -c 4096 \
    --temp 1.0 \
    --top-p 0.95 \
    --top-k 20 \
    --port 11434 \
    --presence-penalty 1.5 \
    --reasoning off \
    --flash-attn on &
popd

export LD_LIBRARY_PATH="/.venv/lib/python3.11/site-packages/nvidia/cudnn/lib/:$LD_LIBRARY_PATH"

# Run on GPU 1
# export CUDA_VISIBLE_DEVICES=1
source /.venv/bin/activate
cd /opt/chatterbox-deploy
./server-wrapper.sh &

# export LD_LIBRARY_PATH="/.kokoro/lib64/python3.11/site-packages/nvidia/cudnn/lib/:$LD_LIBRARY_PATH"
export ONNX_PROVIDER="CUDAExecutionProvider"
python3 kokoro_server.py
