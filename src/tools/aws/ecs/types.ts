import { z } from 'zod';

import { ToolResultSchema } from '@/tools/types';

export const AWSECSInputSchema = z.object({
  ecsCluster: z
    .string()
    .describe('The name of the ECS cluster i.e. ecs-cluster-123456'),
  ecsTaskArn: z
    .string()
    .describe(
      'The ARN of the ECS task i.e. arn:aws:ecs:ap-southeast-2:<account-id>:task/ecs-cluster-123456/<task-id>'
    ),
});

export type AWSECSInput = z.infer<typeof AWSECSInputSchema>;

export const AWSECSOutputContentSchema = z.object({
  analysis: z.string().describe('The analysis of the ECS task'),
  service: z
    .object({
      desiredCount: z
        .number()
        .optional()
        .describe('The desired count of the ECS service'),
      runningCount: z
        .number()
        .optional()
        .describe('The running count of the ECS service'),
      pendingCount: z
        .number()
        .optional()
        .describe('The pending count of the ECS service'),
      events: z
        .array(
          z.object({
            createdAt: z
              .string()
              .optional()
              .describe('The created at of the ECS event'),
            message: z.string().describe('The message of the ECS event'),
          })
        )
        .optional(),
    })
    .describe('The service of the ECS task'),
  task: z
    .object({
      group: z.string().optional().describe('The group of the ECS service'),
      cpu: z.string().optional().describe('The CPU of the ECS task'),
      memory: z.string().optional().describe('The memory of the ECS task'),
      healthStatus: z
        .string()
        .optional()
        .describe('The health status of the ECS task'),
      lastStatus: z
        .string()
        .optional()
        .describe('The last status of the ECS task'),
      startedAt: z
        .string()
        .optional()
        .describe('The started at of the ECS task'),
      containers: z
        .array(
          z.object({
            name: z.string().describe('The name of the ECS container'),
            lastStatus: z
              .string()
              .describe('The last status of the ECS container'),
          })
        )
        .optional(),
      tags: z
        .array(
          z.object({
            key: z.string().describe('The key of the ECS tag'),
            value: z.string().describe('The value of the ECS tag'),
          })
        )
        .optional(),
    })
    .describe('The task of the ECS task'),

  cloudwatchLogs: z
    .array(
      z.object({
        logAt: z
          .string()
          .optional()
          .describe(
            'The timestamp of the ECS log converted to a readable format i.e. 2025-08-07 10:00:00'
          ),
        cpuReserved: z
          .number()
          .optional()
          .describe('The CPU reserved of the ECS task'),
        cpuUtilized: z
          .number()
          .optional()
          .describe('The CPU utilized of the ECS task'),
        cpuUtilizedPercentage: z
          .number()
          .optional()
          .describe('The CPU utilized percentage of the ECS task'),
        memoryReserved: z
          .number()
          .optional()
          .describe('The memory reserved of the ECS task'),
        memoryUtilized: z
          .number()
          .optional()
          .describe('The memory utilized of the ECS task'),
        memoryUtilizedPercentage: z
          .number()
          .optional()
          .describe('The memory utilized percentage of the ECS task'),
      })
    )
    .describe('The cloudwatch logs of the ECS task')
    .optional(),
});

export type AWSECSOutputContent = z.infer<typeof AWSECSOutputContentSchema>;

export const AWSECSOutputSchema = ToolResultSchema.extend({
  structuredContent: z.object({
    type: z.literal('structured'),
    content: AWSECSOutputContentSchema,
    schema: z.object({
      type: z.literal('object'),
      properties: AWSECSOutputContentSchema,
    }),
    format: z.literal('json'),
  }),
});

export type AWSECSOutput = z.infer<typeof AWSECSOutputSchema>;
