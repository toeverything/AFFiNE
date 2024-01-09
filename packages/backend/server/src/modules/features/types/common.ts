import { registerEnumType } from '@nestjs/graphql';

export enum FeatureType {
  Copilot = 'copilot',
  EarlyAccess = 'early_access',
}

registerEnumType(FeatureType, {
  name: 'FeatureType',
  description: 'The type of workspace feature',
});
