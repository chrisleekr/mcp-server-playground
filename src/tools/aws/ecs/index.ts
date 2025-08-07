/* eslint-disable max-statements */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
import { Task } from '@aws-sdk/client-ecs';
import yaml from 'yaml';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { config } from '@/config/manager';
import { sendProgressNotification } from '@/core/server';
import { loggingContext } from '@/core/server/http/context';
import {
  describeServices,
  describeTasks,
  getQueryResults,
  invokeModel,
  listClusters,
  startQuery,
} from '@/libraries/aws';
import {
  createStructuredContent,
  Tool,
  ToolBuilder,
  ToolContext,
  ToolInputSchema,
  ToolResult,
} from '@/tools/types';
import { formatDate } from '@/utils/date';

import packageJson from '../../../../package.json';
import {
  AWSECSInput,
  AWSECSInputSchema,
  AWSECSOutput,
  AWSECSOutputContent,
  AWSECSOutputContentSchema,
  AWSECSOutputSchema,
} from './types';

async function* executeAWSECS(
  input: AWSECSInput,
  context: ToolContext
): AsyncGenerator<ToolResult & { data?: AWSECSOutput }> {
  const progressToken = context.progressToken;

  loggingContext.log('info', `Progress token: ${progressToken}`);

  loggingContext.setContextValue('tool', 'aws-ecs');
  const startTime = Date.now();

  try {
    loggingContext.log('debug', 'Executing AWS ECS tool', { data: { input } });

    // Send mid-progress notification
    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 0,
        total: 100,
        message: 'Starting AWS ECS tool',
      });
    }

    // Validate input using Zod schema
    const validatedInput = AWSECSInputSchema.parse(input);

    const output: AWSECSOutputContent = {
      analysis: '',
      service: {
        desiredCount: undefined,
        runningCount: undefined,
        pendingCount: undefined,
        events: [],
      },
      task: {
        cpu: undefined,
        memory: undefined,
        healthStatus: undefined,
        lastStatus: undefined,
        startedAt: undefined,
        containers: [],
      },
      cloudwatchLogs: [],
    };

    // Get ECS clusters
    const listClustersResponse = await listClusters({});

    loggingContext.log('info', 'ECS clusters listed', {
      data: { listClustersResponse },
    });

    // Find the cluster that matches the input
    const cluster = listClustersResponse.clusterArns?.find(clusterArn =>
      clusterArn.includes(validatedInput.ecsCluster)
    );

    if (cluster === undefined) {
      throw new Error(`Cluster ${validatedInput.ecsCluster} not found`);
    }

    // Get ECS task describe
    const describeTasksResponse = await describeTasks({
      cluster,
      tasks: [validatedInput.ecsTaskArn],
    });

    loggingContext.log('info', 'ECS task described', {
      data: { describeTasksResponse },
    });

    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 20,
        total: 100,
        message: 'ECS task described',
      });
    }

    const task: Task | undefined = describeTasksResponse.tasks?.[0];

    output.task.cpu = task?.cpu;
    output.task.memory = task?.memory;
    output.task.healthStatus = task?.healthStatus;
    output.task.lastStatus = task?.lastStatus;
    output.task.startedAt = task?.startedAt
      ? formatDate(task.startedAt)
      : undefined;
    output.task.containers = describeTasksResponse.tasks?.[0]?.containers?.map(
      container => ({
        name: container.name ?? '',
        lastStatus: container.lastStatus ?? '',
      })
    );
    output.task.tags = task?.tags?.map(tag => ({
      key: tag.key ?? '',
      value: tag.value ?? '',
    }));

    output.task.group = task?.group;

    // Get service from group
    const serviceName =
      task?.group?.split(':')[0] === 'service'
        ? task.group.split(':')[1]
        : undefined;

    if (serviceName !== undefined) {
      const describeServicesResponse = await describeServices({
        cluster,
        services: [serviceName],
      });

      loggingContext.log('info', 'ECS service described', {
        data: { describeServicesResponse },
      });

      if (context.server) {
        await sendProgressNotification(context.server, {
          progressToken,
          progress: 40,
          total: 100,
          message: 'ECS service described',
        });
      }

      output.service.desiredCount =
        describeServicesResponse.services?.[0]?.desiredCount;
      output.service.runningCount =
        describeServicesResponse.services?.[0]?.runningCount;
      output.service.pendingCount =
        describeServicesResponse.services?.[0]?.pendingCount;
      output.service.events = describeServicesResponse.services?.[0]?.events
        ?.slice(0, 5)
        .map(event => ({
          message: event.message ?? '',
          createdAt: event.createdAt ? formatDate(event.createdAt) : undefined,
        }));
    }

    // Get cloudwatch logs
    const logGroupName = `/aws/ecs/containerinsights/${validatedInput.ecsCluster}/performance`;
    const taskId = validatedInput.ecsTaskArn.split('/').pop();

    const startQueryResponse = await startQuery({
      logGroupName,
      queryString: `fields @timestamp, CpuReserved, CpuUtilized, MemoryReserved, MemoryUtilized | filter ispresent(TaskId) and TaskId like /${taskId}/ and Type = "Task" | sort @timestamp desc | limit 10`,
      startTime: Date.now() - 30 * 60 * 1000, // Start time for last 30 minutes
      endTime: Date.now(), // End time for now
    });

    loggingContext.log('info', 'CloudWatch logs queried', {
      data: { startQueryResponse },
    });

    // Poll for query results until it's done
    while (startQueryResponse.queryId !== undefined) {
      await new Promise(resolve => global.setTimeout(resolve, 1000));

      const getQueryResultsResponse = await getQueryResults({
        queryId: startQueryResponse.queryId,
      });

      loggingContext.log('info', 'CloudWatch logs queried', {
        data: { getQueryResultsResponse },
      });

      if (
        getQueryResultsResponse.status !== undefined &&
        ['Complete', 'Failed', 'Cancelled', 'Timeout', 'Unknown'].includes(
          getQueryResultsResponse.status
        )
      ) {
        if (getQueryResultsResponse.status === 'Complete') {
          output.cloudwatchLogs =
            getQueryResultsResponse.results?.map(result => {
              const timestamp = result.find(
                field => field.field === '@timestamp'
              )?.value;
              const logAt =
                timestamp !== undefined
                  ? formatDate(new Date(timestamp))
                  : undefined;
              const cpuReserved = result.find(
                field => field.field === 'CpuReserved'
              )?.value;
              const cpuUtilized = result.find(
                field => field.field === 'CpuUtilized'
              )?.value;
              const cpuUtilizedPercentage =
                cpuUtilized !== undefined && cpuReserved !== undefined
                  ? (parseFloat(cpuUtilized) / parseFloat(cpuReserved)) * 100
                  : undefined;
              const memoryReserved = result.find(
                field => field.field === 'MemoryReserved'
              )?.value;
              const memoryUtilized = result.find(
                field => field.field === 'MemoryUtilized'
              )?.value;
              const memoryUtilizedPercentage =
                memoryUtilized !== undefined && memoryReserved !== undefined
                  ? (parseFloat(memoryUtilized) / parseFloat(memoryReserved)) *
                    100
                  : undefined;
              return {
                logAt,
                cpuReserved:
                  cpuReserved !== undefined
                    ? parseFloat(cpuReserved)
                    : undefined,
                cpuUtilized:
                  cpuUtilized !== undefined
                    ? parseFloat(cpuUtilized)
                    : undefined,
                cpuUtilizedPercentage,
                memoryReserved:
                  memoryReserved !== undefined
                    ? parseFloat(memoryReserved)
                    : undefined,
                memoryUtilized:
                  memoryUtilized !== undefined
                    ? parseFloat(memoryUtilized)
                    : undefined,
                memoryUtilizedPercentage,
              };
            }) ?? [];
        }

        break;
      } else {
        loggingContext.log('info', 'CloudWatch logs query not complete', {
          data: { getQueryResultsResponse },
        });
      }
    }

    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 60,
        total: 100,
        message: 'CloudWatch logs queried',
      });
    }

    // Invoke Bedrock model to summarize all information
    const content = `You are senior site reliability engineer specialized ECS tasks incident triage. You are given a summary of an ECS service, task and cloudwatch logs for the task. You are to summarize the information in a way that is easy to understand and use.

## ECS Service:
${yaml.stringify(output.service)}

## ECS Task:
${yaml.stringify(output.task)}

## CloudWatch Logs:
${yaml.stringify(output.cloudwatchLogs)}

## Instructions:

- Only use the information provided to you to summarize the information.
- Do not make up any information.
    `;
    const modelId = config.tools.aws.bedrock.model;

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 1000,
      temperature: 0.5,
    });

    const invokeModelResponse = await invokeModel({
      body,
      contentType: 'application/json',
      accept: 'application/json',
      modelId,
      trace: 'DISABLED',
      performanceConfigLatency: 'standard',
    });

    loggingContext.log('info', 'Bedrock model invoked', {
      data: { invokeModelResponse },
    });

    const response = invokeModelResponse.body.transformToString();

    const jsonResponse = JSON.parse(response.trim()) as {
      content: { type: string; text: string }[];
    };

    loggingContext.log('info', 'Bedrock model response parsed', {
      data: { jsonResponse },
    });

    output.analysis =
      jsonResponse.content.find(content => content.type === 'text')?.text ?? '';
    // Add links to the analysis
    const region = config.tools.aws.region;
    const ecsCluster = validatedInput.ecsCluster;
    const ecsService = serviceName;

    output.analysis = `${output.analysis}\n\n[View ECS Service](https://${region}.console.aws.amazon.com/ecs/v2/clusters/${ecsCluster}/services/${ecsService}/health?region=${region})`;

    if (context.server) {
      await sendProgressNotification(context.server, {
        progressToken,
        progress: 100,
        total: 100,
        message: 'AWS ECS tool completed',
      });
    }

    const executionTime = Date.now() - startTime;

    // Create structured content for the new MCP spec
    const structuredOutput = createStructuredContent(
      output,
      zodToJsonSchema(AWSECSOutputContentSchema),
      'json'
    );

    loggingContext.log('info', 'AWS ECS tool executed successfully', {
      data: {
        executionTime,
      },
    });

    yield {
      success: true,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: packageJson.version,
        mcpSpecVersion: '2025-06-18',
      },
      structuredContent: structuredOutput,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    loggingContext.log('error', 'AWS ECS tool execution failed', {
      data: {
        error: {
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        input,
        executionTime,
      },
    });

    yield {
      success: false,
      error: errorMessage,
      executionTime,
      timestamp: new Date().toISOString(),
      metadata: {
        toolVersion: packageJson.version,
        inputValidation: 'failed',
      },
    };
  }
}

export const awsEcsTool: Tool<AWSECSInput, AWSECSOutput> = new ToolBuilder<
  AWSECSInput,
  AWSECSOutput
>('aws_ecs')
  .description('Investigate the ECS service, task and cloudwatch logs')
  .inputSchema(zodToJsonSchema(AWSECSInputSchema) as typeof ToolInputSchema)
  .outputSchema(zodToJsonSchema(AWSECSOutputSchema))
  .examples([
    {
      description: 'Investigate the ECS service, task and cloudwatch logs',
      input: {
        ecsCluster: 'ecs-cluster-123456',
        ecsTaskArn:
          'arn:aws:ecs:ap-southeast-2:123456789:task/ecs-cluster-123456/123456789123456789123456789',
        ecsTaskDefinition: 'svc-test:123',
      },
      output: {
        success: true,
      },
    },
  ])
  .tags(['aws', 'ecs', 'task', 'service', 'cloudwatch'])
  .version(packageJson.version)
  .timeout(2000)
  .streamingImplementation(executeAWSECS)
  .build();
