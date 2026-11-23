import { metrics } from '../../base/metrics';

type PermissionTelemetryEvent =
  | {
      kind: 'evaluation';
      deployment: 'cloud' | 'selfhosted';
      action_class: 'workspace' | 'doc';
      decision: 'allow' | 'deny';
      reason: string;
      count: number;
    }
  | {
      kind: 'license_verification';
      deployment: 'selfhosted';
      result: 'allow' | 'deny';
      reason: 'valid' | 'invalid' | 'expired' | 'status' | 'inapplicable';
    }
  | {
      kind: 'license_health';
      result: 'success' | 'error';
      changes: number;
    }
  | {
      kind: 'quota_cache';
      deployment: 'cloud' | 'selfhosted';
      cache: 'entitlement' | 'owner' | 'storage' | 'seat';
      event: 'request' | 'db_load' | 'invalidation';
      result: 'hit' | 'miss' | 'success' | 'error' | 'applied';
      count: number;
      entries: number;
      bytes: number;
    }
  | {
      kind: 'quota_guard';
      domain: 'seat' | 'storage';
      operation: 'reserve' | 'activate' | 'finalize' | 'abort' | 'cleanup';
      result: 'allow' | 'deny' | 'mismatch';
      reason: string;
    }
  | {
      kind: 'blob_access';
      operation: 'manifest' | 'workspace_manifest' | 'open' | 'chunk';
      result: 'allow' | 'deny';
      reason:
        | 'authorized'
        | 'authorization'
        | 'protocol'
        | 'reference'
        | 'ledger'
        | 'parse'
        | 'stale'
        | 'storage'
        | 'internal';
    }
  | {
      kind: 'blob_ref_cache';
      event: 'request' | 'parse';
      result: 'hit' | 'miss' | 'success' | 'error' | 'overload';
      entries: number;
      bytes: number;
    };

export function recordPermissionTelemetry(error: Error | null, value: string) {
  if (error) return;
  try {
    const event = JSON.parse(value) as PermissionTelemetryEvent;
    if (event.kind === 'evaluation') {
      metrics.permission.counter('evaluations_total').add(event.count, {
        deployment: event.deployment,
        action_class: event.action_class,
        decision: event.decision,
        reason: event.reason,
      });
      return;
    }
    if (event.kind === 'quota_cache') {
      if (event.event === 'request') {
        metrics.quota.counter('cache_requests_total').add(event.count, {
          deployment: event.deployment,
          cache: event.cache,
          result: event.result,
        });
      } else if (event.event === 'db_load') {
        metrics.quota.counter('db_loads_total').add(event.count, {
          deployment: event.deployment,
          cache: event.cache,
          result: event.result,
        });
      } else {
        metrics.quota.counter('cache_invalidations_total').add(event.count, {
          deployment: event.deployment,
          cache: event.cache,
        });
      }
      metrics.quota.gauge('cache_entries').record(event.entries, {
        deployment: event.deployment,
        cache: event.cache,
      });
      metrics.quota.gauge('cache_entry_bytes').record(event.bytes, {
        deployment: event.deployment,
        cache: event.cache,
      });
      return;
    }
    if (event.kind === 'quota_guard') {
      metrics.quota.counter('guard_total').add(1, {
        domain: event.domain,
        operation: event.operation,
        result: event.result,
        reason: event.reason,
      });
      if (event.result === 'mismatch') {
        metrics.quota.counter('ledger_mismatch_total').add(1, {
          domain: event.domain,
          operation: event.operation,
          reason: event.reason,
        });
      }
      return;
    }
    if (event.kind === 'blob_access') {
      metrics.storage.counter('blob_access_total').add(1, {
        operation: event.operation,
        result: event.result,
        reason: event.reason,
      });
      return;
    }
    if (event.kind === 'blob_ref_cache') {
      metrics.storage.counter('blob_ref_cache_total').add(1, {
        event: event.event,
        result: event.result,
      });
      metrics.storage.gauge('blob_ref_cache_entries').record(event.entries);
      metrics.storage.gauge('blob_ref_cache_bytes').record(event.bytes);
      return;
    }
    if (event.kind === 'license_health') {
      metrics.license.counter('health_checks_total').add(1, {
        result: event.result,
      });
      metrics.license.counter('health_changes_total').add(event.changes, {
        result: event.result,
      });
      return;
    }
    metrics.license.counter('verification_total').add(1, {
      deployment: event.deployment,
      result: event.result,
      reason: event.reason,
    });
  } catch {
    // Telemetry must not affect authorization.
  }
}
