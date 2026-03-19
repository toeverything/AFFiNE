import { describe, expect, it } from 'vitest';

describe('shape browser drawio libraries', () => {
  it('places drawio categories after base ordering', async () => {
    const catalogModule = await import('../drawio/library-catalog.js');
    try {
      catalogModule.drawioLibraryCatalog.splice(
        0,
        catalogModule.drawioLibraryCatalog.length,
        {
          id: 'azure',
          label: 'Azure',
          categoryId: 'cloud',
          categoryLabel: 'Cloud',
          stencilName: 'azure',
        }
      );

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
      expect(names).toContain('Cloud');

      const baseOrder = [
        'General',
        'Flowchart',
        'Arrows',
        'Advanced',
        'Basic',
        'Misc',
      ];
      const baseIndexes = baseOrder
        .map(name => names.indexOf(name))
        .filter(index => index >= 0);
      const cloudIndex = names.indexOf('Cloud');
      expect(cloudIndex).toBeGreaterThan(Math.max(...baseIndexes));
    } finally {
      catalogModule.drawioLibraryCatalog.length = 0;
    }
  }, 30000);
});
