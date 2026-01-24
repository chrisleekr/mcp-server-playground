// TODO: Not yet implemented
import fs from 'fs/promises';
import zodToJsonSchema from 'zod-to-json-schema';

import { config } from '@/config/manager';
import { loggingContext, sendProgressNotification } from '@/core/server';
import {
  ToolBuilder,
  type ToolContext,
  type ToolInputSchema,
  type ToolResult,
} from '@/tools/types';

import {
  type ProjectInput,
  ProjectInputSchema,
  type ProjectOutput,
} from './types';

async function* executeProject(
  input: ProjectInput,
  context: ToolContext
): AsyncGenerator<ToolResult & { data?: ProjectOutput }> {
  const progressToken = context.progressToken;

  loggingContext.log('info', `Progress token: ${progressToken}`);

  loggingContext.setContextValue('tool', 'project');
  // Get the project path from config
  const projectPath = config.tools.project.path;
  const { keywords } = input;

  // if keywords is empty, return an error
  if (keywords.length === 0) {
    loggingContext.log('error', 'Keywords are required', {
      data: { input },
    });
    yield {
      success: false,
      error: 'Keywords are required',
    };
  }

  if (context.server) {
    await sendProgressNotification(context.server, {
      progressToken,
      progress: 0,
      total: 100,
      message: 'Starting project tool',
    });
  }

  // Recursively search for files containing keywords
  const matchingFiles: string[] = [];

  async function searchDirectory(
    dirPath: string,
    keywords: string[]
  ): Promise<void> {
    loggingContext.log('debug', 'Searching directory', {
      data: { path: dirPath },
    });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dirPath is validated input
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    loggingContext.log('debug', 'Entries', { data: { entries } });

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;

      if (entry.isDirectory()) {
        // Skip node_modules and .git directories
        if (entry.name === 'node_modules' || entry.name === '.git') {
          loggingContext.log(
            'debug',
            'Skipping node_modules or .git directory',
            {
              data: { path: fullPath },
            }
          );
          continue;
        }
        loggingContext.log('debug', 'Searching subdirectory', {
          data: { path: fullPath },
        });
        // eslint-disable-next-line no-await-in-loop -- recursive directory traversal must be sequential
        await searchDirectory(fullPath, keywords);
      } else if (entry.isFile()) {
        try {
          // eslint-disable-next-line no-await-in-loop, security/detect-non-literal-fs-filename -- sequential file reading with validated path
          const content = await fs.readFile(fullPath, 'utf-8');
          // Check if any keyword is present in the file content
          if (
            keywords.some(keyword =>
              content.toLowerCase().includes(keyword.toLowerCase())
            )
          ) {
            loggingContext.log('debug', 'Found keyword in file', {
              data: { path: fullPath },
            });
            matchingFiles.push(fullPath);
          } else {
            loggingContext.log('debug', 'No keyword found in file', {
              data: { path: fullPath },
            });
          }
        } catch (error) {
          loggingContext.log('warn', 'Failed to read file', {
            data: { error, path: fullPath },
          });
        }
      }
    }
  }

  await searchDirectory(projectPath, keywords);

  if (context.server) {
    await sendProgressNotification(context.server, {
      progressToken,
      progress: 100,
      total: 100,
      message: 'Project tool executed successfully',
    });
  }

  loggingContext.log('info', 'Project tool executed successfully', {
    data: { files: matchingFiles },
  });
  yield {
    success: true,
    data: { files: matchingFiles },
  };
}

export const projectTool = new ToolBuilder<ProjectInput, ProjectOutput>(
  'project'
)
  .description('Find keywords in the current project')
  .inputSchema(zodToJsonSchema(ProjectInputSchema) as typeof ToolInputSchema)
  .examples([
    {
      input: {
        keywords: ['react', 'node', 'typescript'],
      },
      output: {
        success: true,
        data: {
          files: ['src/index.ts', 'src/utils.ts'],
        },
      },
      description: 'Find keywords in the current project',
    },
  ])
  .tags(['project', 'utility', 'core'])
  .version('1.0.0')
  .timeout(5000)
  .streamingImplementation(executeProject)
  .build();
