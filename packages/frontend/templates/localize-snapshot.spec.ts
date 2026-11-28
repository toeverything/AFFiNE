import { describe, expect, it } from 'vitest';

import zhHans from './locales/zh-Hans.json';
import { localizeSnapshot } from './localize-snapshot';

describe('built-in edgeless template localization', () => {
  it('localizes rich text in a new snapshot and preserves formatting and identifiers', () => {
    const content = {
      meta: { title: 'Gantt Chart' },
      blocks: [
        {
          id: 'Team',
          props: {
            text: {
              delta: [
                { insert: 'Project name', attributes: { bold: true } },
                { insert: 'Week 1' },
                { insert: 'A new untranslated label' },
                { insert: { reference: 'Team' } },
              ],
            },
          },
        },
      ],
    };
    const original = structuredClone(content);
    const localized = localizeSnapshot(content, zhHans);
    expect(localized).toEqual({
      ...original,
      meta: { title: '甘特图' },
      blocks: [
        {
          id: 'Team',
          props: {
            text: {
              delta: [
                { insert: '项目名称', attributes: { bold: true } },
                { insert: '第 1 周' },
                { insert: 'A new untranslated label' },
                { insert: { reference: 'Team' } },
              ],
            },
          },
        },
      ],
    });
    expect(content).toEqual(original);
    expect(localizeSnapshot(content, {})).toEqual(original);
  });
});
