import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import { migrateToSubdoc } from '@affine/env/blocksuite';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Workspace } from '@blocksuite/store';
import { NoSsr } from '@mui/material';
import type { ReactElement } from 'react';
import { use, useCallback } from 'react';
import * as Y from 'yjs';
const { default: json } = await import('@affine-test/fixtures/output.json');

const workspace = new Workspace({
  id: 'test-migration',
  isSSR: typeof window === 'undefined',
});

const finalWorkspace = new Workspace({
  id: 'test-migration-final',
  isSSR: typeof window === 'undefined',
});

finalWorkspace.register(AffineSchemas).register(__unstableSchemas);
workspace.register(AffineSchemas).register(__unstableSchemas);

if (typeof window !== 'undefined') {
  const length = Object.keys(json).length;
  const binary = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    binary[i] = (json as any)[i];
  }
  Y.applyUpdate(workspace.doc, binary);
  {
    // invoke data
    workspace.doc.getMap('space:hello-world');
    workspace.doc.getMap('space:meta');
  }
  const newDoc = migrateToSubdoc(workspace.doc);
  Y.applyUpdate(finalWorkspace.doc, Y.encodeStateAsUpdate(newDoc));
  finalWorkspace.doc.subdocs.forEach(finalSubdoc => {
    newDoc.subdocs.forEach(subdoc => {
      if (subdoc.guid === finalSubdoc.guid) {
        Y.applyUpdate(finalSubdoc, Y.encodeStateAsUpdate(subdoc));
      }
    });
  });
}

const MigrationInner = () => {
  const page = finalWorkspace.getPage('hello-world');
  const onInit = useCallback(() => {}, []);
  if (!page) {
    return <>loading...</>;
  }
  if (!page.loaded) {
    use(page.waitForLoaded());
  }
  return (
    <div
      style={{
        overflow: 'auto',
        height: '100vh',
      }}
    >
      <BlockSuiteEditor page={page} mode="page" onInit={onInit} />
    </div>
  );
};

export default function MigrationPage(): ReactElement {
  return (
    <NoSsr>
      <MigrationInner />
    </NoSsr>
  );
}
