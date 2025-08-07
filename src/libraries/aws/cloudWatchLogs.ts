import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  GetQueryResultsCommandOutput,
  StartQueryCommand,
  StartQueryCommandOutput,
} from '@aws-sdk/client-cloudwatch-logs';

import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';

import { getCredentials } from './authentication';

const regionClients: Map<string, CloudWatchLogsClient> = new Map();

// Get region-specific CloudWatchLogsClient
export function getCloudWatchLogsClientForRegion(
  region: string
): CloudWatchLogsClient {
  if (regionClients.has(region)) {
    loggingContext.log('info', 'Getting CloudWatchLogs client for region', {
      data: { region },
    });
    const client = regionClients.get(region);
    if (!client) {
      throw new Error(
        `CloudWatchLogs client for region ${region} was unexpectedly undefined`
      );
    }
    return client;
  }

  loggingContext.log('info', 'Creating CloudWatchLogs client for region', {
    data: { region },
  });

  const client = new CloudWatchLogsClient({
    region,
    credentials: getCredentials(),
  });
  regionClients.set(region, client);
  return client;
}

// StartQuery - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/StartQueryCommand/
// A StartQuery operation must include exactly one of the following parameters: logGroupName, logGroupNames, or logGroupIdentifiers. The exception is queries using the OpenSearch Service SQL query language, where you specify the log group names inside the querystring instead of here.
export interface StartQueryParams {
  startTime: number;
  endTime: number;
  queryString: string;
  queryLanguage?: 'CWLI' | 'SQL' | 'PPL';
  logGroupName?: string;
  logGroupNames?: string[];
  logGroupIdentifiers?: string[];
  limit?: number;
}
export function startQuery({
  queryLanguage,
  logGroupName,
  logGroupNames,
  logGroupIdentifiers,
  startTime,
  endTime,
  queryString,
  limit,
}: StartQueryParams): Promise<StartQueryCommandOutput> {
  const cloudwatchClient = getCloudWatchLogsClientForRegion(
    config.tools.aws.region
  );

  loggingContext.log('info', 'Starting query', {
    data: {
      queryLanguage,
      logGroupName,
      logGroupNames,
      logGroupIdentifiers,
      startTime,
      endTime,
      queryString,
      limit,
    },
  });

  return cloudwatchClient.send(
    new StartQueryCommand({
      queryLanguage,
      logGroupName,
      logGroupNames,
      logGroupIdentifiers,
      startTime,
      endTime,
      queryString,
      limit,
    })
  );
}

export interface GetQueryResultsParams {
  queryId: string;
}

export function getQueryResults({
  queryId,
}: GetQueryResultsParams): Promise<GetQueryResultsCommandOutput> {
  const cloudwatchClient = getCloudWatchLogsClientForRegion(
    config.tools.aws.region
  );

  loggingContext.log('info', 'Getting query results', {
    data: { queryId },
  });

  return cloudwatchClient.send(new GetQueryResultsCommand({ queryId }));
}
