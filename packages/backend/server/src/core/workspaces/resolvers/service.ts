import { Injectable, Logger } from '@nestjs/common';
import { getStreamAsBuffer } from 'get-stream';

import { Cache, NotFound, OnEvent, URLHelper } from '../../../base';
import { Models } from '../../../models';
import { DocReader } from '../../doc';
import { Mailer } from '../../mail';
import { WorkspaceRole } from '../../permission';
import { WorkspaceBlobStorage } from '../../storage';

export const DEFAULT_WORKSPACE_AVATAR =
  'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAQtSURBVHgBfVa9jhxFEK6q7rkf+4T2AgdIIC0ZoXkBuNQJtngBuIzs1hIRye1FhL438D0CRgKRGUeE6wwkhHYlkE2AtGdkbN/MdJe/qu7Z27PWnnG5Znq7v/rqd47pHddkNh/918tR1/FBamXc9zxOPVFKfJ4yP86qD1LD3/986/3F2zB40+LXv83HrHq/6+gAoNS1kF4odUz2nhJRTkI5E6mD6Bk1crLJkLy5cHc+P4ohzxLng8RKLqKUq6hkUtBSe8Zvdmfir7TT2a0fnkzeaeCbv/44ztSfZskjP2ygVRM0mbYTpgHMMMS8CsIIj/c+//Hp8UYD3z758whQUwdeEwPjAZQLqJhI0VxB2MVco+kXP/0zuZKD6dP5uM397ELzqEtMba/UJ4t7iXeq8U94z52Q+js09qjlIXMxAEsRDJpI59dVPzlDTooHko7BdlR2FcYmAtbGMmAt2mFI4yDQkIjtEQkxUAMKAPD9SiOK4b578N0S7Nt+fqFKbTbmRD1YGXurEmdtnjjz4kFuIV0gtWewV62hMHBY2gpEOw3Rnmztx9jnO72xzTV/YkzgNmgkiypeYJdCLjonqyAAg7VCshVpjTbD08HbxrySdhKxcDvoJTA5gLvpeXVQ+K340WKea9UkNeZVqGSba/IbF6athj+LUeRmRCyiAVnlAKhJJQfmugGZ28ZWna24RGzwNUNUqpWGf6HkajvAgNA4NsSjHgcb9obx+k5c3DUttcwd3NcHxpVurXQ2d4MZACGw9TwEHsdtbEwytL1xywAGcxavjoH1quLVywuGi+aBhFWexRilFSwK0QzgdUdkkVMeKw4wijrgxjzz2CefCRZn+21ViOWW4Ym9nNnyFLMbMS8ivNhGP8RdlgUojBkuBLDpEPi+5LpWiDURgFkKOIIckJTgN/sZ84KtKkKpDnsOZiTQ47jD4ZGwHghbw6AXIL3lo5Zg6Tp2AwIAyYJ8BRzGfmfPl6kI7HOLUdN2LIg+4IfL5SiFdvkK4blI6h50qda7jQI0CUMLdEhFIkqtQciMvXsgpaZ1pWtVUfrIa+TX5/8+RBcftAhTa91r8ycXA5ZxBqhAh2zgVagUAddxMkxfF/JxfvbpB+8d2jhBtsPhtuqsE0HJlhxYeHKdkCU8xUCos8dmkDdnGaOlJ1yy9dM52J2spqldvz9fTgB4z+aQd2kqjUY2KU2s4dTT7ezD0AqDAbvZiKF/VO9+fGPv9IoBu+b/P5ti6djDY+JlSg4ug1jc6fJbMAx9/3b4CNGTD/evT698D9avv188m4gKvko8MiMeJC3jmOvU9MSuHXZohAVpOrmxd+10HW/jR3/58uU45TRFt35ZR2XpY61DzW+tH3z/7xdM8sP93d3Fm1gbDawbEtU7CMtt/JVxEw01Kh7RAmoBE4+u7eycYv38bRivAZbdHBtPrwOHAAAAAElFTkSuQmCC';

