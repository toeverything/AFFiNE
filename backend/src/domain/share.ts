export type PublicDocMode = 'Page' | 'Edgeless';

export interface PublicDoc {
  workspaceId: string;
  docId: string;
  mode: PublicDocMode;
  publishedAt: Date;
  publishedBy: string | null;
}

export function isPublicDocMode(
  value: string | undefined | null
): value is PublicDocMode {
  return value === 'Page' || value === 'Edgeless';
}
