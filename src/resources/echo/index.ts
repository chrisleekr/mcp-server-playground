import { type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

import {
  type Resource,
  ResourceBuilder,
  type ResourceContext,
  type ResourceTemplate,
  ResourceTemplateBuilder,
} from '@/resources/types';

/**
 * Echo resource - provides documentation for the echo tool
 */
export const echoResource: Resource = new ResourceBuilder(
  'echo://documentation'
)
  .name('Echo Tool Documentation')
  .title('Echo Tool Documentation')
  .description('Documentation for the echo tool functionality')
  .mimeType('text/markdown')
  .annotations({
    audience: ['user', 'assistant'],
    priority: 0.7,
  })
  .readImplementation(
    (uri: string, _context: ResourceContext): Promise<ReadResourceResult> => {
      const documentation = `# Echo Tool Documentation

## Overview

The Echo tool is a utility that echoes back messages with optional transformations.

## Features

- **Message Echo**: Returns the input message
- **Uppercase Transformation**: Optionally converts message to uppercase
- **Repetition**: Optionally repeats the message multiple times

## Usage

### Basic Echo

\`\`\`json
{
  "message": "Hello, World!"
}
\`\`\`

### With Transformations

\`\`\`json
{
  "message": "Hello",
  "uppercase": true,
  "repeat": 3
}
\`\`\`

## Response Format

The tool returns a structured response with:

- \`originalMessage\`: The input message
- \`processedMessage\`: The transformed output
- \`repeat\`: Number of repetitions applied
- \`uppercase\`: Whether uppercase was applied
- \`length\`: Final message length

## Resource URI

This documentation is available at: \`${uri}\`
`;

      return Promise.resolve({
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: documentation,
          },
        ],
      });
    }
  )
  .build();

/**
 * Echo result resource template - provides access to echo results by ID
 */
export const echoResourceTemplate: ResourceTemplate =
  new ResourceTemplateBuilder('echo://result/{resultId}')
    .name('Echo Result')
    .title('Echo Operation Result')
    .description('The result of an echo operation, accessed by result ID')
    .mimeType('application/json')
    .annotations({
      audience: ['assistant'],
      priority: 0.5,
    })
    .readImplementation(
      (uri: string, _context: ResourceContext): Promise<ReadResourceResult> => {
        const resultIdMatch = /echo:\/\/result\/(.+)/.exec(uri);
        const resultId = resultIdMatch?.[1] ?? 'unknown';

        const resultData = {
          resultId,
          message: `This is a placeholder for echo result ${resultId}`,
          timestamp: new Date().toISOString(),
          note: 'In a real implementation, this would retrieve the cached result',
        };

        return Promise.resolve({
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(resultData, null, 2),
            },
          ],
        });
      }
    )
    .build();
