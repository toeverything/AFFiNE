import { beforeEach, describe, expect, test } from 'vitest';

import { EdgelessShapeBrowserPanel } from '../../../../affine/gfx/shape/src/components/shape-browser-panel.js';
import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('edgeless shape browser panel', () => {
  let panel!: EdgelessShapeBrowserPanel;

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    const edgelessRoot = getDocRootBlock(doc, editor, 'edgeless');
    panel = new EdgelessShapeBrowserPanel();
    panel.edgeless = edgelessRoot;
    document.body.append(panel);
    await panel.updateComplete;
    return async () => {
      panel.remove();
      await cleanup();
    };
  });

  test('category list follows the base ordering', () => {
    const categories = (panel as any)._getAvailableCategories() as Array<{
      id: string;
      name: string;
    }>;
    const names = categories.map(entry => entry.name);
    const baseOrder = ['General', 'Flowchart', 'Arrows', 'Basic', 'Misc'];
    const baseIndexes = baseOrder
      .map(name => names.indexOf(name))
      .filter(index => index >= 0);

    for (let i = 1; i < baseIndexes.length; i += 1) {
      expect(baseIndexes[i]).toBeGreaterThan(baseIndexes[i - 1]);
    }
  });

  test('search keyword filters shapes within a category', () => {
    const baseShapes = (panel as any)._getShapesForCategory(
      'general'
    ) as Array<{
      name: string;
      tooltip: string;
    }>;
    (panel as any)._searchKeyword = 'triangle';
    const filteredShapes = (panel as any)._getShapesForCategory(
      'general'
    ) as Array<{
      name: string;
      tooltip: string;
    }>;

    expect(filteredShapes.length).toBeLessThan(baseShapes.length);
    filteredShapes.forEach(shape => {
      const haystack = `${shape.name} ${shape.tooltip}`.toLowerCase();
      expect(haystack).toContain('triangle');
    });
  });

  test('search keyword narrows available categories', () => {
    (panel as any)._searchKeyword = 'arrow';
    const categories = (panel as any)._getAvailableCategories() as Array<{
      name: string;
    }>;
    const names = categories.map(entry => entry.name);

    expect(names).toContain('Arrows');
    expect(names).not.toContain('Flowchart');
  });
});
