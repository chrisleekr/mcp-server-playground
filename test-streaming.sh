#!/bin/bash

set -euo pipefail
# set -x

test_tool() {
    local mcp_session_id=$1
    local tool_name=$2
    local args=$3
    local description=$4

    echo ""
    echo "Testing: $description"
    echo "Tool: $tool_name"
    echo "Args: $args"
    echo "----------------------------------------"

    curl -X POST http://localhost:3000/mcp \
        -H "Content-Type: application/json" \
        -H "Accept: application/json, text/event-stream" \
        -H "mcp-session-id: $mcp_session_id" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"id\": $(date +%s),
            \"method\": \"tools/call\",
            \"params\": {
                \"name\": \"$tool_name\",
                \"arguments\": $args
            }
        }" | sed -n 's/^data: //p' | jq '.'

    echo ""
}

# Initialize session first
test_initialization() {
    curl -i -X POST http://localhost:3000/mcp \
        -H "Accept: application/json, text/event-stream" \
        -H "Content-Type: application/json" \
        -d '{
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "sampling": {},
                    "roots": {
                        "listChanged": true
                    },
                    "notifications": {}
                },
                "clientInfo": {
                    "name": "mcp-test-client",
                    "version": "1.0.0"
                }
            }
        }'
}


echo "Initializing session and extracting mcp-session-id header..."
MCP_SESSION_ID=$(test_initialization | grep -i "mcp-session-id:" | sed 's/.*mcp-session-id:[[:space:]]*//' | tr -d '\r\n')
if [ -z "$MCP_SESSION_ID" ]; then
    echo "Failed to initialize session or retrieve mcp-session-id"
    echo "Full response headers:"
    echo "$INIT_RESPONSE" | head -20
    exit 1
fi
echo "MCP Session ID extracted: $MCP_SESSION_ID"

test_tool "$MCP_SESSION_ID" "streaming" '{"dataType": "stock_prices", "count": 10, "intervalMs": 1000}' "Stock prices stream"

echo ""
echo "Test completed"
