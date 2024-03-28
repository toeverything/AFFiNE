/// <reference types="../src/global.d.ts" />

import { TestingModule } from '@nestjs/testing';
import type { TestFn } from 'ava';
import ava from 'ava';

import { AuthService } from '../src/core/auth';
import { QuotaManagementService, QuotaModule } from '../src/core/quota';
import { ConfigModule } from '../src/fundamentals/config';
import { CopilotModule } from '../src/plugins/copilot';
import { PromptService } from '../src/plugins/copilot/prompt';
import { createTestingModule } from './utils';

const test = ava as TestFn<{
  auth: AuthService;
  quotaManager: QuotaManagementService;
  module: TestingModule;
  prompt: PromptService;
}>;

test.beforeEach(async t => {
  const module = await createTestingModule({
    imports: [
      ConfigModule.forRoot({
        plugins: {
          copilot: {
            openai: {
              apiKey: '1',
            },
          },
        },
      }),
      QuotaModule,
      CopilotModule,
    ],
  });

  const quotaManager = module.get(QuotaManagementService);
  const auth = module.get(AuthService);
  const prompt = module.get(PromptService);

  t.context.module = module;
  t.context.quotaManager = quotaManager;
  t.context.auth = auth;
  t.context.prompt = prompt;
});

test.afterEach.always(async t => {
  await t.context.module.close();
});

test('should be able to manage prompt', async t => {
  const { prompt } = t.context;

  t.is((await prompt.list()).length, 0, 'should have no prompt');

  await prompt.set('test', [
    { role: 'system', content: 'hello' },
    { role: 'user', content: 'hello' },
  ]);
  t.is((await prompt.list()).length, 1, 'should have one prompt');
  t.is((await prompt.get('test')).length, 2, 'should have two messages');

  await prompt.update('test', [{ role: 'system', content: 'hello' }]);
  t.is((await prompt.get('test')).length, 1, 'should have one message');

  await prompt.delete('test');
  t.is((await prompt.list()).length, 0, 'should have no prompt');
  t.is((await prompt.get('test')).length, 0, 'should have no messages');
});
