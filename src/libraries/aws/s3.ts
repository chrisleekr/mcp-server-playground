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
export function getS3ClientForRegion(region: string): S3Client | null {
  if (regionClients.has(region)) {
    return regionClients.get(region) ?? null;
  }

  const client = new S3Client({
    region,
    credentials: getCredentials(),
  });

  regionClients.set(region, client);
  return client;
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

  if (!s3Client) {
    throw new Error(
      `No S3 client found for region: ${config.tools.aws.region}`
    );
  }

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

  if (!s3Client) {
    throw new Error(`No S3 client found for region: ${region}`);
  }

  loggingContext.log('info', 'Listing objects', {
    data: { bucket, prefix },
  });

  return s3Client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
}
