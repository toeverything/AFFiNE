import { Inject, Injectable, Optional } from '@nestjs/common';

import { metrics } from '../../base';
import type { PermissionEvaluationOutputV1 } from '../../native';
import { docLegacyBoundary, workspaceLegacyBoundary } from './context';
import {
  PermissionContextLoader,
  type PermissionDocAction,
  type PermissionWorkspaceAction,
} from './context-loader';
import { PermissionService } from './service';
import { PermissionSqlPredicateBuilder } from './sql-predicate';

export const PERMISSION_SHADOW_MISMATCH_CATEGORIES = [
  'legacy_compat_delta',
  'projection',
  'rust_rule',
  'loader',
  'sql_predicate',
  'legacy_api_role_mapping',
  'preview_read_mapping',
  'runtime_state',
  'projection_or_loader',
] as const;

type PermissionShadowMismatchCategory =
  (typeof PERMISSION_SHADOW_MISMATCH_CATEGORIES)[number];

@Injectable()
export class PermissionDiagnosticService {
  constructor(
    private readonly loader: PermissionContextLoader,
    private readonly permission: PermissionService,
    @Optional()
    @Inject(PermissionSqlPredicateBuilder)
    private readonly sqlPredicate = new PermissionSqlPredicateBuilder()
  ) {}

  async shadowDocPermissions(input: {
    userId?: string;
    workspaceId: string;
    docs: Array<{ docId: string; actions: PermissionDocAction[] }>;
    allowLocal?: boolean;
    expectedDeltaCategory?: PermissionShadowMismatchCategory;
  }) {
    const [legacyOutput, newOutput] = await Promise.all([
      this.loader.load(input).then(input => this.permission.evaluate(input)),
      this.loader
        .loadFromNewTables(input)
        .then(input => this.permission.evaluate(input)),
    ]);

    const legacy = legacyOutput.docs.map(doc => ({
      docId: doc.docId,
      ...docLegacyBoundary(doc),
      decisions: doc.decisions,
    }));
    const current = newOutput.docs.map(doc => ({
      docId: doc.docId,
      ...docLegacyBoundary(doc),
      decisions: doc.decisions,
    }));
    const matched = JSON.stringify(legacy) === JSON.stringify(current);
    const mismatchType = matched
      ? null
      : (input.expectedDeltaCategory ??
        this.classifyDocShadowMismatch(legacy, current));
    this.recordShadowMismatch('doc', mismatchType);

    return {
      matched,
      legacy,
      current,
      mismatchType,
    };
  }

  async shadowWorkspacePermissions(input: {
    userId?: string;
    workspaceId: string;
    actions: PermissionWorkspaceAction[];
    allowLocal?: boolean;
    expectedDeltaCategory?: PermissionShadowMismatchCategory;
  }) {
    const legacyInput = {
      userId: input.userId,
      workspaceId: input.workspaceId,
      workspaceActions: input.actions,
      allowLocal: input.allowLocal,
    };
    const [legacyOutput, newOutput] = await Promise.all([
      this.loader
        .load(legacyInput)
        .then(input => this.permission.evaluate(input)),
      this.loader
        .loadFromNewTables(legacyInput)
        .then(input => this.permission.evaluate(input)),
    ]);

    const legacy = {
      ...workspaceLegacyBoundary(legacyOutput.workspace),
      decisions: legacyOutput.workspace.decisions,
    };
    const current = {
      ...workspaceLegacyBoundary(newOutput.workspace),
      decisions: newOutput.workspace.decisions,
    };
    const matched = JSON.stringify(legacy) === JSON.stringify(current);
    const mismatchType = matched
      ? null
      : (input.expectedDeltaCategory ??
        this.classifyShadowMismatch(legacyOutput, newOutput));
    this.recordShadowMismatch('workspace', mismatchType);

    return {
      matched,
      legacy,
      current,
      mismatchType,
    };
  }

  async shadowSqlDocRead(input: {
    userId: string;
    workspaceId: string;
    docs: Array<{ docId: string }>;
    sqlReadableDocIds: string[];
    allowLocal?: boolean;
    expectedDeltaCategory?: PermissionShadowMismatchCategory;
  }) {
    const rustOutput = this.permission.evaluate(
      await this.loader.loadFromNewTables({
        userId: input.userId,
        workspaceId: input.workspaceId,
        docs: input.docs.map(doc => ({
          docId: doc.docId,
          actions: ['Doc.Read'],
        })),
        allowLocal: input.allowLocal,
      })
    );
    const rustReadable = new Set(
      rustOutput.docs
        .filter(doc => doc.decisions[0]?.allowed)
        .map(doc => doc.docId)
    );
    const sqlReadable = new Set(input.sqlReadableDocIds);
    const missingInSql = [...rustReadable].filter(id => !sqlReadable.has(id));
    const extraInSql = [...sqlReadable].filter(id => !rustReadable.has(id));
    const mismatchType =
      missingInSql.length || extraInSql.length
        ? (input.expectedDeltaCategory ?? 'sql_predicate')
        : null;
    this.recordShadowMismatch('sql_predicate', mismatchType);

    return {
      matched: mismatchType === null,
      predicate: this.sqlPredicate.docReadableByNewTables({
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: 'Doc.Read',
      }),
      rustReadableDocIds: [...rustReadable],
      sqlReadableDocIds: [...sqlReadable],
      missingInSql,
      extraInSql,
      mismatchType,
    };
  }

