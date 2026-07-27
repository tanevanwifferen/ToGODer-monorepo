# syntax=docker/dockerfile:1

# Stage 1: Install dependencies
FROM node:20-bookworm-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace config, all package.json files, and prisma schema (needed by postinstall)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/core/prisma packages/core/prisma
COPY packages/mobile-app/package.json packages/mobile-app/
COPY packages/mcp-server/package.json packages/mcp-server/

RUN pnpm install --frozen-lockfile

# Stage 2: Build frontend (web export)
FROM deps AS build-frontend

COPY packages/mobile-app/ packages/mobile-app/

RUN pnpm --filter @togoder/mobile-app run build

# Stage 3: Build backend
FROM deps AS build-backend

COPY packages/core/src packages/core/src
COPY packages/core/tsconfig.json packages/core/

RUN pnpm --filter @togoder/core exec tsc

# Stage 4: Download Piper TTS (CPU-only neural TTS engine)
FROM debian:bookworm-slim AS piper-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates tar && \
    rm -rf /var/lib/apt/lists/*

# Pre-built Piper binary + espeak-ng-data (phoneme conversion) + onnxruntime lib
RUN mkdir -p /piper-out/models && \
    curl -fsSL -o piper.tar.gz \
    https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz && \
    tar xzf piper.tar.gz -C /piper-out && \
    rm piper.tar.gz && \
    ls -la /piper-out/piper/

# Voice model: lessac (female, US English) medium quality — ~50MB, natural sounding
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx /piper-out/models/
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json /piper-out/models/

# Stage 5: Build whisper.cpp (CPU-only STT engine)
FROM debian:bookworm-slim AS whisper-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential cmake ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v1.9.1 https://github.com/ggerganov/whisper.cpp.git /whisper-src && \
    cd /whisper-src && \
    cmake -B build && \
    cmake --build build --config Release -j$(nproc) && \
    mkdir -p /whisper-out/models && \
    mkdir -p /whisper-out/lib && \
    cp build/bin/whisper-cli /whisper-out/ && \
    cp build/bin/*.so* /whisper-out/lib/

# Download whisper models for STT
# small.en (~466MB) — primary: much better accuracy than tiny, still CPU-viable
ADD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin /whisper-out/models/
# tiny.en (~75MB) — fallback: fast, low memory
ADD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin /whisper-out/models/
ADD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin /whisper-out/models/

# Stage 6: Runtime
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates espeak-ng libgomp1 ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace structure and node_modules from deps stage (includes compiled native modules + prisma client)
COPY --from=deps /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/package.json packages/core/
COPY --from=deps /app/packages/core/node_modules packages/core/node_modules
COPY --from=deps /app/packages/mobile-app/package.json packages/mobile-app/
COPY --from=deps /app/packages/mcp-server/package.json packages/mcp-server/

# Copy Prisma schema and migrations for runtime migrate
COPY packages/core/prisma packages/core/prisma

# Copy compiled backend
COPY --from=build-backend /app/packages/core/bin packages/core/bin

# Copy frontend static files into the path Express expects (../Frontend relative to bin/)
COPY --from=build-frontend /app/packages/mobile-app/dist packages/core/Frontend

# Copy v2 seed prompt (read at runtime by seedv2.ts)
COPY prompts ./prompts

# Copy Piper TTS binary + deps + voice model (primary TTS engine)
COPY --from=piper-build /piper-out/piper/piper /usr/local/bin/
COPY --from=piper-build /piper-out/piper/espeak-ng-data /usr/share/espeak-ng-data/
COPY --from=piper-build /piper-out/piper/*.so* /usr/local/lib/
COPY --from=piper-build /piper-out/models /app/piper-models/
RUN ldconfig

# Copy whisper.cpp binary + models + shared libs (STT engine)
COPY --from=whisper-build /whisper-out/whisper-cli /usr/local/bin/
COPY --from=whisper-build /whisper-out/lib/*.so* /usr/local/lib/
COPY --from=whisper-build /whisper-out/models /app/whisper-models/
RUN ldconfig

# Create data directory
RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=6968
ENV PIPER_BINARY=/usr/local/bin/piper
ENV PIPER_MODEL=/app/piper-models/en_US-lessac-medium.onnx
ENV WHISPER_BINARY=/usr/local/bin/whisper-cli
ENV WHISPER_MODEL=/app/whisper-models/ggml-small.en.bin
ENV WHISPER_MODEL_FALLBACK=/app/whisper-models/ggml-tiny.en.bin

USER node

EXPOSE 6968

CMD sh -c "cd packages/core && (npx prisma migrate deploy || npx prisma db push || true) && node bin/index.js"
