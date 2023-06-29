import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { atom } from 'jotai/vanilla';

export const workspaceAtom = atom(async () => {
  const { Workspace } = await import('@blocksuite/store');
  return new Workspace({
    id: 'test-workspace',
  })
    .register(AffineSchemas)
    .register(__unstableSchemas);
});
