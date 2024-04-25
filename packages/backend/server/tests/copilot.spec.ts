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
  t.is(
    (await prompt.get('test'))!.finish({}).length,
    2,
    'should have two messages'
  );

  await prompt.update('test', [{ role: 'system', content: 'hello' }]);
  t.is(
    (await prompt.get('test'))!.finish({}).length,
    1,
    'should have one message'
  );

  await prompt.delete('test');
  t.is((await prompt.list()).length, 0, 'should have no prompt');
  t.is(await prompt.get('test'), null, 'should not have the prompt');
});

test('should be able to render prompt', async t => {
  const { prompt } = t.context;

  const msg = {
    role: 'system' as const,
    content: 'translate {{src_language}} to {{dest_language}}: {{content}}',
    params: { src_language: ['eng'], dest_language: ['chs', 'jpn', 'kor'] },
  };
  const params = {
    src_language: 'eng',
    dest_language: 'chs',
    content: 'hello world',
  };

  await prompt.set('test', [msg]);
  const testPrompt = await prompt.get('test');
  t.assert(testPrompt, 'should have prompt');
  t.is(
    testPrompt?.finish(params).pop()?.content,
    'translate eng to chs: hello world',
    'should render the prompt'
  );
  t.deepEqual(
    testPrompt?.paramKeys,
    Object.keys(params),
    'should have param keys'
  );
  t.deepEqual(testPrompt?.params, msg.params, 'should have params');
  t.throws(() => testPrompt?.finish({ src_language: 'abc' }), {
    instanceOf: Error,
  });
});

test('should be able to render listed prompt', async t => {
  const { prompt } = t.context;

  const msg = {
    role: 'system' as const,
    content: 'links:\n{{#links}}- {{.}}\n{{/links}}',
  };
  const params = {
    links: ['https://affine.pro', 'https://github.com/toeverything/affine'],
  };

  await prompt.set('test', [msg]);
  const testPrompt = await prompt.get('test');

  t.is(
    testPrompt?.finish(params).pop()?.content,
    'links:\n- https://affine.pro\n- https://github.com/toeverything/affine\n',
    'should render the prompt'
  );
});
