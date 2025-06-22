#!/bin/bash

set -e

# shellcheck source=/dev/null
source .env

# MCP_CONFIG_TOOLS_PROJECT_PATH
if [ -z "$MCP_CONFIG_TOOLS_PROJECT_PATH" ]; then
    echo "MCP_CONFIG_TOOLS_PROJECT_PATH is not set. Please set to your project path."
    exit 1
fi

# Run the container
docker-compose up -d --build
docker logs -f mcp-server-boilerplate
