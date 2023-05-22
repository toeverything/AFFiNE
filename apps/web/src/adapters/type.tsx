import type {
  AppEvents,
  WorkspaceCRUD,
  WorkspaceUISchema,
} from '@affine/workspace/type';
import type {
  LoadPriority,
  ReleaseType,
  WorkspaceFlavour,
} from '@affine/workspace/type';

export interface WorkspaceAdapter<Flavour extends WorkspaceFlavour> {
  releaseType: ReleaseType;
  flavour: Flavour;
  // Plugin will be loaded according to the priority
  loadPriority: LoadPriority;
  Events: Partial<AppEvents>;
  // Fetch necessary data for the first render
  CRUD: WorkspaceCRUD<Flavour>;
  UI: WorkspaceUISchema<Flavour>;
}
