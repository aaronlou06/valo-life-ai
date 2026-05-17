#!/usr/bin/env bash
set -e

WORKSPACE=/home/runner/workspace

# Start API server in the background
echo "Starting API server on PORT=8080..."
cd "$WORKSPACE/artifacts/api-server"
PORT=8080 node dist/index.mjs &
API_PID=$!
echo "API server started (PID $API_PID)"

# Start Expo dev server in the foreground
echo "Starting Expo dev server on PORT=8081..."
cd "$WORKSPACE/artifacts/valo"
export PORT=8081 && exec pnpm run dev
