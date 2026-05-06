import { Injectable } from '@nestjs/common';

import { metrics } from '../../../base';
import type { ResolvedCopilotProvider } from '../providers/factory';
import type { CopilotProviderType } from '../providers/types';
import type { ExecutionRequestKind } from './execution-plan';

type ExecutionDispatchPath = 'prepared_routes';

export function summarizePreparedRoutes(
  routes: Array<Pick<ResolvedCopilotProvider, 'prepared'>>
) {
  const preparedCount = routes.filter(route => !!route.prepared).length;
  return {
    routeCount: routes.length,
    preparedCount,
    preparedMode:
      preparedCount === 0
        ? 'none'
        : preparedCount === routes.length
          ? 'all'
          : 'partial',
  } as const;
}

function planAttrs(
  kind: ExecutionRequestKind,
  prefer?: CopilotProviderType,
  routes?: ResolvedCopilotProvider[]
) {
  const summary = summarizePreparedRoutes(routes ?? []);
  return {
    kind,
    prefer: prefer ?? 'auto',
    prepared: summary.preparedMode,
    route_count: summary.routeCount,
  };
}

@Injectable()
export class CopilotExecutionMetrics {
  recordPlan(
    kind: ExecutionRequestKind,
    routes: ResolvedCopilotProvider[],
    prefer?: CopilotProviderType
  ) {
    const attrs = planAttrs(kind, prefer, routes);
    metrics.ai.counter('execution_plan_total').add(1, attrs);
    metrics.ai.histogram('execution_plan_routes').record(attrs.route_count, {
      kind: attrs.kind,
      prefer: attrs.prefer,
      prepared: attrs.prepared,
    });
  }

  recordDispatch(
    kind: ExecutionRequestKind,
    path: ExecutionDispatchPath,
    routeCount: number
  ) {
    const attrs = { kind, path };
    metrics.ai.counter('execution_dispatch_total').add(1, attrs);
    metrics.ai.histogram('execution_dispatch_routes').record(routeCount, attrs);
  }
}
