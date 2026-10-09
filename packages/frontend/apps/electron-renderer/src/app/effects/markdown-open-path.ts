type WorkspaceFolder = {
  workspaceId: string;
  folderPath: string;
  sourceFile?: string | null;
};

function normalizePath(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(normalized)
    ? normalized.toLowerCase()
    : normalized || '/';
}

export function getMarkdownParentDirectory(filePath: string) {
  const normalized = filePath.replaceAll('\\', '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) {
    return lastSlash === 0 ? '/' : normalized;
  }
  return normalized.slice(0, lastSlash);
}

export function findWorkspaceForMarkdownFile(
  filePath: string,
  workspaces: WorkspaceFolder[]
) {
  const normalizedFile = normalizePath(filePath);
  return (
    workspaces
      .map(workspace => ({
        ...workspace,
        normalizedFolder: normalizePath(workspace.folderPath),
        normalizedSourceFile: workspace.sourceFile
          ? normalizePath(workspace.sourceFile)
          : null,
      }))
      .filter(({ normalizedFolder, normalizedSourceFile }) =>
        normalizedSourceFile
          ? normalizedFile === normalizedSourceFile
          : normalizedFile.startsWith(`${normalizedFolder}/`)
      )
      .sort((a, b) => b.normalizedFolder.length - a.normalizedFolder.length)[0]
      ?.workspaceId ?? null
  );
}

export function getWorkspaceIdFromDiskSession(sessionId: string) {
  try {
    const [universalId] = JSON.parse(sessionId) as [string, string];
    return /@id\((.*)\);$/.exec(universalId)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function markdownPathsEqual(left: string, right: string) {
  return normalizePath(left) === normalizePath(right);
}

export function workspaceNeedsMarkdownSource(
  filePath: string,
  sourceFile?: string | null
) {
  return !sourceFile || !markdownPathsEqual(filePath, sourceFile);
}