  async shadowPreviewDoc(input: {
    userId?: string;
    workspaceId: string;
    docId: string;
    allowLocal?: boolean;
  }) {
    const result = await this.shadowDocPermissions({
      ...input,
      docs: [{ docId: input.docId, actions: ['Doc.Preview', 'Doc.Read'] }],
    });
    const legacy = result.legacy[0];
    const current = result.current[0];
    const legacyPreviewAllowed = legacy?.decisions.find(
      decision => decision.action === 'Doc.Preview'
    )?.allowed;
    const legacyReadAllowed = legacy?.decisions.find(
      decision => decision.action === 'Doc.Read'
    )?.allowed;
    const previewAllowed = current?.decisions.find(
      decision => decision.action === 'Doc.Preview'
    )?.allowed;
    const readAllowed = current?.decisions.find(
      decision => decision.action === 'Doc.Read'
    )?.allowed;
    const mismatchType =
      legacyPreviewAllowed !== previewAllowed ||
      (previewAllowed && readAllowed && !legacyReadAllowed)
        ? 'preview_read_mapping'
        : result.mismatchType;
    this.recordShadowMismatch('preview', mismatchType);

    return {
      ...result,
      matched: result.matched && mismatchType === null,
      mismatchType,
    };
  }

  async shadowPreviewWorkspace(input: {
    userId?: string;
    workspaceId: string;
    allowLocal?: boolean;
  }) {
    const result = await this.shadowWorkspacePermissions({
      ...input,
      actions: ['Workspace.Preview', 'Workspace.Read'],
    });
    const legacyPreviewAllowed = result.legacy.decisions.find(
      decision => decision.action === 'Workspace.Preview'
    )?.allowed;
    const legacyReadAllowed = result.legacy.decisions.find(
      decision => decision.action === 'Workspace.Read'
    )?.allowed;
    const previewAllowed = result.current.decisions.find(
      decision => decision.action === 'Workspace.Preview'
    )?.allowed;
    const readAllowed = result.current.decisions.find(
      decision => decision.action === 'Workspace.Read'
    )?.allowed;
    const mismatchType =
      legacyPreviewAllowed !== previewAllowed ||
      (previewAllowed && readAllowed && !legacyReadAllowed)
        ? 'preview_read_mapping'
        : result.mismatchType;
    this.recordShadowMismatch('preview', mismatchType);

    return {
      ...result,
      matched: result.matched && mismatchType === null,
      mismatchType,
    };
  }

  private classifyShadowMismatch(
    legacyOutput: PermissionEvaluationOutputV1,
    newOutput: PermissionEvaluationOutputV1
  ) {
    if (JSON.stringify(legacyOutput) === JSON.stringify(newOutput)) {
      return null;
    }
    const legacyRestrictions =
      JSON.stringify(legacyOutput).includes('runtime_');
    const newRestrictions = JSON.stringify(newOutput).includes('runtime_');
    if (legacyRestrictions || newRestrictions) {
      return 'runtime_state';
    }
    if (legacyOutput.docs.length !== newOutput.docs.length) {
      return 'loader';
    }
    if (JSON.stringify(legacyOutput.docs) !== JSON.stringify(newOutput.docs)) {
      return 'rust_rule';
    }
    return 'projection';
  }

  private classifyDocShadowMismatch(
    legacy: Array<
      ReturnType<typeof docLegacyBoundary> & { decisions: unknown }
    >,
    current: Array<
      ReturnType<typeof docLegacyBoundary> & { decisions: unknown }
    >
  ) {
    if (JSON.stringify(legacy) === JSON.stringify(current)) {
      return null;
    }

    const legacyApi = legacy.map(doc => ({
      effectiveRole: doc.effectiveRole,
      legacyApiRole: doc.legacyApiRole,
      resourceOwnerRole: doc.resourceOwnerRole,
    }));
    const currentApi = current.map(doc => ({
      effectiveRole: doc.effectiveRole,
      legacyApiRole: doc.legacyApiRole,
      resourceOwnerRole: doc.resourceOwnerRole,
    }));
    if (JSON.stringify(legacyApi) !== JSON.stringify(currentApi)) {
      return 'legacy_api_role_mapping';
    }

    if (
      JSON.stringify(legacy).includes('runtime_') ||
      JSON.stringify(current).includes('runtime_')
    ) {
      return 'runtime_state';
    }

    if (legacy.length !== current.length) {
      return 'loader';
    }

    const legacyDecisions = legacy.map(doc => doc.decisions);
    const currentDecisions = current.map(doc => doc.decisions);
    if (JSON.stringify(legacyDecisions) !== JSON.stringify(currentDecisions)) {
      return 'rust_rule';
    }

    return 'projection';
  }

  private recordShadowMismatch(
    scope: string,
    category: PermissionShadowMismatchCategory | null
  ) {
    if (!category) {
      return;
    }

    metrics.permission
      .counter('shadow_mismatches', {
        description: 'Permission shadow-read mismatch count',
      })
      .add(1, { scope, category });
  }
}
