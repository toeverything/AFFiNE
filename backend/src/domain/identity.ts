export type UserFeature = 'Admin';

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  features: UserFeature[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Credential {
  userId: string;
  passwordHash: string;
  updatedAt: Date;
}

export type DevicePlatform = 'ios' | 'android' | 'electron' | 'web';

export interface Session {
  id: string;
  userId: string;
  tokenHash: string | null;
  csrfToken: string;
  refreshTokenHash: string | null;
  refreshExpiresAt: Date | null;
  accessTokenHash: string | null;
  accessExpiresAt: Date | null;
  exchangeCodeHash: string | null;
  exchangeExpiresAt: Date | null;
  installationId: string | null;
  platform: DevicePlatform | null;
  deviceName: string | null;
  appVersion: string | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export type WorkspaceRole = 'owner' | 'admin' | 'collaborator';

export interface Workspace {
  id: string;
  name: string;
  isPublic: boolean;
  initialized: boolean;
  team: boolean;
  enableSharing: boolean;
  enableUrlPreview: boolean;
  enableAi: boolean;
  createdAt: Date;
  createdBy: string | null;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  inviteId: string;
  createdAt: Date;
}

export interface NewUserInput {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  features: UserFeature[];
}
