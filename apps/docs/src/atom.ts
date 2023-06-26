import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Workspace } from '@blocksuite/store';
import { atom } from 'jotai/vanilla';

export const workspaceAtom = atom(
  new Workspace({
    id: 'test-workspace',
  })
    .register(AffineSchemas)
    .register(__unstableSchemas)
);
