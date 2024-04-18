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
  isLoading$ = new LiveData(
    this.providers.map(p => p.isLoading$ ?? new LiveData(false))
  )
    .flat()
    .map(isLoadings => isLoadings.some(isLoading => isLoading));

  constructor(private readonly providers: WorkspaceFlavourProvider[]) {
    super();
  }

  revalidate() {
    this.providers.forEach(provider => provider.revalidate?.());
  }
}
