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
    - `/storage/`: Pluggable storage abstraction (Memory/Valkey)
  - `/tools`: MCP tool implementations with streaming support
  - `/prompts`: MCP prompt handlers and registry
  - `/libraries`: External service integrations (AWS SDK)
  - `/config`: Centralized configuration with Zod validation
- `/test`: Test files and setup utilities

## Development Commands

- **Build**: `npm run build` (Rspack)
- **Development**: `npm run dev` (auto-reload + pretty logging)
- **Production**: `npm start`
- **Type check**: `npm run typecheck`
- **Lint**: `npm run lint` / `npm run lint:fix`
- **Format**: `npm run format` / `npm run format:check`
- **Test**: `npm test` / `npm run test:watch`
- **MCP Inspector**: `npm run test:inspector`
- **Docker**: `npm run docker:build` / `npm run docker:run`

## TypeScript & Code Style

- **Language**: Use TypeScript for all development with strict mode enabled
- **Strictness**: Maximum TypeScript strictness (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`)
- **Module System**: ESM with NodeNext resolution, path aliases (`@/` → `src/`)
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
  .inputSchema(MyInputSchema)
  .outputSchema(MyOutputSchema)
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

**Session Management:**

- Stateful sessions using Valkey for clustering support
- Session replay mechanism for distributed deployments
- Proper transport lifecycle management

## Testing

- **Framework**: Jest with ts-jest preset, Node.js environment
- **Test Files**: `*.test.ts` pattern in `src/__tests__/` or alongside source
- **Coverage**: Enabled with text, lcov, clover, and json reporters
- **Timeout**: 10 seconds default with auto-clear and restore mocks
- **Test Writing**: Use descriptive names without "should" prefix
- **Commands**:

  ```bash
  npm test                    # Run all tests
  npm test -- --coverage     # Run with coverage
  npm test -- path/to/test   # Run specific test
  npm run test:watch         # Watch mode
  ```

## Architecture

- **Runtime**: Node.js ≥22.17.0, npm ≥11.5.2
- **Build System**: Rspack for fast TypeScript compilation
- **Transport**: HTTP-based MCP server with Express.js and streaming support
- **Authentication**: OAuth 2.0 proxy with Auth0, JWT tokens, session management
- **Storage**: Pluggable storage with Memory and Valkey (Redis-compatible) implementations
- **AWS Integration**: ECS, S3, Bedrock Runtime, CloudWatch Logs
- **Logging**: Pino structured logging with context tracking and request correlation

## Security & Best Practices

- **Authentication**: OAuth 2.0 flow with Auth0 provider, JWT tokens with configurable TTL
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
npm run lint          # ESLint with TypeScript rules
npm run typecheck     # TypeScript compilation check
npm run format:check  # Prettier formatting check
npm run test          # Jest test suite
npm run build         # Production build verification
```

All checks MUST pass before merging. Use `npm run lint:fix` and `npm run format` to auto-fix issues.

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

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

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

### 3. Initialize Development Environment

Run the one-time setup script:

```bash
npm run dev:setup
```

This command uses `docker-compose` to start the Valkey (Redis-compatible) database required for session and data storage.

### 4. Run the Development Server

```bash
npm run dev
```

This will start the server with auto-reloading on file changes. The server will be accessible at `http://localhost:3000`.

**MCP Inspector Testing**:

```bash
cp mcp-config.example.json mcp-config.json
npm run test:inspector        # Test with MCP Inspector
```

**Local Testing with Cursor**:
Create `.cursor/mcp.json` with server configuration pointing to `http://localhost:3000/mcp`

Always run quality checks before committing. This project maintains high code quality with comprehensive TypeScript strictness and MCP protocol compliance.
