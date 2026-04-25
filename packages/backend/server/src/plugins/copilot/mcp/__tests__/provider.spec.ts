import test from 'ava';

import { WorkspaceMcpProvider } from '../provider';

function createAccessController() {
  return {
    user: () => ({
      workspace: () => ({
        assert: async () => {},
        doc: () => ({
          can: async () => true,
        }),
        docs: async (docs: unknown[]) => docs,
      }),
    }),
  };
}

test('WorkspaceMcpProvider exposes the canonical doc tool contract', async t => {
  const provider = new WorkspaceMcpProvider(
    createAccessController() as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

  const server = await provider.for('user-id', 'workspace-id');
  const toolNames = new Set(server.tools.map(tool => tool.name));

  t.true(toolNames.has('doc_read'));
  t.true(toolNames.has('doc_semantic_search'));
  t.true(toolNames.has('doc_keyword_search'));

  t.false(toolNames.has('read_document'));
  t.false(toolNames.has('semantic_search'));
  t.false(toolNames.has('keyword_search'));
});

test('doc_read accepts doc_id as the document identifier', async t => {
  const provider = new WorkspaceMcpProvider(
    createAccessController() as any,
    {
      getDocMarkdown: async () => ({
        markdown: '# Document',
      }),
    } as any,
    {} as any,
    {} as any,
    {} as any
  );

  const server = await provider.for('user-id', 'workspace-id');
  const docRead = server.tools.find(tool => tool.name === 'doc_read');

  t.truthy(docRead);
  t.deepEqual(docRead?.inputSchema, {
    type: 'object',
    properties: {
      doc_id: {
        type: 'string',
        description: 'The target document ID to read',
      },
    },
    required: ['doc_id'],
    additionalProperties: false,
  });

  const result = await docRead?.execute(
    { doc_id: 'doc-id' },
    { signal: new AbortController().signal }
  );

  t.deepEqual(result, {
    content: [{ type: 'text', text: '# Document' }],
  });
});
