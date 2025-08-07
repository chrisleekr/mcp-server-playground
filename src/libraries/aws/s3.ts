import {
  ListBucketsCommand,
  ListBucketsCommandOutput,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';

import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';

import { getCredentials } from './authentication';

const regionClients: Map<string, S3Client> = new Map();

// Get region-specific S3 client
export function getS3ClientForRegion(region: string): S3Client {
  if (regionClients.has(region)) {
    const client = regionClients.get(region);
    if (!client) {
      throw new Error(
        `S3 client for region ${region} was unexpectedly undefined`
      );
    }
    return client;
  }

  try {
    const client = new S3Client({
      region,
      credentials: getCredentials(),
    });

    regionClients.set(region, client);
    return client;
  } catch (error) {
    loggingContext.log('error', 'Failed to create S3 client for region', {
      data: {
        region,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
    });
    throw error;
  }
}

// ListBuckets - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListBucketsCommand/
export interface ListBucketsParams {
  maxBuckets?: number;
  prefix?: string;
}

export function listBuckets({
  maxBuckets,
  prefix,
}: ListBucketsParams): Promise<ListBucketsCommandOutput> {
  const s3Client = getS3ClientForRegion(config.tools.aws.region);

  loggingContext.log('info', 'Listing buckets', {
    data: { maxBuckets, prefix },
  });

  return s3Client.send(
    new ListBucketsCommand({ MaxBuckets: maxBuckets, Prefix: prefix })
  );
}

// ListObjectsV2 - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListObjectsV2Command/
export interface ListObjectsV2Params {
  /**
   * Directory buckets - When you use this operation with a directory bucket, you must use virtual-hosted-style requests in the format Bucket-name.s3express-zone-id.region-code.amazonaws.com. Path-style requests are not supported. Directory bucket names must be unique in the chosen Zone (Availability Zone or Local Zone). Bucket names must follow the format bucket-base-name--zone-id--x-s3 (for example, amzn-s3-demo-bucket--usw2-az1--x-s3). For information about bucket naming restrictions, see Directory bucket naming rules
   */
  bucket: string;
  prefix?: string;
  region?: string;
}

export function listObjectsV2({
  bucket,
  prefix,
  region,
}: ListObjectsV2Params): Promise<ListObjectsV2CommandOutput> {
  const s3Client = getS3ClientForRegion(region ?? config.tools.aws.region);

  loggingContext.log('info', 'Listing objects', {
    data: { bucket, prefix },
  });

  return s3Client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
}
