// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock/

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';

import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';

import { getCredentialsForBedrock } from './authentication';

const regionClients: Map<string, BedrockRuntimeClient> = new Map();

export function getBedrockRuntimeClientForRegion(): BedrockRuntimeClient {
  if (regionClients.has(config.tools.aws.bedrock.region)) {
    loggingContext.log('info', 'Getting BedrockRuntime client for region', {
      data: { region: config.tools.aws.bedrock.region },
    });
    const client = regionClients.get(config.tools.aws.bedrock.region);
    if (!client) {
      throw new Error(
        `BedrockRuntime client for region ${config.tools.aws.bedrock.region} was unexpectedly undefined`
      );
    }
    return client;
  }

  loggingContext.log('info', 'Creating BedrockRuntime client for region', {
    data: { region: config.tools.aws.bedrock.region },
  });

  const client = new BedrockRuntimeClient({
    region: config.tools.aws.bedrock.region,
    credentials: getCredentialsForBedrock(),
  });
  regionClients.set(config.tools.aws.bedrock.region, client);
  return client;
}

// InvokeModel - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/InvokeModelCommand/
export interface InvokeModelParams {
  body: string;
  contentType: string;
  accept: string;
  modelId: string;
  trace: 'ENABLED' | 'DISABLED' | 'ENABLED_FULL';
  guardrailIdentifier?: string;
  guardrailVersion?: string;
  performanceConfigLatency: 'standard' | 'optimized';
}

export function invokeModel(
  params: InvokeModelParams
): Promise<InvokeModelCommandOutput> {
  const client = getBedrockRuntimeClientForRegion();

  loggingContext.log('info', 'Invoking model', {
    data: { params },
  });

  const command = new InvokeModelCommand({
    body: params.body,
    contentType: params.contentType,
    accept: params.accept,
    modelId: params.modelId,
    trace: params.trace,
    guardrailIdentifier: params.guardrailIdentifier,
    guardrailVersion: params.guardrailVersion,
    performanceConfigLatency: params.performanceConfigLatency,
  });

  return client.send(command);
}
