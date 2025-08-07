import {
  DescribeServicesCommand,
  DescribeServicesCommandOutput,
  DescribeTasksCommand,
  DescribeTasksCommandInput,
  DescribeTasksCommandOutput,
  ECSClient,
  ListClustersCommand,
  ListClustersCommandOutput,
} from '@aws-sdk/client-ecs';

import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';

import { getCredentials } from './authentication';

const regionClients: Map<string, ECSClient> = new Map();

// Get region-specific ECS client
export function getECSClientForRegion(region: string): ECSClient {
  if (regionClients.has(region)) {
    loggingContext.log('info', 'Getting ECS client for region', {
      data: { region },
    });
    const client = regionClients.get(region);
    if (!client) {
      throw new Error(
        `ECS client for region ${region} was unexpectedly undefined`
      );
    }
    return client;
  }

  loggingContext.log('info', 'Creating ECS client for region', {
    data: { region },
  });

  try {
    const client = new ECSClient({
      region,
      credentials: getCredentials(),
    });

    regionClients.set(region, client);
    return client;
  } catch (error) {
    loggingContext.log('error', 'Failed to create ECS client for region', {
      data: {
        region,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
    });
    throw error;
  }
}

// ListClusters - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListClustersCommand/
export interface ListClustersParams {
  maxResults?: number;
  nextToken?: string;
}

export function listClusters({
  maxResults,
  nextToken,
}: ListClustersParams): Promise<ListClustersCommandOutput> {
  const ecsClient = getECSClientForRegion(config.tools.aws.region);

  loggingContext.log('info', 'Listing clusters', {
    data: { maxResults, nextToken },
  });

  return ecsClient.send(new ListClustersCommand({ maxResults, nextToken }));
}

// DescribeServices - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeServicesCommand/
export interface DescribeServicesParams {
  cluster?: string;
  services: string[];
}

export function describeServices({
  cluster,
  services,
}: DescribeServicesParams): Promise<DescribeServicesCommandOutput> {
  const ecsClient = getECSClientForRegion(config.tools.aws.region);

  loggingContext.log('info', 'Describing services', {
    data: { cluster, services },
  });

  return ecsClient.send(new DescribeServicesCommand({ cluster, services }));
}

// DescribeTasks - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeTasksCommand/
export interface DescribeTasksParams {
  cluster?: string;
  tasks: string[];
}

export function describeTasks({
  cluster,
  tasks,
}: DescribeTasksParams): Promise<DescribeTasksCommandOutput> {
  const include: DescribeTasksCommandInput['include'] = ['TAGS'];
  const ecsClient = getECSClientForRegion(config.tools.aws.region);

  loggingContext.log('info', 'Describing tasks', {
    data: { cluster, tasks },
  });

  return ecsClient.send(new DescribeTasksCommand({ cluster, tasks, include }));
}
