import { describe, expect, it } from 'vitest';

import {
  MobileNavigationProjection,
  type MobileNavigationSection,
} from './navigation-projection';

const projection = new MobileNavigationProjection();

describe('MobileNavigationProjection', () => {
  it('flattens expanded paths and preserves duplicate path identity', () => {
    const sections: MobileNavigationSection[] = [
      {
        id: 'favorites',
        children: [
          { kind: 'doc', entityId: 'a' },
          { kind: 'doc', entityId: 'a' },
          {
            kind: 'folder',
            entityId: 'folder',
            children: [{ kind: 'doc', entityId: 'b' }],
          },
        ],
      },
    ];
    const rows = projection.flatten(
      sections,
      new Set(['favorites', 'favorites/folder%3Afolder'])
    );

    expect(rows.map(row => [row.kind, row.depth, row.entityId])).toEqual([
      ['section', 0, 'favorites'],
      ['doc', 1, 'a'],
      ['doc', 1, 'a'],
      ['folder', 1, 'folder'],
      ['doc', 2, 'b'],
    ]);
    expect(rows[1].id).not.toBe(rows[2].id);
  });

  it('stops cycles at the current item boundary', () => {
    const cyclic = { kind: 'doc', entityId: 'a' } as const;
    const sections: MobileNavigationSection[] = [
      {
        id: 'favorites',
        children: [
          {
            ...cyclic,
            children: [{ ...cyclic, children: [cyclic] }],
          },
        ],
      },
    ];
    const rows = projection.flatten(
      sections,
      new Set(['favorites', 'favorites/doc%3Aa'])
    );

    expect(rows.map(row => row.kind)).toEqual([
      'section',
      'doc',
      'placeholder',
    ]);
  });

  it('omits descendants of collapsed rows', () => {
    const sections: MobileNavigationSection[] = [
      {
        id: 'folders',
        children: [
          {
            kind: 'folder',
            entityId: 'folder',
            children: [{ kind: 'doc', entityId: 'doc' }],
          },
        ],
      },
    ];
    expect(
      projection
        .flatten(sections, new Set(['folders']))
        .map(row => row.entityId)
    ).toEqual(['folders', 'folder']);
  });

  it('preserves action semantics independently of row depth', () => {
    const rows = projection.flatten(
      [
        {
          id: 'favorites',
          children: [
            {
              kind: 'doc',
              entityId: 'doc',
              expandable: true,
              children: [
                {
                  kind: 'action',
                  entityId: 'doc',
                  action: 'doc-new-linked',
                },
              ],
            },
          ],
        },
      ],
      new Set(['favorites', 'favorites/doc%3Adoc'])
    );

    expect(rows.at(-1)).toMatchObject({
      kind: 'action',
      depth: 2,
      action: 'doc-new-linked',
    });
  });

  it.each([
    ['collection', 'collection-new-doc'],
    ['tag', 'tag-new-doc'],
  ] as const)(
    'keeps an empty %s expandable with its create action',
    (kind, action) => {
      const entityId = `empty-${kind}`;
      const rowId = `items/${kind}%3A${entityId}`;
      const rows = projection.flatten(
        [
          {
            id: 'items',
            children: [
              {
                kind,
                entityId,
                expandable: true,
                children: [{ kind: 'action', entityId, action }],
              },
            ],
          },
        ],
        new Set(['items', rowId])
      );

      expect(rows[1]).toMatchObject({
        kind,
        entityId,
        expandable: true,
        expanded: true,
      });
      expect(rows[2]).toMatchObject({ kind: 'action', action, depth: 2 });
    }
  );

  it.each([
    ['loading', 'loading'],
    ['denied', 'denied'],
  ] as const)(
    'projects %s permission as a terminal placeholder',
    (permission, blocked) => {
      const rows = projection.flatten(
        [
          {
            id: 'favorites',
            children: [
              {
                kind: 'doc',
                entityId: 'private',
                permission,
                children: [{ kind: 'doc', entityId: 'hidden-child' }],
              },
            ],
          },
        ],
        new Set(['favorites', 'favorites/doc%3Aprivate'])
      );
      expect(rows.at(-1)).toMatchObject({
        kind: 'placeholder',
        entityId: 'private',
        blocked,
      });
      expect(rows.some(row => row.entityId === 'hidden-child')).toBe(false);
    }
  );

  it.each([60, 600, 6000])(
    'keeps stable mixed section paths for %i items per section',
    count => {
      const section = (
        id: string,
        kind: 'doc' | 'collection' | 'folder' | 'tag'
      ): MobileNavigationSection => ({
        id,
        children: Array.from({ length: count }, (_, index) => ({
          kind,
          entityId: `${kind}-${index}`,
          linked: kind === 'doc' && index === 0,
        })),
      });
      const rows = projection.flatten(
        [
          section('favorites', 'doc'),
          section('collections', 'collection'),
          section('organize', 'folder'),
          section('tags', 'tag'),
        ],
        new Set(['favorites', 'collections', 'organize', 'tags'])
      );
      expect(rows).toHaveLength(count * 4 + 4);
      expect(rows[1]).toMatchObject({ linked: true, depth: 1 });
      expect(new Set(rows.map(row => row.kind))).toEqual(
        new Set(['section', 'doc', 'collection', 'folder', 'tag'])
      );
      expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
    }
  );
});
