#!/usr/bin/env bash
set -e

echo "=== Installing frontend dependencies ==="
cd frontend
npm install
echo "=== Building frontend ==="
npm run build
cd ..

echo "=== Installing backend dependencies ==="
cd backend
npm install
cd ..

echo "=== Build complete ==="
