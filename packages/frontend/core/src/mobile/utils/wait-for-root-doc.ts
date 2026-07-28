type WorkspaceRootDocLoader = {
  id: string;
  engine: {
    doc: {
      waitForDocLoaded: (docId: string) => Promise<unknown>;
    };
  };
};

const ROOT_DOC_READY_TIMEOUT_MS = 8_000;

export async function waitForRootDocReady(workspace: WorkspaceRootDocLoader) {
  let timeoutId: number | undefined;
  try {
    await Promise.race([
      workspace.engine.doc.waitForDocLoaded(workspace.id),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('Workspace root doc is not loaded')),
          ROOT_DOC_READY_TIMEOUT_MS
        );
      }),
    ]);
  } catch (error) {
    console.warn('Workspace root doc is not loaded before creating doc', error);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}
