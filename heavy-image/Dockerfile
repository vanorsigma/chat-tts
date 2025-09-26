FROM docker.io/nvidia/cuda:12.9.1-devel-ubuntu22.04 AS builder

LABEL stage="builder"

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    curl \
    wget \
    python3 \
    libpython3-dev \
    libssl-dev \
    libffi-dev \
    python3-venv && \
    rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/ggerganov/llama.cpp.git /opt/llama.cpp && \
    cd /opt/llama.cpp && \
    cmake -B build -DGGML_CUDA=ON -DBUILD_SHARED_LIBS=off -DLLAMA_CURL=off && \
    cmake --build build --config Release -j $(nproc)
RUN python3 -m venv /opt/venv
RUN . /opt/venv/bin/activate && pip install --no-cache-dir setuptools numpy && pip install --no-cache-dir chatterbox-tts

FROM docker.io/nvidia/cuda:12.9.1-base-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
ENV PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    libgomp1 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/llama.cpp/build/bin/llama-cli /usr/local/bin/llama-cli
COPY --from=builder /opt/llama.cpp/build/bin/llama-server /usr/local/bin/llama-server

COPY --from=builder /opt/venv /opt/venv

COPY --from=builder /usr/local/cuda/lib64/libcublas.so.12 /usr/local/lib/
COPY --from=builder /usr/local/cuda/lib64/libcublasLt.so.12 /usr/local/lib/
COPY --from=builder /usr/local/cuda/lib64/libcudart.so.12 /usr/local/lib/

RUN ldconfig

WORKDIR /opt

CMD ["/bin/bash"]
