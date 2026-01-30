# MCP Resources

This directory contains MCP resource implementations following the [MCP 2025-06-18 specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources).

## Overview

Resources provide read-only data that MCP clients can access. Unlike tools (which execute actions), resources are static or dynamic data sources identified by URIs.

## Available Resources

| Resource           | URI                    | Description                     | MIME Type       |
| ------------------ | ---------------------- | ------------------------------- | --------------- |
| Echo Documentation | `echo://documentation` | Documentation for the echo tool | `text/markdown` |

## Resource Templates

Resource templates use [RFC 6570 URI Templates](https://datatracker.ietf.org/doc/html/rfc6570) for parameterized access:

| Template    | URI Pattern                | Description                         | MIME Type          |
| ----------- | -------------------------- | ----------------------------------- | ------------------ |
| Echo Result | `echo://result/{resultId}` | Access echo operation results by ID | `application/json` |

## Creating Resources

### Static Resources

Use `ResourceBuilder` for resources with fixed URIs:

```typescript
import { ResourceBuilder } from '@/resources/types';

export const myResource = new ResourceBuilder('myscheme://path')
  .name('Resource Name')
  .title('Human-Readable Title')
  .description('Description of the resource')
  .mimeType('text/plain')
  .annotations({
    audience: ['user', 'assistant'],
    priority: 0.7,
  })
  .readImplementation(async (uri, context) => ({
    contents: [{ uri, mimeType: 'text/plain', text: 'Content here' }],
  }))
  .build();
```

### Resource Templates

Use `ResourceTemplateBuilder` for parameterized resources:

```typescript
import { ResourceTemplateBuilder } from '@/resources/types';

export const myTemplate = new ResourceTemplateBuilder('myscheme://item/{id}')
  .name('Item Resource')
  .description('Access items by ID')
  .mimeType('application/json')
  .readImplementation(async (uri, context) => {
    const idMatch = /myscheme:\/\/item\/(.+)/.exec(uri);
    const id = idMatch?.[1] ?? 'unknown';
    return {
      contents: [
        { uri, mimeType: 'application/json', text: JSON.stringify({ id }) },
      ],
    };
  })
  .build();
```

## Registration

Resources are automatically loaded by `resourceLoader.loadAllResources()` during server initialization. To add a new resource:

1. Create the resource in a subdirectory (e.g., `src/resources/myresource/index.ts`)
2. Export the resource from `src/resources/index.ts`
3. Register it in `src/resources/loader.ts`

## Annotations

Per MCP 2025-06-18, resources support the following annotations:

| Annotation     | Type                        | Description                               |
| -------------- | --------------------------- | ----------------------------------------- |
| `audience`     | `('user' \| 'assistant')[]` | Who the content is intended for           |
| `priority`     | `number` (0.0-1.0)          | Relative importance (1 = most, 0 = least) |
| `lastModified` | `string` (ISO 8601)         | When the resource was last modified       |

## Content Types

Resources can return different content types:

- **Text content**: Plain text, markdown, or other text formats
- **Binary content**: Base64-encoded binary data (via `blob` field)

## Directory Structure

```
src/resources/
├── echo/
│   └── index.ts      # Echo resource and template implementations
├── index.ts          # Re-exports all resource modules
├── loader.ts         # Resource loader singleton
├── registry.ts       # Resource registry for registration/lookup
├── types.ts          # TypeScript types and builders
└── README.md         # This file
```
