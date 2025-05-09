import {
  EdgelessTemplatePanel,
  type Template,
  type TemplateManager,
} from '@blocksuite/affine/gfx/template';
import { beforeEach, expect, test } from 'vitest';

import { setupEditor } from '../utils/setup.js';

beforeEach(async () => {
  const cleanup = await setupEditor('edgeless');

  return cleanup;
});

test('extension api', async () => {
  const mockTemplate = {
    name: 'Test',
    type: 'template',
  } as Template;
  const customTemplate = {
    list: () => {
      return [mockTemplate];
    },
    categories: () => {
      return ['custom'];
    },
    search: (_, __) => {
      return [mockTemplate];
    },
  } satisfies TemplateManager;

  EdgelessTemplatePanel.templates.extend(customTemplate);

  const categories = await EdgelessTemplatePanel.templates.categories();
  expect(categories).toContain('custom');

  const templates = await EdgelessTemplatePanel.templates.list('any');
  expect(templates).toContain(mockTemplate);

  const searchTemplates = await EdgelessTemplatePanel.templates.search('any');
  expect(searchTemplates).toContain(mockTemplate);
});
