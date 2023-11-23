import { assertExists } from '@blocksuite/global/utils';
import type { Page, PageMeta, Workspace } from '@blocksuite/store';
import type { createStore, WritableAtom } from 'jotai/vanilla';
import { nanoid } from 'nanoid';

import { migratePages } from '../migration/blocksuite';

export async function initEmptyPage(page: Page, title?: string) {
  await page.load(() => {
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(title ?? ''),
    });
    page.addBlock('affine:surface', {}, pageBlockId);
    const noteBlockId = page.addBlock('affine:note', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, noteBlockId);
  });
}

/**
 * FIXME: Use exported json data to instead of building data.
 */
export async function buildShowcaseWorkspace(
  workspace: Workspace,
  options: {
    atoms: {
      pageMode: WritableAtom<
        undefined,
        [pageId: string, mode: 'page' | 'edgeless'],
        void
      >;
    };
    store: ReturnType<typeof createStore>;
  }
) {
  const prototypes = {
    tags: {
      options: [
        {
          id: 'icg1n5UdkP',
          value: 'Travel',
          color: 'var(--affine-tag-gray)',
        },
        {
          id: 'Oe5dSe1DDJ',
          value: 'Quick summary',
          color: 'var(--affine-tag-green)',
        },
        {
          id: 'g1L5dXKctL',
          value: 'OKR',
          color: 'var(--affine-tag-purple)',
        },
        {
          id: 'q3mceOl_zi',
          value: 'Streamline your workflow',
          color: 'var(--affine-tag-teal)',
        },
        {
          id: 'ze07JVwBu4',
          value: 'Plan',
          color: 'var(--affine-tag-teal)',
        },
        {
          id: '8qcYPCTK0h',
          value: 'Review',
          color: 'var(--affine-tag-orange)',
        },
        {
          id: 'wg-fBtd2eI',
          value: 'Engage',
          color: 'var(--affine-tag-pink)',
        },
        {
          id: 'QYFD_HeQc-',
          value: 'Create',
          color: 'var(--affine-tag-blue)',
        },
        {
          id: 'ZHBa2NtdSo',
          value: 'Learn',
          color: 'var(--affine-tag-yellow)',
        },
      ],
    },
  };
  workspace.meta.setProperties(prototypes);
  const edgelessPage1 = nanoid();
  const edgelessPage2 = nanoid();
  const edgelessPage3 = nanoid();
  const { store, atoms } = options;
  [edgelessPage1, edgelessPage2, edgelessPage3].forEach(pageId => {
    store.set(atoms.pageMode, pageId, 'edgeless');
  });

  const pageMetas = {
    '9f6f3c04-cf32-470c-9648-479dc838f10e': {
      createDate: 1691548231530,
      tags: ['ZHBa2NtdSo', 'QYFD_HeQc-', 'wg-fBtd2eI'],
      updatedDate: 1691676331623,
      favorite: true,
      jumpOnce: true,
    },
    '0773e198-5de0-45d4-a35e-de22ea72b96b': {
      createDate: 1691548220794,
      tags: [],
      updatedDate: 1691676775642,
      favorite: false,
    },
    '59b140eb-4449-488f-9eeb-42412dcc044e': {
      createDate: 1691551731225,
      tags: [],
      updatedDate: 1691654611175,
      favorite: false,
    },
    '7217fbe2-61db-4a91-93c6-ad5c800e5a43': {
      createDate: 1691552082822,
      tags: [],
      updatedDate: 1691654606912,
      favorite: false,
    },
    '6eb43ea8-8c11-456d-bb1d-5193937961ab': {
      createDate: 1691552090989,
      tags: [],
      updatedDate: 1691646748171,
      favorite: false,
    },
    '3ddc8a4f-62c7-4fd4-8064-9ed9f61e437a': {
      createDate: 1691564303138,
      tags: [],
      updatedDate: 1691646845195,
    },
    '512b1cb3-d22d-4b20-a7aa-58e2afcb1238': {
      createDate: 1691574743531,
      tags: ['icg1n5UdkP'],
      updatedDate: 1691647117761,
    },
    '22163830-8252-43fe-b62d-fd9bbeaa4caa': {
      createDate: 1691574859042,
      tags: [],
      updatedDate: 1691648159371,
    },
    'b7a9e1bc-e205-44aa-8dad-7e328269d00b': {
      createDate: 1691575011078,
      tags: ['8qcYPCTK0h'],
      updatedDate: 1691645074511,
      favorite: false,
    },
    '646305d9-93e0-48df-bb92-d82944ceb5a3': {
      createDate: 1691634722239,
      tags: ['ze07JVwBu4'],
      updatedDate: 1691647069662,
      favorite: false,
    },
    '0350509d-8702-4797-b4d7-168f5e9359c7': {
      createDate: 1691635388447,
      tags: ['Oe5dSe1DDJ'],
      updatedDate: 1691645873930,
    },
    'aa02af3c-5c5c-4856-b7ce-947ad17331f3': {
      createDate: 1691636192263,
      tags: ['q3mceOl_zi', 'g1L5dXKctL'],
      updatedDate: 1691645102104,
    },
    '9d6e716e-a071-45a2-88ac-2f2f6eec0109': {
      createDate: 1691574743531,
      tags: ['icg1n5UdkP'],
      updatedDate: 1691574743531,
    },
  } satisfies Record<string, Partial<PageMeta>>;
  const data = [
    [
      '9f6f3c04-cf32-470c-9648-479dc838f10e',
      import('@affine/templates/v1/getting-started.json'),
      nanoid(),
    ],
    [
      '0773e198-5de0-45d4-a35e-de22ea72b96b',
      import('@affine/templates/v1/preloading.json'),
      edgelessPage1,
    ],
    [
      '59b140eb-4449-488f-9eeb-42412dcc044e',
      import('@affine/templates/v1/template-galleries.json'),
      nanoid(),
    ],
    [
      '7217fbe2-61db-4a91-93c6-ad5c800e5a43',
      import('@affine/templates/v1/personal-home.json'),
      nanoid(),
    ],
    [
      '6eb43ea8-8c11-456d-bb1d-5193937961ab',
      import('@affine/templates/v1/working-home.json'),
      nanoid(),
    ],
    [
      '3ddc8a4f-62c7-4fd4-8064-9ed9f61e437a',
      import('@affine/templates/v1/personal-project-management.json'),
      nanoid(),
    ],
    [
      '512b1cb3-d22d-4b20-a7aa-58e2afcb1238',
      import('@affine/templates/v1/travel-plan.json'),
      edgelessPage2,
    ],
    [
      '22163830-8252-43fe-b62d-fd9bbeaa4caa',
      import('@affine/templates/v1/personal-knowledge-management.json'),
      nanoid(),
    ],
    [
      'b7a9e1bc-e205-44aa-8dad-7e328269d00b',
      import('@affine/templates/v1/annual-performance-review.json'),
      nanoid(),
    ],
    [
      '646305d9-93e0-48df-bb92-d82944ceb5a3',
      import('@affine/templates/v1/brief-event-planning.json'),
      nanoid(),
    ],
    [
      '0350509d-8702-4797-b4d7-168f5e9359c7',
      import('@affine/templates/v1/meeting-summary.json'),
      nanoid(),
    ],
    [
      'aa02af3c-5c5c-4856-b7ce-947ad17331f3',
      import('@affine/templates/v1/okr-template.json'),
      nanoid(),
    ],
    [
      '9d6e716e-a071-45a2-88ac-2f2f6eec0109',
      import('@affine/templates/v1/travel-note.json'),
      edgelessPage3,
    ],
  ] as const;
  const idMap = await Promise.all(data).then(async data => {
    return data.reduce<Record<string, string>>(
      (record, currentValue) => {
        const [oldId, _, newId] = currentValue;
        record[oldId] = newId;
        return record;
      },
      {} as Record<string, string>
    );
  });
  await Promise.all(
    data.map(async ([id, promise, newId]) => {
      const { default: template } = await promise;
      let json = JSON.stringify(template);
      Object.entries(idMap).forEach(([oldId, newId]) => {
        json = json.replaceAll(oldId, newId);
      });
      json = JSON.parse(json);
      await workspace
        .importPageSnapshot(structuredClone(json), newId)
        .catch(error => {
          console.error('error importing page', id, error);
        });
      const page = workspace.getPage(newId);
      assertExists(page);
      await page.load();
      workspace.schema.upgradePage(
        0,
        {
          'affine:note': 1,
          'affine:bookmark': 1,
          'affine:database': 2,
          'affine:divider': 1,
          'affine:image': 1,
          'affine:list': 1,
          'affine:code': 1,
          'affine:page': 2,
          'affine:paragraph': 1,
          'affine:surface': 3,
        },
        page.spaceDoc
      );

      // The showcase building will create multiple pages once, and may skip the version writing.
      // https://github.com/toeverything/blocksuite/blob/master/packages/store/src/workspace/page.ts#L662
      if (!workspace.meta.blockVersions) {
        await migratePages(workspace.doc, workspace.schema);
      }
    })
  );
  Object.entries(pageMetas).forEach(([oldId, meta]) => {
    const newId = idMap[oldId];
    workspace.setPageMeta(newId, meta);
  });
}
