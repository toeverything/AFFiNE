type MarkdownWorkspace = {
  engine: {
    doc: {
      addPriority(docId: string, priority: number): () => void;
      waitForSynced(docId: string, abort?: AbortSignal): Promise<void>;
    };
  };
};

type MarkdownWorkspaceRef<TWorkspace extends MarkdownWorkspace> = {
  workspace: TWorkspace;
  dispose(): void;
};

const MARKDOWN_SYNC_TIMEOUT = 60_000;

export async function waitForMarkdownDocumentSync<
  TWorkspace extends MarkdownWorkspace,
>(
  openWorkspace: (
    workspaceId: string
  ) => MarkdownWorkspaceRef<TWorkspace> | undefined,
  workspaceId: string,
  docId: string,
  waitForDocumentAvailable: (
    workspace: TWorkspace,
    docId: string,
    abort: AbortSignal
  ) => Promise<void>,
  navigate: (path: string) => Promise<unknown>
) {
  const workspaceRef = openWorkspace(workspaceId);
  if (!workspaceRef) {
    throw new Error(`Workspace ${workspaceId} is unavailable.`);
  }

  const abort = new AbortController();
  const timeout = setTimeout(() => {
    abort.abort(new Error(`Timed out syncing Markdown document ${docId}.`));
  }, MARKDOWN_SYNC_TIMEOUT);
  const removePriority = workspaceRef.workspace.engine.doc.addPriority(
    docId,
    100
  );

  try {
    await waitForDocumentAvailable(workspaceRef.workspace, docId, abort.signal);
    await navigate(`/workspace/${workspaceId}/${docId}`);
    await workspaceRef.workspace.engine.doc.waitForSynced(docId, abort.signal);
  } finally {
    clearTimeout(timeout);
    removePriority();
    workspaceRef.dispose();
  }
}
