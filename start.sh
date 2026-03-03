#!/bin/bash

echo ""
echo "═══════════════════════════════════════════"
echo "🚀 PRODUCT COPILOT BRIDGE - STARTING"
echo "═══════════════════════════════════════════"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "🚀 Starting bridge server..."
echo ""
echo "Leave this terminal window open!"
echo "Open Figma → Sidebot plugin"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the server
node bridge-server.js
