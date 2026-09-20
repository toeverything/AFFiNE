import { DocRole, Permission, WorkspaceMemberStatus } from '@affine/graphql';
import type {
  DocGrantedUserSnapshot,
  WorkspaceMemberSnapshot,
} from '@affine/realtime';

import { mapRealtimeEnum } from '../../cloud/realtime/enum';

export function mapWorkspaceMemberSnapshot(member: WorkspaceMemberSnapshot) {
  return {
    ...member,
    permission: mapRealtimeEnum(Permission, member.permission, 'permission'),
    role: mapRealtimeEnum(Permission, member.role, 'permission'),
    status: mapRealtimeEnum(
      WorkspaceMemberStatus,
      member.status,
      'workspace member status'
    ),
  };
}

export function mapDocGrantedUserSnapshot(node: DocGrantedUserSnapshot) {
  return { ...node, role: mapRealtimeEnum(DocRole, node.role, 'doc role') };
}
