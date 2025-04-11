// eslint-disable no-empty-pattern
import { test as base } from '@affine-test/kit/playwright';

import { MockApiUtils } from '../utils/api-utils';
import { ChatPanelUtils } from '../utils/chat-panel-utils';
import { EditorUtils } from '../utils/editor-utils';
import { TestUtils } from '../utils/test-utils';

interface TestUtilsFixtures {
  utils: {
    testUtils: TestUtils;
    api: MockApiUtils;
    chatPanel: typeof ChatPanelUtils;
    editor: typeof EditorUtils;
  };
}

export const test = base.extend<TestUtilsFixtures>({
  utils: async ({ context, page }, use) => {
    const testUtils = TestUtils.getInstance();
    await use({
      testUtils,
      api: await MockApiUtils.init(context, page),
      chatPanel: ChatPanelUtils,
      editor: EditorUtils,
    });
  },
});

export type TestFixtures = typeof test;
