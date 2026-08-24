type WorkspaceIdentity = {
  id: string;
  flavour: string;
};

type ResolveShareTargetWorkspaceOptions<T extends WorkspaceIdentity> = {
  currentFlavour?: string | null;
  currentId?: string | null;
  preferredFlavour?: string | null;
  preferredId?: string | null;
  workspaces: readonly T[];
};

export function resolveShareTargetWorkspace<T extends WorkspaceIdentity>({
  currentFlavour,
  currentId,
  preferredFlavour,
  preferredId,
  workspaces,
}: ResolveShareTargetWorkspaceOptions<T>): T | null {
  if (preferredId) {
    const matches = workspaces.filter(meta => meta.id === preferredId);
    if (preferredFlavour) {
      return matches.find(meta => meta.flavour === preferredFlavour) ?? null;
    }
    return matches.length === 1 ? matches[0] : null;
  }

  if (currentId) {
    const current = workspaces.find(
      meta =>
        meta.id === currentId &&
        (!currentFlavour || meta.flavour === currentFlavour)
    );
    if (current) {
      return current;
    }
  }

  return workspaces[0] ?? null;
}
