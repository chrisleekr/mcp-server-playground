import { fromSSO } from '@aws-sdk/credential-providers';
import {
  AwsCredentialIdentity,
  AwsCredentialIdentityProvider,
} from '@aws-sdk/types';

import { config } from '@/config/manager';

export function getCredentials():
  | AwsCredentialIdentityProvider
  | AwsCredentialIdentity {
  if (config.tools.aws.profile !== null && config.tools.aws.profile !== '') {
    return fromSSO({
      profile: config.tools.aws.profile,
    });
  }

  return {
    accessKeyId: config.tools.aws.credentials.accessKeyId ?? '',
    secretAccessKey: config.tools.aws.credentials.secretAccessKey ?? '',
    sessionToken: config.tools.aws.credentials.sessionToken ?? '',
  };
}
