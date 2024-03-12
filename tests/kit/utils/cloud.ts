import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForAllPagesLoad,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  clickSideBarCurrentWorkspaceBanner,
  clickSideBarSettingButton,
} from '@affine-test/kit/utils/sidebar';
import { faker } from '@faker-js/faker';
import { hash } from '@node-rs/argon2';
import {
  type BrowserContext,
  type Cookie,
  expect,
  type Page,
} from '@playwright/test';
import { z } from 'zod';

export async function getCurrentMailMessageCount() {
  const response = await fetch('http://localhost:8025/api/v2/messages');
  const data = await response.json();
  return data.total;
}

export async function getLatestMailMessage() {
  const response = await fetch('http://localhost:8025/api/v2/messages');
  const data = await response.json();
  return data.items[0];
}

export async function getLoginCookie(
  context: BrowserContext
): Promise<Cookie | undefined> {
  return (await context.cookies()).find(c => c.name === 'sid');
}

const cloudUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
});

export const runPrisma = async <T>(
  cb: (
    prisma: InstanceType<
      // eslint-disable-next-line @typescript-eslint/consistent-type-imports
      typeof import('../../../packages/backend/server/node_modules/@prisma/client').PrismaClient
    >
  ) => Promise<T>
): Promise<T> => {
  const {
    PrismaClient,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require('../../../packages/backend/server/node_modules/@prisma/client');
  const client = new PrismaClient();
  await client.$connect();
  try {
    return await cb(client);
  } finally {
    await client.$disconnect();
  }
};

export async function addUserToWorkspace(
  workspaceId: string,
  userId: string,
  permission: number
) {
  await runPrisma(async client => {
    const workspace = await client.workspace.findUnique({
      where: {
        id: workspaceId,
      },
    });
    if (workspace == null) {
      throw new Error(`workspace ${workspaceId} not found`);
    }
    await client.workspaceUserPermission.create({
      data: {
        workspaceId: workspace.id,
        userId,
        accepted: true,
        type: permission,
      },
    });
  });
}

export async function createRandomUser(): Promise<{
  name: string;
  email: string;
  password: string;
  id: string;
}> {
  const user = {
    name: faker.internet.userName(),
    email: faker.internet.email().toLowerCase(),
    password: '123456',
  };
  const result = await runPrisma(async client => {
    await client.user.create({
      data: {
        ...user,
        emailVerifiedAt: new Date(),
        password: await hash(user.password),
        features: {
          create: {
            reason: 'created by test case',
            activated: true,
            feature: {
              connect: {
                feature_version: {
                  feature: 'free_plan_v1',
                  version: 1,
                },
              },
            },
          },
        },
      },
    });

    return await client.user.findUnique({
      where: {
        email: user.email,
      },
    });
  });
  cloudUserSchema.parse(result);
  return {
    ...result,
    password: user.password,
  } as any;
}

export async function deleteUser(email: string) {
  await runPrisma(async client => {
    await client.user.delete({
      where: {
        email,
      },
    });
  });
}

export async function loginUser(
  page: Page,
  userEmail: string,
  config?: {
    isElectron?: boolean;
    beforeLogin?: () => Promise<void>;
    afterLogin?: () => Promise<void>;
  }
) {
  if (config?.isElectron !== true) {
    await openHomePage(page);
    await waitForEditorLoad(page);
  }

  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByTestId('cloud-signin-button').click({
    delay: 200,
  });
  await page.getByPlaceholder('Enter your email address').fill(userEmail);
  await page.getByTestId('continue-login-button').click({
    delay: 200,
  });
  await page.getByTestId('password-input').fill('123456');
  if (config?.beforeLogin) {
    await config.beforeLogin();
  }
  await page.waitForTimeout(200);
  await page.getByTestId('sign-in-button').click();
  await page.waitForTimeout(200);
  if (config?.afterLogin) {
    await config.afterLogin();
  }
}

export async function enableCloudWorkspace(page: Page) {
  await clickSideBarSettingButton(page);
  await page.getByTestId('current-workspace-label').click();
  await page.getByTestId('publish-enable-affine-cloud-button').click();
  await page.getByTestId('confirm-enable-affine-cloud-button').click();
  // wait for upload and delete local workspace
  await page.waitForTimeout(2000);
  await waitForAllPagesLoad(page);
  await clickNewPageButton(page);
}

export async function enableCloudWorkspaceFromShareButton(page: Page) {
  const shareMenuButton = page.getByTestId('local-share-menu-button');
  await expect(shareMenuButton).toBeVisible();

  await shareMenuButton.click();
  await expect(page.getByTestId('local-share-menu')).toBeVisible();

  await page.getByTestId('share-menu-enable-affine-cloud-button').click();
  await page.getByTestId('confirm-enable-affine-cloud-button').click();
  // wait for upload and delete local workspace
  await page.waitForTimeout(2000);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
}
