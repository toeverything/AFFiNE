import type { FeatureType, ListUsersQuery } from '@affine/graphql';

export type UserType = ListUsersQuery['users'][0];
export type UserInput = {
  name: string;
  email: string;
  features: FeatureType[];
};
