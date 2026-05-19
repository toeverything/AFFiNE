import './config';

import { Module } from '@nestjs/common';

import { QuotaServiceModule } from '../quota/service.module';
import { AccessControllerBuilder } from './builder';
import { PermissionContextLoader } from './context-loader';
import { PermissionDiagnosticService } from './diagnostic';
import { EventsListener } from './event';
import { WorkspacePolicyService } from './policy';
import { PermissionProjectionChecker } from './projection-checker';
import { PermissionService } from './service';
import { PermissionSqlPredicateBuilder } from './sql-predicate';

@Module({
  imports: [QuotaServiceModule],
  providers: [
    AccessControllerBuilder,
    EventsListener,
    WorkspacePolicyService,
    PermissionProjectionChecker,
    PermissionSqlPredicateBuilder,
    PermissionContextLoader,
    PermissionDiagnosticService,
    PermissionService,
  ],
  exports: [
    AccessControllerBuilder,
    WorkspacePolicyService,
    PermissionProjectionChecker,
    PermissionSqlPredicateBuilder,
    PermissionDiagnosticService,
    PermissionService,
  ],
})
export class PermissionModule {}

export { AccessControllerBuilder as PermissionAccess } from './builder';
export { PermissionContextLoader } from './context-loader';
export {
  PERMISSION_SHADOW_MISMATCH_CATEGORIES,
  PermissionDiagnosticService,
} from './diagnostic';
export {
  type DotToUnderline,
  mapPermissionsToGraphqlPermissions,
} from './permission-map';
export { WorkspacePolicyService } from './policy';
export { PermissionProjectionChecker } from './projection-checker';
export { PermissionService } from './service';
export { PermissionSqlPredicateBuilder } from './sql-predicate';
export {
  DOC_ACTIONS,
  type DocAction,
  DocRole,
  WORKSPACE_ACTIONS,
  type WorkspaceAction,
  WorkspaceRole,
} from './types';
