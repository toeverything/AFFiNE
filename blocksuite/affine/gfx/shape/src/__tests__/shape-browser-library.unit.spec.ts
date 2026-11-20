import { describe, expect, it } from 'vitest';

describe('shape browser drawio libraries', () => {
  it('places drawio categories after base ordering', async () => {
    const { EdgelessShapeBrowserPanel } =
      await import('../components/shape-browser-panel.js');
    // The panel's own methods, on an object that shadows only the state
    // they read (no search, no editor settings), rather than a bare literal:
    // `_getAvailableCategories` calls `this._getFilteredItems()`.
    const panel = Object.create((EdgelessShapeBrowserPanel as any).prototype, {
      _searchKeyword: { value: '' },
      edgeless: { value: undefined },
    });
    const categories = panel._getAvailableCategories() as Array<{
      name: string;
    }>;
    const names = categories.map(entry => entry.name);
    // Base categories first, in their fixed order, then the draw.io library
    // categories alphabetically.
    expect(names.slice(0, 4)).toEqual([
      'General',
      'Flowchart',
      'Arrows',
      'Advanced',
    ]);
    const libraries = names.slice(4);
    expect(libraries.length).toBeGreaterThan(0);
    expect(libraries).toEqual(
      [...libraries].sort((a, b) => a.localeCompare(b))
    );
  }, 30000);
});
