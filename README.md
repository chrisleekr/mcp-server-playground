# MCP Server Playground

A playground for Model Context Protocol (MCP) server built with TypeScript and Streamable HTTP transport with an OAuth Proxy for 3rd party authorization servers like Auth0.

## Features

- MCP Server implementation: HTTP-Based Streamable transport using `@modelcontextprotocol/sdk` with HTTP transport, session management, and tool execution.
- OAuth authentication/3rd party authorization: Implements an OAuth server for MCP clients to process 3rd party authorization servers like Auth0, providing Dynamic Application Registration for MCP server.
- Storage: Provide storage for MCP server to store data like OAuth sessions, tokens, etc.
- Session Management: Support stateful sessions by using replay of initial request.
- Tools:
  - `aws-ecs`: Investigate the ECS service, task and cloudwatch logs using AWS ECS, Cloudwatch Logs and Bedrock
  - `aws-s3`: Investigate the S3 bucket and objects using AWS S3
  - `echo`: Echo the input
  - `system-time`: Get the system time
  - `streaming`: Streaming response
  - `project`: Project management
- Prompts: `echo`

## Why this project exists?

- The Model Context Protocol spec [requires Dynamic Application Registration](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization#dynamic-client-registration) because it provides a standardized way for MCP clients to automatically register with new servers and obtain OAuth client IDs without user interaction. The main reason for this mechanism is because MCP clients can't know all possible services in advance and manual registration would create significant effort for users and it is not scalable. If do not support Dynamic Application Registration, then MCP clients need to provide OAuth client ID and secret to the server, which is not secure and not scalable.
- However, enabling Dynamic Application Registration (if supported) becomes a [security risk](https://github.com/auth0/docs/blob/master/articles/api-auth/dynamic-client-registration.md#enable-dynamic-registration) because the endpoint is a public endpoint that anyone can create OAuth clients. It can easily be abused, such as by flooding with unwanted client registrations. Hence, Auth0 has disabled Dynamic Application Registration
- As a result, this project provides a way to enable Dynamic Application Registration for MCP server by using OAuth Proxy, but delegating authorization to 3rd party authorization server like Auth0, Github, Google, etc.

## Endpoints

| Endpoint                                    | Description                              |
| ------------------------------------------- | ---------------------------------------- |
| GET /ping                                   | Ping the server                          |
| POST /mcp                                   | MCP protocol request with authentication |
| DELETE /mcp                                 | Session termination                      |
| GET /.well-known/oauth-authorization-server | OAuth authorization server metadata      |
| GET /.well-known/oauth-protected-resource   | OAuth protected resources metadata       |
| POST /oauth/register                        | Register a new MCP client                |
| GET /oauth/authorize                        | Handle authorization request             |
| POST /oauth/token                           | Handle token request                     |
| POST /oauth/revoke                          | Handle token revocation                  |
| GET /oauth/stats                            | Get OAuth service statistics             |
| GET /oauth/auth0-callback                   | Handle Auth0 callback                    |

## Getting Started

### Installation

1. Clone the repository:

   ```bash
   git clone <your-repo>
   cd mcp-server-playground
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

4. Set up the MCP server for local development

   ```bash
   npm run dev:setup
   ```

#### Helm Chart

```bash
helm repo add chrisleekr https://chrisleekr.github.io/helm-charts/
helm repo update
helm install mcp-server-playground chrisleekr/mcp-server-playground
```

### Set up the MCP server for Cursor

1. Create MCP configuration file for local build

   Create a `.cursor/mcp.json` file in your project directory (for project-specific setup) or `~/.cursor/mcp.json` in your home directory (for global setup):

   ```json
   {
     "mcpServers": {
       "mcp-server-playground-cursor": {
         "type": "http",
         "url": "http://localhost:3000/mcp"
       }
     }
   }
   ```

### Use `npx @modelcontextprotocol/inspector` to test the MCP server

1. Copy `mcp-config.example.json` to `mcp-config.json`

2. Edit `mcp-config.json` to point to the correct MCP server

3. Run the inspector

   ```bash
   npm run docker:run

   # Then run the inspector
   npx @modelcontextprotocol/inspector -y --config ./mcp-config.json --server mcp-server-playground-cursor
   ```

   or

   ```bash
   npm run test:inspector
   ```

### Setup Auth0 for authorization

1. Create a new application in Auth0
   - Go to [Auth0 Dashboard](https://manage.auth0.com/)
   - Click on "Applications"
   - Click on "Create Application"
     - Name: MCP Server Boilerplate
     - Application Type: Regular Web Application
   - Click on "Create"

2. Set up the application
   - Click on "Settings"
   - Set the following settings:
     - Allowed Callback URLs: `http://localhost:3000/oauth/auth0-callback`
     - Allowed Web Origins: `http://localhost:3000`

3. Create a new API
   - Click on "APIs"
   - Click on "Create API"
     - Name: MCP Server Boilerplate
     - Identifier: `urn:mcp-server-playground`
     - JSON Web Token (JWT) Profile: Auth0
     - JSON Web Token (JWT) Signature Algorithm: RS256
   - Click on "Create"

## How to make stateful session with multiple MCP Server instances?

When the MCP server is deployed as a cluster, it is not possible to make it stateful with multiple MCP Server instances because the transport is not shared between instances by design.

To make it truly stateful, I used Valkey to store the session id with the initial request.

When the request comes in to alternative MCP server instance, it will check if the session id is in the Valkey. If it is, it will replay the initial request and connect the transport to the server.

Inspired from [https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/102](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/102)

The below diagram shows the flow of the stateful session management.

<img width="681" height="882" alt="Image" src="https://github.com/user-attachments/assets/7f56339e-2665-47cb-a882-69d3c7096b47" />

## TODO

- [ ] Streaming is not working as expected. It returns the final result instead of streaming the data.

## Screenshots

|                                           Metadata Discovery                                           |                                           Client Registration                                           |                                           Preparing Authorization                                           |
| :----------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------: |
| ![Metadata Discovery](https://github.com/user-attachments/assets/eeb5ae6e-e48e-43d0-a923-5cc85228f3f1) | ![Client Registration](https://github.com/user-attachments/assets/bb0a4823-b603-4330-9ad6-47b5dba758a7) | ![Preparing Authorization](https://github.com/user-attachments/assets/41dfa521-04de-467f-8fd2-7dec792021b8) |

|                                                   Authorization with 3rd party server                                                    |                       Request Authorization and acquire authorization code                        |                                  Token Request and Authentication Complete                                  |
| :--------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------: |
| ![Request Authorization and acquire authorization code](https://github.com/user-attachments/assets/4aaf5162-805f-4772-b3fe-39d4e7cae157) | ![Token Request](https://github.com/user-attachments/assets/84a51bab-458f-4c3f-8f7d-34c5e8c7e2eb) | ![Authentication Complete](https://github.com/user-attachments/assets/b963a2e2-1308-4c7d-a9fa-86a8d493896d) |

## References

- [Authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [Dynamic Application Registration](https://auth0.com/docs/get-started/applications/dynamic-client-registration)
- [Let's fix OAuth in MCP](https://aaronparecki.com/2025/04/03/15/oauth-for-model-context-protocol)
- [OAuth for MCP explained with a real-world example](https://stytch.com/blog/oauth-for-mcp-explained-with-a-real-world-example/)
- [Treat the MCP server as an OAuth resource server rather than an authorization server](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/205)
- [HTTP + SSE MCP Server w/ OAuth by @NapthaAI](https://github.com/NapthaAI/http-oauth-mcp-server)
