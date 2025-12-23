#!/bin/bash

echo "========================================"
echo "  Betting Assessment v3.0"
echo "  With Timer, Skip, and Reports"
echo "========================================"
echo

echo "Installing backend dependencies..."
cd backend
npm install

echo
echo "Starting backend server..."
npm start &
BACKEND_PID=$!

echo
echo "Installing frontend dependencies..."
cd ../frontend
npm install

echo
echo "Starting frontend server on port 3002..."
PORT=3002 npm start &
FRONTEND_PID=$!

echo
echo "========================================"
echo "  Both servers starting..."
echo "  Frontend: http://localhost:3002"
echo "  Backend:  http://localhost:3001"
echo "========================================"
echo
echo "Press Ctrl+C to stop both servers"

wait $BACKEND_PID $FRONTEND_PID
