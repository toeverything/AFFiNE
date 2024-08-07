export const OrganizeSupportType = [
  'folder',
  'doc',
  'collection',
  'tag',
] as const;
export type OrganizeSupportType = 'folder' | 'doc' | 'collection' | 'tag';

export const isOrganizeSupportType = (
  type: string
): type is OrganizeSupportType =>
  OrganizeSupportType.includes(type as OrganizeSupportType);
