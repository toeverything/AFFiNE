import { Models } from '../../models';
import {
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../../plugins/payment/types';
import { EntitlementService } from '../entitlement';

export async function createDevUsers(
  models: Models,
  entitlement: EntitlementService
) {
  const devUsers: {
    email: string;
    name: string;
    password: string;
    plans: Array<'pro' | 'ai'>;
    teamWorkspace?: boolean;
  }[] = [
    {
      email: 'dev@affine.pro',
      name: 'Dev User',
      password: 'dev',
      plans: ['ai'],
    },
    {
      email: 'pro@affine.pro',
      name: 'Pro User',
      password: 'pro',
      plans: ['pro', 'ai'],
    },
    {
      email: 'team@affine.pro',
      name: 'Team User',
      password: 'team',
      plans: ['pro', 'ai'],
      teamWorkspace: true,
    },
  ];
  const devWorkspaceBlob = Buffer.from(
    'AwbChK7tptz3DQAnAQRtZXRhBXBhZ2VzACgBBG1ldGEEbmFtZQF3EkRldiBXb3Jrc3BhY2UgRGVtbwEAwoSu7abc9w0AAQAEIQEGc3BhY2VzCm43RDJHT25KLUoBAAEK1NDZ6tqM+QsAAAKBjeqMoITIzgEAAQAEIQEGc3BhY2VzCmllSHphSlUtOC0BAAhHwoSu7abc9w0CASgA1NDZ6tqM+QsQAmlkAXcKZURSWTg2Rzg3YygA1NDZ6tqM+QsQBXRpdGxlAXcAKADU0Nnq2oz5CxAKY3JlYXRlRGF0ZQF7QnldYlT5cAAnANTQ2erajPkLEAR0YWdzAASN6oyghMjOAQCBwoSu7abc9w0CAQAEKQEGc3BhY2VzCmVEUlk4Nkc4N2MKZURSWTg2Rzg3Y3YAAAEDwoSu7abc9w0BAgfU0Nnq2oz5CwEAEI3qjKCEyM4BAgAFBgE=',
    'base64'
  );

  for (const { email, name, password, plans, teamWorkspace } of devUsers) {
    try {
      let devUser = await models.user.getUserByEmail(email);
      if (!devUser) {
        devUser = await models.user.create({
          email,
          name,
          password,
        });
      }
      await models.userFeature.add(devUser.id, 'administrator', name);
      for (const plan of plans) {
        await entitlement.upsertFromCloudSubscription({
          targetId: devUser.id,
          plan,
          recurring: SubscriptionRecurring.Monthly,
          status: SubscriptionStatus.Active,
          provider: 'dev',
          subscriptionId: `dev:${devUser.id}:${plan}`,
        });
      }
      if (teamWorkspace) {
        const workspaceIds = (
          await models.workspaceUser.getUserActiveRoles(devUser.id)
        ).map(row => row.workspaceId);
        const workspaces = await models.workspace.findMany(workspaceIds);
        const hasTeamWorkspace = (
          await Promise.all(
            workspaces.map(workspace =>
              entitlement.resolveWorkspaceEntitlement(workspace.id)
            )
          )
        ).some(resolved => resolved.plan === 'team');
        if (!hasTeamWorkspace) {
          const workspace = await models.workspace.create(devUser.id);
          await models.doc.upsert({
            spaceId: workspace.id,
            docId: workspace.id,
            blob: devWorkspaceBlob,
            timestamp: Date.now(),
            editorId: devUser.id,
          });
          await entitlement.upsertFromCloudSubscription({
            targetId: workspace.id,
            plan: 'team',
            recurring: SubscriptionRecurring.Monthly,
            status: SubscriptionStatus.Active,
            quantity: 10,
            provider: 'dev',
            subscriptionId: `dev:${workspace.id}:team`,
          });
        }
      }
    } catch {
      // ignore
    }
  }
}
