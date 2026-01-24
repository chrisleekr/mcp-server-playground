import { fromSSO } from '@aws-sdk/credential-providers';
import {
  type AwsCredentialIdentity,
  type AwsCredentialIdentityProvider,
} from '@aws-sdk/types';

import { config } from '@/config/manager';
import { loggingContext } from '@/core/server/http/context';

export function getCredentials():
  | AwsCredentialIdentityProvider
  | AwsCredentialIdentity {
  if (config.tools.aws.profile !== null && config.tools.aws.profile !== '') {
    loggingContext.log('info', 'Getting credentials from SSO', {
      data: { profile: config.tools.aws.profile },
    });
    return fromSSO({
      profile: config.tools.aws.profile,
    });
  }

  loggingContext.log('info', 'Getting credentials from environment variables', {
    data: { profile: config.tools.aws.profile },
  });

  return {
    accessKeyId: config.tools.aws.credentials.accessKeyId ?? '',
    secretAccessKey: config.tools.aws.credentials.secretAccessKey ?? '',
    sessionToken: config.tools.aws.credentials.sessionToken ?? '',
  };
}

export function getCredentialsForBedrock():
  | AwsCredentialIdentityProvider
  | AwsCredentialIdentity {
  if (
    config.tools.aws.bedrock.profile !== null &&
    config.tools.aws.bedrock.profile !== ''
  ) {
    loggingContext.log('info', 'Getting credentials for Bedrock from SSO', {
      data: { profile: config.tools.aws.bedrock.profile },
    });
    return fromSSO({
      profile: config.tools.aws.bedrock.profile,
    });
  }

  loggingContext.log(
    'info',
    'Getting credentials for Bedrock from environment variables',
    {
      data: { profile: config.tools.aws.bedrock.profile },
    }
  );

  return {
    accessKeyId: config.tools.aws.bedrock.credentials.accessKeyId ?? '',
    secretAccessKey: config.tools.aws.bedrock.credentials.secretAccessKey ?? '',
    sessionToken: config.tools.aws.bedrock.credentials.sessionToken ?? '',
  };
}
