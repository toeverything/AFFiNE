import type { InvitationType } from '../../core/workspaces';
import type { TestingApp } from './testing-app';

export async function inviteUser(
  app: TestingApp,
  workspaceId: string,
  email: string
): Promise<string> {
  const res = await app.gql(`
    mutation {
      inviteMembers(workspaceId: "${workspaceId}", emails: ["${email}"]) {
        inviteId
      }
    }
  `);

  return res.inviteMembers[0].inviteId;
}

export async function inviteUsers(
  app: TestingApp,
  workspaceId: string,
  emails: string[]
): Promise<Array<{ email: string; inviteId?: string; sentSuccess?: boolean }>> {
  const res = await app.gql(
    `
    mutation inviteMembers($workspaceId: String!, $emails: [String!]!) {
      inviteMembers(
        workspaceId: $workspaceId
        emails: $emails
      ) {
        email
        inviteId
        sentSuccess
      }
    }
    `,
    { workspaceId, emails }
  );

  return res.inviteMembers;
}

export async function getInviteLink(
  app: TestingApp,
  workspaceId: string
): Promise<{ link: string; expireTime: string }> {
  const res = await app.gql(`
    query {
      workspace(id: "${workspaceId}") {
        inviteLink {
          link
          expireTime
        }
      }
    }
  `);

  return res.workspace.inviteLink;
}

export async function createInviteLink(
  app: TestingApp,
  workspaceId: string,
  expireTime: 'OneDay' | 'ThreeDays' | 'OneWeek' | 'OneMonth'
): Promise<{ link: string; expireTime: string }> {
  const res = await app.gql(`
    mutation {
      createInviteLink(workspaceId: "${workspaceId}", expireTime: ${expireTime}) {
        link
        expireTime
      }
    }
  `);

  return res.createInviteLink;
}

export async function revokeInviteLink(
  app: TestingApp,
  workspaceId: string
): Promise<boolean> {
  const res = await app.gql(`
    mutation {
      revokeInviteLink(workspaceId: "${workspaceId}")
    }
  `);

  return res.revokeInviteLink;
}

export async function acceptInviteById(
  app: TestingApp,
  workspaceId: string,
  inviteId: string,
  sendAcceptMail = false
): Promise<boolean> {
  const res = await app.gql(`
    mutation {
      acceptInviteById(workspaceId: "${workspaceId}", inviteId: "${inviteId}", sendAcceptMail: ${sendAcceptMail})
    }
  `);

  return res.acceptInviteById;
}

export async function approveMember(
  app: TestingApp,
  workspaceId: string,
  userId: string
): Promise<string> {
  const res = await app.gql(`
    mutation {
      approveMember(workspaceId: "${workspaceId}", userId: "${userId}")
    }
  `);

  return res.approveMember;
}

export async function leaveWorkspace(
  app: TestingApp,
  workspaceId: string,
  sendLeaveMail = false
): Promise<boolean> {
  const res = await app.gql(`
    mutation {
      leaveWorkspace(workspaceId: "${workspaceId}", sendLeaveMail: ${sendLeaveMail})
    }
  `);

  return res.leaveWorkspace;
}

export async function revokeUser(
  app: TestingApp,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const res = await app.gql(`
    mutation {
      revoke(workspaceId: "${workspaceId}", userId: "${userId}")
    }
  `);

  return res.revoke;
}

export async function getInviteInfo(
  app: TestingApp,
  inviteId: string
): Promise<InvitationType> {
  const res = await app.gql(`
    query {
      getInviteInfo(inviteId: "${inviteId}") {
        workspace {
          id
          name
          avatar
        }
        user {
          id
          name
          avatarUrl
        }
        status
      }
    }
  `);

  return res.getInviteInfo;
}