export type InviteInfo = {
  workspaceId: string;
  inviterUserId?: string;
  inviteeUserId?: string;
};

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private readonly cache: Cache,
    private readonly models: Models,
    private readonly url: URLHelper,
    private readonly doc: DocReader,
    private readonly blobStorage: WorkspaceBlobStorage,
    private readonly mailer: Mailer
  ) {}

  async getInviteInfo(inviteId: string): Promise<InviteInfo> {
    // invite link
    const invite = await this.cache.get<InviteInfo>(
      `workspace:inviteLinkId:${inviteId}`
    );
    if (typeof invite?.workspaceId === 'string') {
      return invite;
    }

    const workspaceUser = await this.models.workspaceUser.getById(inviteId);

    if (!workspaceUser) {
      throw new NotFound('Invitation not found');
    }

    return {
      workspaceId: workspaceUser.workspaceId,
      inviteeUserId: workspaceUser.userId,
    };
  }

  async getWorkspaceInfo(workspaceId: string) {
    const workspaceContent = await this.doc.getWorkspaceContent(workspaceId);

    let avatar = DEFAULT_WORKSPACE_AVATAR;
    if (workspaceContent?.avatarKey) {
      const avatarBlob = await this.blobStorage.get(
        workspaceId,
        workspaceContent.avatarKey
      );

      if (avatarBlob.body) {
        avatar = (await getStreamAsBuffer(avatarBlob.body)).toString('base64');
      }
    }

    return {
      avatar,
      id: workspaceId,
      name: workspaceContent?.name ?? 'Untitled Workspace',
    };
  }

  async sendAcceptedEmail(inviteId: string) {
    const { workspaceId, inviterUserId, inviteeUserId } =
      await this.getInviteInfo(inviteId);

    const inviter = inviterUserId
      ? await this.models.user.getWorkspaceUser(inviterUserId)
      : await this.models.workspaceUser.getOwner(workspaceId);

    if (!inviter || !inviteeUserId) {
      this.logger.warn(
        `Inviter or invitee user not found for inviteId: ${inviteId}`
      );
      return false;
    }

    return await this.mailer.send({
      name: 'MemberAccepted',
      to: inviter.email,
      props: {
        user: {
          $$userId: inviteeUserId,
        },
        workspace: {
          $$workspaceId: workspaceId,
        },
      },
    });
  }

  async sendInviteEmail({
    workspaceId,
    inviteeEmail,
    inviterUserId,
    inviteId,
  }: {
    inviterUserId: string;
    inviteeEmail: string;
    inviteId: string;
    workspaceId: string;
  }) {
    return await this.mailer.send({
      name: 'MemberInvitation',
      to: inviteeEmail,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
        user: {
          $$userId: inviterUserId,
        },
        url: this.url.link(`/invite/${inviteId}`),
      },
    });
  }

  // ================ Team ================
  async isTeamWorkspace(workspaceId: string) {
    return this.models.workspaceFeature.has(workspaceId, 'team_plan_v1');
  }

  async sendTeamWorkspaceUpgradedEmail(workspaceId: string) {
    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    const admins = await this.models.workspaceUser.getAdmins(workspaceId);

    const link = this.url.link(`/workspace/${workspaceId}`);
    await this.mailer.send({
      name: 'TeamWorkspaceUpgraded',
      to: owner.email,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
        isOwner: true,
        url: link,
      },
    });

    await Promise.allSettled(
      admins.map(async user => {
        await this.mailer.send({
          name: 'TeamWorkspaceUpgraded',
          to: user.email,
          props: {
            workspace: {
              $$workspaceId: workspaceId,
            },
            isOwner: false,
            url: link,
          },
        });
      })
    );
  }

  async sendReviewRequestedEmail(inviteId: string) {
    const { workspaceId, inviteeUserId } = await this.getInviteInfo(inviteId);
    if (!inviteeUserId) {
      this.logger.error(`Invitee user not found for inviteId: ${inviteId}`);
      return;
    }

    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    const admins = await this.models.workspaceUser.getAdmins(workspaceId);

    await Promise.allSettled(
      [owner, ...admins].map(async receiver => {
        await this.mailer.send({
          name: 'LinkInvitationReviewRequest',
          to: receiver.email,
          props: {
            user: {
              $$userId: inviteeUserId,
            },
            workspace: {
              $$workspaceId: workspaceId,
            },
            url: this.url.link(`/workspace/${workspaceId}`),
          },
        });
      })
    );
  }

  async sendReviewApproveEmail(inviteId: string) {
    const invitation = await this.models.workspaceUser.getById(inviteId);
    if (!invitation) {
      this.logger.warn(`Invitation not found for inviteId: ${inviteId}`);
      return;
    }

    const user = await this.models.user.getWorkspaceUser(invitation.userId);

    if (!user) {
      this.logger.warn(`Invitee user not found for inviteId: ${inviteId}`);
      return;
    }

    await this.mailer.send({
      name: 'LinkInvitationApprove',
      to: user.email,
      props: {
        workspace: {
          $$workspaceId: invitation.workspaceId,
        },
        url: this.url.link(`/workspace/${invitation.workspaceId}`),
      },
    });
  }

  async sendReviewDeclinedEmail(email: string, workspaceId: string) {
    await this.mailer.send({
      name: 'LinkInvitationDecline',
      to: email,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
      },
    });
  }

  async sendRoleChangedEmail(
    userId: string,
    ws: { id: string; role: WorkspaceRole }
  ) {
    const user = await this.models.user.getWorkspaceUser(userId);
    if (!user) {
      this.logger.warn(
        `User not found for seeding role changed email: ${userId}`
      );
      return;
    }

    if (ws.role === WorkspaceRole.Admin) {
      await this.mailer.send({
        name: 'TeamBecomeAdmin',
        to: user.email,
        props: {
          workspace: {
            $$workspaceId: ws.id,
          },
          url: this.url.link(`/workspace/${ws.id}`),
        },
      });
    } else {
      await this.mailer.send({
        name: 'TeamBecomeCollaborator',
        to: user.email,
        props: {
          workspace: {
            $$workspaceId: ws.id,
          },
          url: this.url.link(`/workspace/${ws.id}`),
        },
      });
    }
  }

  async sendOwnershipTransferredEmail(email: string, ws: { id: string }) {
    await this.mailer.send({
      name: 'OwnershipTransferred',
      to: email,
      props: {
        workspace: {
          $$workspaceId: ws.id,
        },
      },
    });
  }

  async sendOwnershipReceivedEmail(email: string, ws: { id: string }) {
    await this.mailer.send({
      name: 'OwnershipReceived',
      to: email,
      props: {
        workspace: {
          $$workspaceId: ws.id,
        },
      },
    });
  }

  async sendLeaveEmail(workspaceId: string, userId: string) {
    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    await this.mailer.send({
      name: 'MemberLeave',
      to: owner.email,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
        user: {
          $$userId: userId,
        },
      },
    });
  }

  @OnEvent('workspace.members.removed')
  async onMemberRemoved({
    userId,
    workspaceId,
  }: Events['workspace.members.removed']) {
    const user = await this.models.user.get(userId);
    if (!user) {
      this.logger.warn(
        `User not found for seeding member removed email: ${userId}`
      );
      return;
    }

    await this.mailer.send({
      name: 'MemberRemoved',
      to: user.email,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
      },
    });
  }
}
