import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarCurrentWorkspaceBanner } from '@affine-test/kit/utils/sidebar';
import { faker } from '@faker-js/faker';
import { hash } from '@node-rs/argon2';
import type { BrowserContext, Cookie, Page } from '@playwright/test';
import { z } from 'zod';

export async function getLoginCookie(
  context: BrowserContext
): Promise<Cookie | undefined> {
  return (await context.cookies()).find(
    c => c.name === 'next-auth.session-token'
  );
}

const cloudUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
});

export type CloudUser = z.infer<typeof cloudUserSchema>;

export async function createRandomUser(): Promise<CloudUser> {
  const user = {
    name: faker.internet.userName(),
    email: faker.internet.email().toLowerCase(),
    password: '123456',
  } satisfies CloudUser;
  const {
    PrismaClient,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require('../../../apps/server/node_modules/@prisma/client');
  const client = new PrismaClient();
  await client.$connect();
  await client.user.create({
    data: {
      ...user,
      emailVerified: new Date(),
      password: await hash(user.password),
    },
  });
  await client.$disconnect();

  const result = await client.user.findUnique({
    where: {
      email: user.email,
    },
  });
  cloudUserSchema.parse(result);
  return result;
}

export async function deleteUser(email: string) {
  const {
    PrismaClient,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require('../../../apps/server/node_modules/@prisma/client');
  const client = new PrismaClient();
  await client.$connect();
  await client.user.delete({
    where: {
      email,
    },
  });
  await client.$disconnect();
}

export async function loginUser(
  page: Page,
  user: CloudUser,
  config?: {
    beforeLogin?: () => Promise<void>;
    afterLogin?: () => Promise<void>;
  }
) {
  await openHomePage(page);
  await waitEditorLoad(page);

  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByTestId('cloud-signin-button').click({
    delay: 200,
  });
  await page.getByPlaceholder('Enter your email address').type(user.email, {
    delay: 50,
  });
  await page.getByTestId('continue-login-button').click({
    delay: 200,
  });
  await page.getByTestId('sign-in-with-password').click({
    delay: 200,
  });
  await page.getByTestId('password-input').type('123456', {
    delay: 50,
  });
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
