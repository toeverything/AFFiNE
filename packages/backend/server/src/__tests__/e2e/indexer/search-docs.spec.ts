import { indexerSearchDocsQuery } from '@affine/graphql';

import { createDocWithMarkdown } from '../../../native';
import { IndexerService } from '../../../plugins/indexer/service';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

e2e('should search docs by keyword', async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, { owner });
  for (const docId of ['doc-0', 'doc-1', 'doc-2']) {
    await app.create(Mockers.DocMeta, { workspaceId: workspace.id, docId });
    await app.create(Mockers.DocSnapshot, {
      workspaceId: workspace.id,
      docId,
      user: owner,
      blob: createDocWithMarkdown(docId, `${docId} hello`, docId),
    });
    await app.get(IndexerService).indexDoc(workspace.id, docId);
  }

  const result = await app.gql({
    query: indexerSearchDocsQuery,
    variables: { id: workspace.id, input: { keyword: 'hello', limit: 2 } },
  });
  t.is(result.workspace.searchDocs.length, 2);
  t.true(result.workspace.searchDocs.every(doc => doc.highlight.length > 0));
});

e2e(
  'should search docs by keyword failed when workspace is no permission',
  async t => {
    const owner = await app.signup();
    const workspace = await app.create(Mockers.Workspace, { owner });
    await app.signup();
    await t.throwsAsync(
      app.gql({
        query: indexerSearchDocsQuery,
        variables: { id: workspace.id, input: { keyword: 'hello' } },
      }),
      { message: /You do not have permission to access Space/ }
    );
  }
);
