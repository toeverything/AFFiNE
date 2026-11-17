import { describe, expect, it } from 'vitest';

describe('shape browser drawio libraries', () => {
  it('places drawio categories after base ordering', async () => {
    const { EdgelessShapeBrowserPanel } =
      await import('../components/shape-browser-panel.js');
    const categories = (
      EdgelessShapeBrowserPanel as any
    ).prototype._getAvailableCategories.call({
      _searchKeyword: '',
    }) as Array<{
      name: string;
    }>;
    const names = categories.map(entry => entry.name);
    expect(names).toEqual(['General', 'Flowchart', 'Arrows', 'Basic', 'Misc']);
  }, 30000);
});
