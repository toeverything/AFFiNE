import type { Workspace } from '@blocksuite/store';

export async function buildShowcaseWorkspace(workspace: Workspace) {
  const data = [
    ['F1SX6cgNxy-hello-world', import('@affine/templates/v1/preloading.json')],
    ['gc5FeppNDv', import('@affine/templates/v1/getting-started.json')],
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
    })
  );
}
