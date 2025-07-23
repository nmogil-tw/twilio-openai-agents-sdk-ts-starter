#!/bin/bash

# ngrok.sh - Helper script for exposing the minimal example server via ngrok
# 
# This script starts ngrok to create a public tunnel to your local development server,
# which is required for Twilio webhooks to reach your application.
#
# Usage:
#   chmod +x examples/minimal/ngrok.sh
#   ./examples/minimal/ngrok.sh
#
# Requirements:
#   - ngrok installed (https://ngrok.com/download)
#   - Server running on localhost (npm start) - port configured in .env

set -e

echo "🚀 Starting ngrok tunnel for Twilio OpenAI Agents SDK Example"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed or not in PATH"
    echo ""
    echo "Please install ngrok from https://ngrok.com/download"
    echo "Or install via npm: npm install -g ngrok"
    exit 1
fi

# Check if server is running
# Try to detect the actual port from environment or check common ports
if [ -f .env ]; then
    source .env 2>/dev/null || true
fi
PORT=${PORT:-3000}

if ! curl -s http://localhost:${PORT}/health &> /dev/null; then
    # Try common alternative ports if the default doesn't work
    if curl -s http://localhost:8000/health &> /dev/null; then
        PORT=8000
        echo "⚠️  Server found on port 8000 instead of ${PORT:-3000}"
    elif curl -s http://localhost:3001/health &> /dev/null; then
        PORT=3001  
        echo "⚠️  Server found on port 3001 instead of ${PORT:-3000}"
    else
        echo "⚠️  Server doesn't appear to be running on port ${PORT}"
        echo ""
        echo "Please start the server first:"
        echo "  npm start"
        echo ""
        echo "Then run this script in another terminal."
        echo "Note: Check your .env file for PORT configuration"
        exit 1
    fi
fi

echo "✅ Server is running on port ${PORT}"
echo ""

# Start ngrok
echo "🌐 Starting ngrok tunnel..."
echo ""
echo "📱 Copy the https URL below and use it for your Twilio webhooks:"
echo "   SMS webhook: https://YOUR-NGROK-URL.ngrok.io/sms"
echo "   Voice webhook: https://YOUR-NGROK-URL.ngrok.io/voice"
echo "   Approvals webhook: https://YOUR-NGROK-URL.ngrok.io/approvals"
echo ""
echo "Press Ctrl+C to stop ngrok"
echo ""

# Start ngrok with the specified port
ngrok http ${PORT}