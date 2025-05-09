import { Models, UserFeatureName, WorkspaceFeatureName } from '../../models';

export async function createDevUsers(models: Models) {
  const devUsers: {
    email: string;
    name: string;
    password: string;
    features: UserFeatureName[];
    workspaceFeatures?: WorkspaceFeatureName[];
  }[] = [
    {
      email: 'dev@affine.pro',
      name: 'Dev User',
      password: 'dev',
      features: ['free_plan_v1', 'unlimited_copilot', 'administrator'],
    },
    {
      email: 'pro@affine.pro',
      name: 'Pro User',
      password: 'pro',
      features: ['pro_plan_v1', 'unlimited_copilot', 'administrator'],
    },
    {
      email: 'team@affine.pro',
      name: 'Team User',
      password: 'team',
      features: ['pro_plan_v1', 'unlimited_copilot', 'administrator'],
      workspaceFeatures: ['team_plan_v1'],
    },
  ];
  const devWorkspaceBlob = Buffer.from(
    'AwbChK7tptz3DQAnAQRtZXRhBXBhZ2VzACgBBG1ldGEEbmFtZQF3EkRldiBXb3Jrc3BhY2UgRGVtbwEAwoSu7abc9w0AAQAEIQEGc3BhY2VzCm43RDJHT25KLUoBAAEK1NDZ6tqM+QsAAAKBjeqMoITIzgEAAQAEIQEGc3BhY2VzCmllSHphSlUtOC0BAAhHwoSu7abc9w0CASgA1NDZ6tqM+QsQAmlkAXcKZURSWTg2Rzg3YygA1NDZ6tqM+QsQBXRpdGxlAXcAKADU0Nnq2oz5CxAKY3JlYXRlRGF0ZQF7QnldYlT5cAAnANTQ2erajPkLEAR0YWdzAASN6oyghMjOAQCBwoSu7abc9w0CAQAEKQEGc3BhY2VzCmVEUlk4Nkc4N2MKZURSWTg2Rzg3Y3YAAAEDwoSu7abc9w0BAgfU0Nnq2oz5CwEAEI3qjKCEyM4BAgAFBgE=',
    'base64'
  );

  for (const {
    email,
    name,
    password,
    features,
    workspaceFeatures,
  } of devUsers) {
    try {
      let devUser = await models.user.getUserByEmail(email);
      if (!devUser) {
        devUser = await models.user.create({
          email,
          name,
          password,
        });
      }
      for (const feature of features) {
        if (feature.includes('plan')) {
          await models.userFeature.switchQuota(devUser.id, feature, name);
        } else {
          await models.userFeature.add(devUser.id, feature, name);
        }
      }
      if (workspaceFeatures) {
        for (const feature of workspaceFeatures) {
          const workspaceIds = (
            await models.workspaceUser.getUserActiveRoles(devUser.id)
          ).map(row => row.workspaceId);
          const workspaces = await models.workspace.findMany(workspaceIds);
          let hasFeatureWorkspace = false;
          for (const workspace of workspaces) {
            if (await models.workspaceFeature.has(workspace.id, feature)) {
              hasFeatureWorkspace = true;
              break;
            }
          }
          if (!hasFeatureWorkspace) {
            // create a new workspace with the feature
            const workspace = await models.workspace.create(devUser.id);
            await models.doc.upsert({
              spaceId: workspace.id,
              docId: workspace.id,
              blob: devWorkspaceBlob,
              timestamp: Date.now(),
              editorId: devUser.id,
            });
            await models.workspaceFeature.add(workspace.id, feature, name, {
              memberLimit: 10,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }
}
