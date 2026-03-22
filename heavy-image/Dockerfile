FROM docker.io/ollama/ollama AS builder

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
    portaudio19-dev \
    python3-venv \
    unzip && \
    rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh

RUN /root/.local/bin/uv python install 3.11 && \
    /root/.local/bin/uv venv .venv && \
    /root/.local/bin/uv venv .kokoro

# Chatterbox
RUN git clone https://github.com/vanorsigma/chatterbox.git && \
    . .venv/bin/activate && \
    /root/.local/bin/uv pip install pip && \
    pip install ./chatterbox

# PATCH: Allow 5070s to run this by using the right index-url
RUN . .venv/bin/activate && \
    pip uninstall -y torch torchaudio && \
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128 && \
    pip install soundfile

# Kokoro
RUN . .kokoro/bin/activate && \
    /root/.local/bin/uv pip install torch --index-url https://download.pytorch.org/whl/cu128 && \
    /root/.local/bin/uv pip install soundfile kokoro-onnx[gpu] onnxruntime-gpu uvicorn fastapi

FROM docker.io/ollama/ollama

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    unzip && \
    rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN /root/.local/bin/uv python install 3.11

COPY --from=builder /.venv /.venv
COPY --from=builder /.kokoro /.kokoro

WORKDIR /opt/

ENTRYPOINT ["/bin/bash"]
