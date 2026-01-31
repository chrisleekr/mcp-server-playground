# AGENTS.md: AI Collaboration Guide

This document provides essential guidelines for AI models interacting with this MCP (Model Context Protocol) server playground project. Adhering to these standards ensures consistency and maintains code quality.

## Project Overview

**MCP Server Playground** - A TypeScript-based Model Context Protocol server with HTTP transport, OAuth proxy for 3rd party authorization (Auth0), and stateful session management using Valkey. Provides tools for AWS services, system utilities, and streaming capabilities.

**Project Structure:**

- `/src`: Source code directory
  - `/core`: MCP server core implementation
    - `/mcpServer.ts`: Main server with capabilities and handlers
    - `/server/http/`: Express.js HTTP transport with middleware
    - `/server/auth/`: OAuth proxy with dynamic client registration
    - `/server/transport/`: Session management and transport handling
    - `/storage/`: Pluggable storage abstraction (Memory/Valkey) with EventStore for SSE resumability
  - `/tools`: MCP tool implementations with streaming support
  - `/prompts`: MCP prompt handlers and registry
  - `/resources`: MCP resource implementations with templates
  - `/libraries`: External service integrations (AWS SDK)
  - `/config`: Centralized configuration with Zod validation
- `/test`: Test files and setup utilities

## Development Commands

- **Build**: `bun run build` (Bun bundler)
- **Development**: `bun run dev` (auto-reload + pretty logging)
- **Production**: `bun run start`
- **Type check**: `bun run typecheck`
- **Lint**: `bun run lint` / `bun run lint:fix`
- **Format**: `bun run format` / `bun run format:fix`
- **Test**: `bun test` / `bun test --watch`
- **Test Coverage**: `bun test --coverage`
- **MCP Inspector**: `bun run test:inspector`
- **Docker**: `bun run docker:build` / `docker compose up -d`

## TypeScript & Code Style

