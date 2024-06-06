export type User = {
  __typename?: 'UserType' | undefined;
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  hasPassword: boolean | null;
  createdAt: string | null;
};
