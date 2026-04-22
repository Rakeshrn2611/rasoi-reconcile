#!/usr/bin/env bash
set -e

echo "=== Installing frontend dependencies (including devDeps for Vite) ==="
cd frontend
npm install --include=dev
echo "=== Building frontend ==="
npm run build
cd ..

echo "=== Installing backend dependencies ==="
cd backend
npm install --omit=dev
cd ..

echo "=== Build complete ==="
