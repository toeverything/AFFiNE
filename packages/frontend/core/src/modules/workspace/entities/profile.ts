import { DebugLogger } from '@affine/debug';
import {
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { catchError, EMPTY, exhaustMap, tap } from 'rxjs';

import type { WorkspaceMetadata } from '../metadata';
import type { WorkspaceFlavourProvider } from '../providers/flavour';
import type { WorkspaceFlavoursService } from '../services/flavours';
import type { WorkspaceProfileCacheStore } from '../stores/profile-cache';
import type { Workspace } from './workspace';

const logger = new DebugLogger('affine:workspace-profile');

export interface WorkspaceProfileInfo {
  avatar?: string;
  name?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  isTeam?: boolean;
  isEmpty?: boolean;
}

/**
 * # WorkspaceProfile
 *
 * This class take care of workspace avatar and name
 */
export class WorkspaceProfile extends Entity<{ metadata: WorkspaceMetadata }> {
  private readonly provider: WorkspaceFlavourProvider | null;

  get id() {
    return this.props.metadata.id;
  }

  profile$ = LiveData.from<WorkspaceProfileInfo | null>(
    this.cache.watchProfileCache(this.props.metadata.id),
    null
  );

  avatar$ = this.profile$.map(v => v?.avatar);
  name$ = this.profile$.map(v => v?.name);

  isLoading$ = new LiveData(false);

  constructor(
    private readonly cache: WorkspaceProfileCacheStore,
    flavoursService: WorkspaceFlavoursService
  ) {
    super();

    this.provider =
      flavoursService.flavours$.value.find(
        p => p.flavour === this.props.metadata.flavour
      ) ?? null;
  }

  private setProfile(info: WorkspaceProfileInfo) {
    if (isEqual(this.profile$.value, info)) {
      return;
    }
    this.cache.setProfileCache(this.props.metadata.id, info);
  }

  revalidate = effect(
    exhaustMap(() => {
      const provider = this.provider;
      if (!provider) {
        return EMPTY;
      }
      return fromPromise(signal =>
        provider.getWorkspaceProfile(this.props.metadata.id, signal)
      ).pipe(
        tap(info => {
          if (info) {
            this.setProfile({ ...this.profile$.value, ...info });
          }
        }),
        catchError(err => {
          logger.error(err);
          return EMPTY;
        }),
        onStart(() => this.isLoading$.next(true)),
        onComplete(() => this.isLoading$.next(false))
      );
    })
  );

  syncWithWorkspace(workspace: Workspace) {
    workspace.name$.subscribe(name => {
      const old = this.profile$.value;
      this.setProfile({ ...old, name: name ?? old?.name });
    });
    workspace.avatar$.subscribe(avatar => {
      const old = this.profile$.value;
      this.setProfile({ ...old, avatar: avatar ?? old?.avatar });
    });
  }
}
