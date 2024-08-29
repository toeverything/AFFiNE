import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import type { WorkspaceFlavourProvider } from '../providers/flavour';

export class WorkspaceList extends Entity {
  workspaces$ = new LiveData(this.providers.map(p => p.workspaces$))
    .map(v => {
      return v;
    })
    .flat()
    .map(workspaces => {
      return workspaces.flat();
    });
  isRevalidating$ = new LiveData(
    this.providers.map(p => p.isRevalidating$ ?? new LiveData(false))
  )
    .flat()
    .map(isLoadings => isLoadings.some(isLoading => isLoading));

  workspace$(id: string) {
    return this.workspaces$.map(workspaces =>
      workspaces.find(workspace => workspace.id === id)
    );
  }

  constructor(private readonly providers: WorkspaceFlavourProvider[]) {
    super();
  }

  revalidate() {
    this.providers.forEach(provider => provider.revalidate?.());
  }

  waitForRevalidation(signal?: AbortSignal) {
    this.revalidate();
    return this.isRevalidating$.waitFor(isLoading => !isLoading, signal);
  }
}
