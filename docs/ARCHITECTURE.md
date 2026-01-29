# Architecture Overview

This document provides an overview of the MCP Server Playground architecture, including system components, data flows, and key design decisions.

## Table of Contents

- [High-Level System Architecture](#high-level-system-architecture)
- [OAuth Authorization Flow](#oauth-authorization-flow)
- [Request Processing Flow](#request-processing-flow)
- [Storage Abstraction](#storage-abstraction)
- [SSE Resumability](#sse-resumability)
- [Stateful Session Management](#stateful-session-management)

---

## High-Level System Architecture

The MCP Server Playground follows a layered architecture with clear separation of concerns:

```mermaid
flowchart TB
    subgraph clients [MCP Clients]
        cursor[Cursor IDE]
        inspector[MCP Inspector]
        custom[Custom Clients]
    end

    subgraph server [MCP Server]
        http[HTTP Transport<br/>Express.js]
        auth[OAuth Proxy]
        mcp[MCP Protocol Handler]
        tools[Tool Registry]
        prompts[Prompt Registry]
    end

    subgraph storage [Storage Layer]
        valkey[(Valkey/Redis)]
        memory[(In-Memory)]
    end

    subgraph external [External Services]
        auth0[Auth0]
        aws[AWS Services]
    end

    clients --> http
    http --> auth
    auth --> mcp
    mcp --> tools
    mcp --> prompts
    auth --> valkey
    auth --> auth0
    tools --> aws
```

### Components

| Component                | Description                                                                |
| ------------------------ | -------------------------------------------------------------------------- |
| **HTTP Transport**       | Express.js server handling HTTP requests with streaming support            |
| **OAuth Proxy**          | Implements OAuth 2.0 with Dynamic Client Registration, delegating to Auth0 |
| **MCP Protocol Handler** | Processes MCP protocol messages and routes to tools/prompts                |
| **Tool Registry**        | Manages registered MCP tools with streaming execution support              |
| **Prompt Registry**      | Manages registered MCP prompts                                             |
| **Storage Layer**        | Pluggable storage for sessions, tokens, and OAuth data                     |

---

## OAuth Authorization Flow

The server implements an OAuth proxy pattern to enable Dynamic Client Registration while delegating actual authentication to Auth0:

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as MCP Server
    participant Auth0 as Auth0

    Client->>Server: POST /oauth/register
    Server->>Server: Generate client_id/secret
    Server-->>Client: client_id, client_secret

    Client->>Server: GET /oauth/authorize
    Server->>Auth0: Redirect to Auth0 login
    Auth0-->>Server: GET /oauth/auth0-callback
    Server->>Server: Create JWT token
    Server-->>Client: authorization_code

    Client->>Server: POST /oauth/token
    Server-->>Client: access_token, refresh_token
```

### OAuth Endpoints

| Endpoint                                  | Method | Description                      |
| ----------------------------------------- | ------ | -------------------------------- |
| `/.well-known/oauth-authorization-server` | GET    | OAuth server metadata discovery  |
| `/.well-known/oauth-protected-resource`   | GET    | Protected resource metadata      |
| `/oauth/register`                         | POST   | Dynamic client registration      |
| `/oauth/authorize`                        | GET    | Authorization request initiation |
| `/oauth/token`                            | POST   | Token exchange                   |
| `/oauth/revoke`                           | POST   | Token revocation                 |
| `/oauth/auth0-callback`                   | GET    | Auth0 callback handler           |

---

## Request Processing Flow

All incoming HTTP requests pass through a middleware stack before reaching the MCP protocol handler:

```mermaid
flowchart LR
    subgraph middleware [Middleware Stack]
        helmet[Helmet Security]
        rate[Rate Limiter]
        cors[CORS]
        version[MCP Version Check]
        context[Logging Context]
    end

    subgraph processing [Request Processing]
        auth[Auth Validation]
        transport[Transport Manager]
        handler[Tool/Prompt Handler]
    end

    request[HTTP Request] --> middleware
    middleware --> processing
    processing --> response[HTTP Response]
```

### Middleware Components

| Middleware            | Purpose                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Helmet**            | Security headers (CSP, XSS protection, etc.)                                                      |
| **Rate Limiter**      | 100 requests per minute per IP                                                                    |
| **CORS/Origin**       | Cross-origin request handling with strict Origin validation on MCP endpoints to prevent DNS rebinding attacks |
| **MCP Version Check** | Protocol version validation (2025-06-18, 2025-03-26)                                              |
| **Logging Context**   | Request correlation and structured logging                                                        |

---

## Storage Abstraction

The storage layer uses a pluggable interface pattern, allowing deployment with either in-memory storage (development) or Valkey/Redis (production):

```mermaid
classDiagram
    class Storage {
        <<interface>>
        +get(key) Promise~string~
        +set(key, value, ttl) Promise~void~
        +delete(key) Promise~boolean~
        +keys(pattern) Promise~string[]~
        +close() Promise~void~
        +length() Promise~number~
        +appendToList(key, value, ttl) Promise~number~
        +getList(key) Promise~string[]~
    }

    class MemoryStorage {
        -store: Map
        -listStore: Map
        +get(key)
        +set(key, value, ttl)
        +appendToList(key, value, ttl)
        +getList(key)
    }

    class ValkeyStorage {
        -client: IOValkey
        +get(key)
        +set(key, value, ttl)
        +appendToList(key, value, ttl)
        +getList(key)
    }

    Storage <|.. MemoryStorage
    Storage <|.. ValkeyStorage
```

### Storage Configuration

| Environment Variable             | Default  | Description                           |
| -------------------------------- | -------- | ------------------------------------- |
| `MCP_CONFIG_STORAGE_TYPE`        | `memory` | Storage backend: `memory` or `valkey` |
| `MCP_CONFIG_STORAGE_VALKEY_URL`  | -        | Valkey/Redis connection URL           |
| `MCP_CONFIG_STORAGE_SESSION_TTL` | `3600`   | Session TTL in seconds                |

---

## SSE Resumability

The server implements SSE resumability per [MCP 2025-06-18 specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#resumability-and-redelivery), allowing clients to reconnect and resume receiving events using the `Last-Event-ID` header. This is powered by the `MCPEventStore` component.

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant EventStore
    participant Storage

    rect rgb(240, 248, 255)
        Note over Client,Storage: Normal SSE Event Flow
        Client->>Server: POST /mcp
        Server->>EventStore: storeEvent(streamId, message)
        EventStore->>Storage: set(mcp-event:eventId)
        EventStore->>Storage: appendToList(mcp-stream-events:streamId)
        Server-->>Client: SSE event with id: eventId
    end

    rect rgb(255, 240, 245)
        Note over Client,Storage: Connection Breaks and Reconnects
        Client->>Server: GET /mcp with Last-Event-ID header
        Server->>EventStore: replayEventsAfter(lastEventId)
        EventStore->>Storage: get(mcp-event:lastEventId)
        EventStore->>Storage: getList(mcp-stream-events:streamId)
        EventStore->>Storage: get(missed events)
        EventStore-->>Server: Array of missed events
        Server-->>Client: SSE replay of missed events
    end
```

### EventStore Storage Keys

| Key Pattern                       | Description                                    |
| --------------------------------- | ---------------------------------------------- |
| `mcp-event:{eventId}`             | Individual event data stored as JSON           |
| `mcp-stream-events:{streamId}`    | Ordered list of event IDs for a specific stream |

### How It Works

1. **Event Storage**: When the server sends an SSE event, it stores the event data and appends the event ID to the stream's index list using atomic operations.

2. **Client Reconnection**: When a client reconnects with a `Last-Event-ID` header, the server looks up which stream the event belongs to.

3. **Event Replay**: The server retrieves all event IDs from the stream index that come after the last received event and replays them to the client.

4. **TTL Management**: Events expire automatically based on the configured session TTL (default: 1 hour) to prevent unbounded storage growth.

---

## Stateful Session Management

When deploying the MCP server as a cluster, sessions must be shared across instances. The server uses a session replay mechanism to maintain state:

```mermaid
sequenceDiagram
    box MCP Clients
        participant Client
    end
    box MCP Server Cluster
        participant Server1 as Server 1
        participant Server2 as Server 2
    end
    participant Cache as Redis/Valkey Cache

    rect rgb(240, 248, 255)
        Note over Client,Cache: Initialization
        Client->>Server1: POST InitializeRequest
        Server1->>Cache: Save session into cache<br/>mcp-session:{session-id}<br/>{ initialRequest: requestBody }
        Server1->>Server1: Create/Save transport in memory
        Server1-->>Client: InitializeResponse<br/>Mcp-Session-Id: 1868a90c...
        Client->>Server1: POST InitializedNotification<br/>Mcp-Session-Id: 1868a90c...
        Server1-->>Client: 202 Accepted
    end

    rect rgb(255, 248, 240)
        Note over Client,Cache: Client requests
        Client->>Server1: POST ...requests...<br/>Mcp-Session-Id: 1868a90c...
        Server1->>Cache: Get session<br/>mcp-session:{session-id}
        Cache-->>Server1: (not needed - transport in memory)
        Server1-->>Client: ...response...
        Client->>Server1: POST ... notification/response ...<br/>Mcp-Session-Id: 1868a90c...
        Server1-->>Client: 202 Accepted
    end

    rect rgb(255, 240, 245)
        Note over Client,Cache: Request hits different server instance
        Client->>Server2: POST ...requests...<br/>Mcp-Session-Id: 1868a90c...
        Server2->>Cache: Get session
        Cache-->>Server2: mcp-session:{session-id}
        Server2->>Server2: Replay initializeRequest<br/>with mocked req/res
        Server2->>Server2: Create/Save transport in memory
        Server2-->>Client: ...response...
        Client->>Server2: POST ... notification/response ...<br/>Mcp-Session-Id: 1868a90c...
        Server2-->>Client: 202 Accepted
    end
```

### How Session Replay Works

1. **Initial Request**: When a client first connects, Server 1 saves the `InitializeRequest` body to the cache along with the session ID.

2. **Same Server**: If subsequent requests hit the same server, the transport is already in memory - no cache lookup needed.

3. **Different Server**: If a request hits Server 2 (which doesn't have the transport in memory):
   - Server 2 retrieves the session data from the cache
   - It replays the original `InitializeRequest` with mocked request/response objects
   - This recreates the transport in Server 2's memory
   - The actual request is then processed normally

This approach enables horizontal scaling while maintaining MCP's stateful session semantics.

### Design References

- Inspired by [MCP GitHub Discussion #102](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/102)
- Follows the [MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/) session management guidelines
