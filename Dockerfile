# ---- Stage 1: Build React frontend ----
FROM node:22-slim AS frontend-build

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# ---- Stage 2: Python runtime ----
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*

# Install beepctl for optional Beeper contact sync
RUN npm install -g beepctl 2>/dev/null || true

# Copy backend
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py .

# Copy built frontend
COPY --from=frontend-build /app/web/dist /app/web/dist

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 9120

ENV MESSAGE_SCHEDULER_DB=/app/data/scheduler.db
ENV MESSAGE_SCHEDULER_STATIC=/app/web/dist
ENV PORT=9120

CMD ["python3", "api.py"]
