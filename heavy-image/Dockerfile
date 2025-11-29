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
    python3-venv && \
    rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh

RUN /root/.local/bin/uv python install 3.11 && \
    /root/.local/bin/uv venv
# RUN python3 -m venv /opt/venv
RUN . .venv/bin/activate && \
    /root/.local/bin/uv pip install pip setuptools wheel cython && \
    pip install numpy && \
    pip install pkuseg==0.0.25 && \
    pip install chatterbox-tts

FROM docker.io/ollama/ollama

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl && \
    rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN /root/.local/bin/uv python install 3.11

COPY --from=builder /.venv /.venv

WORKDIR /opt/

ENTRYPOINT ["/bin/bash"]
