export * from './format';
export * from './projection';
export * from './serializer';
export * from './service';
export * from './types';

import { WorkspaceDBService } from '@affine/core/modules/db';
import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { DocsService } from '@affine/core/modules/doc';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { TagService } from '@affine/core/modules/tag';
import {
  WorkspaceLocalState,
  WorkspaceScope,
  WorkspaceService,
} from '@affine/core/modules/workspace';
import type { Framework } from '@toeverything/infra';

import { LocalMirrorSerializer } from './serializer';
import { LocalMirrorService } from './service';

export function configureDesktopLocalMirrorModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(LocalMirrorSerializer)
    .service(LocalMirrorService, [
      FeatureFlagService,
      WorkspacePermissionService,
      WorkspaceService,
      DocsService,
      WorkspaceDBService,
      TagService,
      WorkspaceLocalState,
      DesktopApiService,
      LocalMirrorSerializer,
    ]);
}
