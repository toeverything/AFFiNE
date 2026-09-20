import { Injectable } from '@nestjs/common';

import { paginate, PaginationInput } from '../../base';
import { Models } from '../../models';
import type { WorkspaceUserType } from '../user';

@Injectable()
export class DocGrantsService {
  constructor(private readonly models: Models) {}

  async paginateGrantedUsers(
    workspaceId: string,
    docId: string,
    pagination: PaginationInput
  ) {
    const [permissions, totalCount] = await this.models.docUser.paginate(
      workspaceId,
      docId,
      pagination
    );
    const workspaceUsers = await this.models.user.getWorkspaceUsers(
      permissions.map(p => p.userId)
    );
    const workspaceUsersMap = new Map(
      workspaceUsers.map(user => [user.id, user])
    );

    return paginate(
      permissions.map(permission => {
        const user = workspaceUsersMap.get(permission.userId);
        if (!user) {
          throw new Error(`Doc grant user ${permission.userId} not found`);
        }
        return {
          ...permission,
          user: user as WorkspaceUserType,
        };
      }),
      'createdAt',
      pagination,
      totalCount
    );
  }
}
