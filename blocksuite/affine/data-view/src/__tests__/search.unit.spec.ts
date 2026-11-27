import { afterEach, describe, expect, test, vi } from 'vitest';

import { DataViewHeaderToolsSearch } from '../widget-presets/tools/presets/search/search.js';

customElements.define(
  'data-view-header-tools-search',
  DataViewHeaderToolsSearch
);

describe('database search input', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test.each(['Backspace', 'Delete', 'ArrowLeft', 'Enter', 'Escape', 'a'])(
    'does not forward %s to document key handlers',
    async key => {
      const search = new DataViewHeaderToolsSearch();
      search.dataViewLogic = { view: { setSearch: vi.fn() } } as never;
      document.body.append(search);
      await search.updateComplete;

      const documentKeydown = vi.fn();
      document.addEventListener('keydown', documentKeydown);
      search
        .querySelector('input')!
        .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      document.removeEventListener('keydown', documentKeydown);

      expect(documentKeydown).not.toHaveBeenCalled();
    }
  );
});
