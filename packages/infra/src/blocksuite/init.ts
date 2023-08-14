import type { PageMeta, Workspace } from '@blocksuite/store';
import type { createStore, WritableAtom } from 'jotai/vanilla';

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
  const showcaseWorkspaceVersions = {
    'affine:code': 1,
    'affine:paragraph': 1,
    'affine:page': 2,
    'affine:list': 1,
    'affine:note': 1,
    'affine:divider': 1,
    'affine:image': 1,
    'affine:surface': 3,
    'affine:bookmark': 1,
    'affine:database': 2,
  };
  workspace.doc.getMap('meta').set('blockVersions', showcaseWorkspaceVersions);
  const prototypes = {
    tags: {
      options: [
        {
          id: 'icg1n5UdkP',
          value: 'Travle',
          color: 'var(--affine-tag-gray)',
        },
        {
          id: 'Oe5dSe1DDJ',
          value: 'quick dummary',
          color: 'var(--affine-tag-green)',
        },
        {
          id: 'g1L5dXKctL',
          value: 'OKR',
          color: 'var(--affine-tag-purple)',
        },
        {
          id: 'q3mceOl_zi',
          value: 'streamline your workflow',
          color: 'var(--affine-tag-teal)',
        },
        {
          id: 'ze07JVwBu4',
          value: 'plan',
          color: 'var(--affine-tag-teal)',
        },
        {
          id: '8qcYPCTK0h',
          value: 'review',
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
  const { store, atoms } = options;
  ['F1SX6cgNxy', 'nQd2Bdvoqz'].forEach(pageId => {
    store.set(atoms.pageMode, pageId, 'edgeless');
  });

  const pageMetas = {
    'gc5FeppNDv-hello-world': {
      createDate: 1691548231530,
      tags: ['ZHBa2NtdSo', 'QYFD_HeQc-', 'wg-fBtd2eI'],
      updatedDate: 1691676331623,
      favorite: true,
      jumpOnce: true,
    },
    F1SX6cgNxy: {
      createDate: 1691548220794,
      tags: [],
      updatedDate: 1691676775642,
      favorite: false,
    },
    '3R9X-gMh3m': {
      createDate: 1691551731225,
      tags: [],
      updatedDate: 1691654611175,
      favorite: false,
    },
    z_v6LOqNpp: {
      createDate: 1691552082822,
      tags: [],
      updatedDate: 1691654606912,
      favorite: false,
    },
    '0N0WzwmtK_': {
      createDate: 1691552090989,
      tags: [],
      updatedDate: 1691646748171,
      favorite: false,
    },
    '6gexHy-jto': {
      createDate: 1691564303138,
      tags: [],
      updatedDate: 1691646845195,
    },
    nQd2Bdvoqz: {
      createDate: 1691574743531,
      tags: ['icg1n5UdkP'],
      updatedDate: 1691647117761,
    },
    bj_cuI1tN7: {
      createDate: 1691574859042,
      tags: [],
      updatedDate: 1691648159371,
    },
    fFoDX2J1Z5: {
      createDate: 1691575011078,
      tags: ['8qcYPCTK0h'],
      updatedDate: 1691645074511,
      favorite: false,
    },
    PqZ7MLlL_9: {
      createDate: 1691634722239,
      tags: ['ze07JVwBu4'],
      updatedDate: 1691647069662,
      favorite: false,
    },
    A4wBRdQZN0: {
      createDate: 1691635388447,
      tags: ['Oe5dSe1DDJ'],
      updatedDate: 1691645873930,
    },
    kBB4lzhm7C: {
      createDate: 1691636192263,
      tags: ['q3mceOl_zi', 'g1L5dXKctL'],
      updatedDate: 1691645102104,
    },
  } satisfies Record<string, Partial<PageMeta>>;
  const data = [
    [
      'gc5FeppNDv-hello-world',
      import('@affine/templates/v1/getting-started.json'),
    ],
    ['F1SX6cgNxy', import('@affine/templates/v1/preloading.json')],
    ['3R9X-gMh3m', import('@affine/templates/v1/template-galleries.json')],
    ['z_v6LOqNpp', import('@affine/templates/v1/personal-home.json')],
    ['0N0WzwmtK_', import('@affine/templates/v1/working-home.json')],
    [
      '6gexHy-jto',
      import('@affine/templates/v1/personal-project-management.json'),
    ],
    ['nQd2Bdvoqz', import('@affine/templates/v1/travel-plan.json')],
    [
      'bj_cuI1tN7',
      import('@affine/templates/v1/personal-knowledge-management.json'),
    ],
    [
      'fFoDX2J1Z5',
      import('@affine/templates/v1/annual-performance-review.json'),
    ],
    ['PqZ7MLlL_9', import('@affine/templates/v1/brief-event-planning.json')],
    ['A4wBRdQZN0', import('@affine/templates/v1/meeting-summary.json')],
    ['kBB4lzhm7C', import('@affine/templates/v1/okr-template.json')],
  ] as const;
  await Promise.all(
    data.map(async ([id, promise]) => {
      const { default: template } = await promise;
      await workspace.importPageSnapshot(template, id);
      workspace.setPageMeta(id, pageMetas[id]);
    })
  );
}
