import { Service } from '../../../framework';
import type { WorkspaceMetadata } from '../metadata';
import type { WorkspaceFlavourProvider } from '../providers/flavour';

export class WorkspaceDestroyService extends Service {
  constructor(private readonly providers: WorkspaceFlavourProvider[]) {
    super();
  }

  deleteWorkspace = async (metadata: WorkspaceMetadata) => {
    const provider = this.providers.find(p => p.flavour === metadata.flavour);
    if (!provider) {
      throw new Error(`Unknown workspace flavour: ${metadata.flavour}`);
    }
    return provider.deleteWorkspace(metadata.id);
  };
}
