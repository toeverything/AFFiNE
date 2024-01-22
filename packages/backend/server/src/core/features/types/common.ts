import { registerEnumType } from '@nestjs/graphql';

export enum FeatureType {
  Copilot = 'copilot',
  EarlyAccess = 'early_access',
  UnlimitedWorkspace = 'unlimited_workspace',
}

registerEnumType(FeatureType, {
  name: 'FeatureType',
  description: 'The type of workspace feature',
});