- **Language**: Use TypeScript for all development with strict mode enabled
- **Strictness**: Maximum TypeScript strictness (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`)
- **Module System**: ESM with bundler resolution, path aliases (`@/` → `src/`)
- **Import Organization**: Auto-sorted with `simple-import-sort` plugin
- **Functions**: MUST include explicit return types for all functions
- **Naming Conventions**: Use meaningful variable/function names; prefer "URL" (not "Url"), "API" (not "Api"), "ID" (not "Id")
- **Comments**: Add JSDoc comments for complex logic and public APIs
- **Complexity Limits**: Max 15 complexity, 4 depth, 120 lines/function, 5 params
- **Error Handling**: No floating promises, require await, strict boolean expressions
- **Type Safety**: NEVER use `@ts-expect-error` or `@ts-ignore` - fix type issues properly
- **Patterns**: Prefer functional programming, `const` over `let`, template literals, async/await
- **Comments policy**: Only write high-value comments if at all. Avoid talking to the user through comments.

## MCP Implementation Patterns

**Server Setup:**

- Initialize MCP server with proper capabilities (streaming, progress notifications)
- Use `@modelcontextprotocol/sdk` for core MCP functionality
- Implement HTTP transport with `StreamableHTTPServerTransport`

**Tool Development:**

```typescript
// Use ToolBuilder pattern for creating tools
const myTool = new ToolBuilder<MyInput, MyOutput>('tool-name')
  .description('Tool description')
  .title('Human-Readable Tool Title')
  .inputSchema(MyInputSchema)
  .outputSchema(MyOutputSchema)
  .annotations({
    destructive: false,
    irreversible: false,
    requiresConfirmation: true,
    accessesExternalResources: true,
  })
  .streamingImplementation(async function* (input, context) {
    // Implement streaming tool logic with progress notifications
    yield { success: true, data: result };
  })
  .build();
```

**Tool Requirements:**

- All tools MUST implement `ToolBuilder` interface with streaming support
- Use Zod schemas for input/output validation
- Implement proper error handling with structured responses
- Support progress notifications for long-running operations
- Register tools in `ToolRegistry` for automatic discovery
- Support tool annotations per MCP 2025-06-18 for trust/safety metadata:
  - `destructive`: Whether the tool may perform destructive operations
  - `irreversible`: Whether the tool performs non-reversible operations
  - `requiresConfirmation`: Whether user confirmation is required
  - `accessesExternalResources`: Whether the tool accesses network/filesystem

**Resource Development:**

```typescript
// Use ResourceBuilder pattern for creating resources
const myResource = new ResourceBuilder('file:///example.txt')
  .name('Example File')
  .title('Example File Title')
  .description('An example text file')
  .mimeType('text/plain')
  .annotations({ audience: ['user'], priority: 0.8 })
  .readImplementation(async (uri, context) => ({
    contents: [{ uri, mimeType: 'text/plain', text: 'Hello World' }],
  }))
  .build();

// Use ResourceTemplateBuilder for parameterized resources
const myTemplate = new ResourceTemplateBuilder('file:///{path}')
  .name('File Resource')
  .description('Access files by path')
  .readImplementation(async (uri, context) => {
    // Extract path from URI and return content
    return { contents: [{ uri, text: 'File content' }] };
  })
  .build();
```

**Resource Requirements:**

- All resources MUST implement `ResourceBuilder` or `ResourceTemplateBuilder` interface
- Use URI schemes appropriate for the resource type
- Support resource annotations (audience, priority, lastModified) per MCP 2025-06-18
- Register resources in `ResourceRegistry` for automatic discovery

**Session Management:**

- Stateful sessions using Valkey for clustering support
- Session replay mechanism for distributed deployments
- SSE resumability with EventStore for client reconnection via `Last-Event-ID` header
- Proper transport lifecycle management

## Testing

- **Framework**: Bun's built-in test runner
- **Test Files**: `*.test.ts` pattern in `src/__tests__/` or alongside source
- **Coverage**: Enabled with text and lcov reporters
- **Timeout**: 10 seconds default
- **Test Writing**: Use descriptive names without "should" prefix
- **Commands**:

  ```bash
  bun test                    # Run all tests
  bun test --coverage         # Run with coverage
  bun test path/to/test       # Run specific test
  bun test --watch            # Watch mode
  ```

## Architecture

- **Runtime**: Bun ≥1.3.8
- **Build System**: Bun's built-in bundler
- **Transport**: HTTP-based MCP server with Express.js and streaming support
- **Authentication**: OAuth 2.0 proxy with Auth0, JWT tokens, session management
- **Storage**: Pluggable storage with Memory and Valkey (Redis-compatible) implementations
- **AWS Integration**: ECS, S3, Bedrock Runtime, CloudWatch Logs
- **Logging**: Pino structured logging with context tracking and request correlation

## Security & Best Practices

- **Authentication**: OAuth 2.0 flow with Auth0 provider, JWT tokens with configurable TTL
- **Origin Validation**: Strict Origin header validation on MCP endpoints to prevent DNS rebinding attacks
- **Authorization Discovery**: WWW-Authenticate header on 401 responses with resource metadata URL per RFC 9728
- **RFC Compliance**: RFC 8707 Resource Indicators for audience validation, RFC 7519 JWT aud array support
- **Environment Variables**: NEVER commit secrets; use `.env` files for local development
- **Input Validation**: Use Zod schemas for all input validation and type safety
- **Security Headers**: Helmet middleware and rate limiting enabled
- **AWS Credentials**: Support multiple credential providers (profile, environment, instance metadata)
- **Protocol Enforcement**: MCP protocol version validation middleware
- **Error Handling**: Structured error responses with proper HTTP status codes

## Configuration Management

Centralized in `src/config/` with Zod validation:

- **Type Definitions**: `src/config/type.ts` - Zod schemas for all config options
- **Manager**: `src/config/manager.ts` - Singleton pattern with environment overrides
- **Environment Variables**: Override any config via environment variables
- **Required Updates**: When adding config options, update:
  1. Schema definitions with Zod validation
  2. Default values in ConfigManager
  3. Environment variable documentation
  4. Related service configurations

## Quality Checks

Before submitting changes, run these programmatic checks:

```bash
bun run lint          # ESLint with TypeScript rules
bun run typecheck     # TypeScript compilation check
bun run format        # Prettier formatting check
bun test              # Bun test suite
bun run build         # Production build verification
```

All checks MUST pass before merging. Use `bun run lint:fix` and `bun run format:fix` to auto-fix issues.

## Pull Request Guidelines

- **Title**: Ensure title is meaningful and clear
- **Description**: Include clear description of changes and rationale
- **Issues**: Reference related GitHub issues using `#issue-number`
- **Tests**: Ensure all existing tests pass and add tests for new features
- **Coverage**: Maintain or improve test coverage
- **Screenshots**: Include screenshots for UI/output changes
- **Focus**: Keep PRs focused on a single concern or feature
- **MCP Compliance**: Verify MCP protocol compatibility with inspector testing

## Git Workflow

- **Pre-commit Hooks**: Husky + lint-staged for automated formatting and linting
- **Commit Convention**: Use conventional commits (enforced by commitlint)
- **Branch Protection**: NEVER force push to main branch
- **Quality Gates**: All commits must pass linting, type checking, and tests

## Development Setup

The following steps will get your local development environment up and running.

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment

Create a `.env` file by copying the example:

```bash
cp .env.example .env
```

This file holds configuration for the server, authentication, and tools. Key variables include:

- `MCP_CONFIG_SERVER_HTTP_PORT`: The port for the MCP server (default: `3000`).
- `MCP_CONFIG_STORAGE_TYPE`: The storage backend. Can be `valkey` (default, requires Docker) or `memory`.
- `MCP_CONFIG_SERVER_AUTH_ENABLED`: Set to `true` to enable Auth0 authentication, or `false` to disable it for local development.
- `AUTH0_*_...`: If auth is enabled, these variables must be configured with your Auth0 application details.
- `MCP_CONFIG_TOOLS_AWS_*`: (Optional) AWS credentials for tools that interact with AWS services.

### 4. Initialize Development Environment

Run the one-time setup script:

```bash
bun run dev:setup
```

This command uses `docker-compose` to start the Valkey (Redis-compatible) database required for session and data storage.

### 5. Run the Development Server

```bash
bun run dev
```

This will start the server with auto-reloading on file changes. The server will be accessible at `http://localhost:3000`.

**MCP Inspector Testing**:

```bash
cp mcp-config.example.json mcp-config.json
bun run test:inspector        # Test with MCP Inspector
```

**Local Testing with Cursor**:
Create `.cursor/mcp.json` with server configuration pointing to `http://localhost:3000/mcp`

Always run quality checks before committing. This project maintains high code quality with comprehensive TypeScript strictness and MCP protocol compliance.
