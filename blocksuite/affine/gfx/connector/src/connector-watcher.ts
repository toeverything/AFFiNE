import {
  type SurfaceBlockModel,
  type SurfaceMiddleware,
  surfaceMiddlewareExtension,
} from '@blocksuite/affine-block-surface';
import type { ConnectorElementModel } from '@blocksuite/affine-model';
import type { GfxModel } from '@blocksuite/std/gfx';

import { ConnectorPathGenerator } from './connector-manager';
import {
  buildJumpOrder,
  updateConnectorJumps as calculateConnectorJumps,
} from './jump-calculator';

export const connectorWatcher: SurfaceMiddleware = (
  surface: SurfaceBlockModel
) => {
  const hasElementById = (id: string) =>
    surface.hasElementById(id) || surface.store.hasBlock(id);
  const elementGetter = (id: string) =>
    surface.getElementById(id) ?? (surface.store.getModelById(id) as GfxModel);
  const updateConnectorPath = (connector: ConnectorElementModel) => {
    if (connector.updatingPath) {
      return;
    }
    if (
      ((connector.source?.id && hasElementById(connector.source.id)) ||
        (!connector.source?.id && connector.source?.position)) &&
      ((connector.target?.id && hasElementById(connector.target.id)) ||
        (!connector.target?.id && connector.target?.position))
    ) {
      ConnectorPathGenerator.updatePath(connector, null, elementGetter);
    }
  };

  /**
   * Update jump points for connectors with jump styles enabled.
   * Calculates intersections between connectors and stores routed points.
   */
  const updateJumpsForConnectors = (connectors: Set<ConnectorElementModel>) => {
    const allConnectors = Array.from(
      surface.getElementsByType('connector')
    ) as ConnectorElementModel[];
    const { orderMap } = buildJumpOrder(allConnectors);

    connectors.forEach(connector => {
      if (
        connector.jumpStyle !== 'none' &&
        connector.absolutePath.length >= 2
      ) {
        // Calculate jump points based on intersections
        const routedPoints = calculateConnectorJumps(
          connector,
          allConnectors,
          orderMap
        );
        connector.routedPoints = routedPoints.length > 0 ? routedPoints : null;
      } else {
        // Clear jump points if jump style is disabled
        connector.routedPoints = null;
      }
    });
  };

  const pendingList = new Set<ConnectorElementModel>();
  let pendingFlag = false;
  let pendingJumpRefresh = false;

  const addToUpdateList = (connector: ConnectorElementModel) => {
    pendingList.add(connector);

    if (!pendingFlag) {
      pendingFlag = true;
      queueMicrotask(() => {
        // First update all connector paths
        pendingList.forEach(c => {
          updateConnectorPath(c);
        });

        // Then calculate jumps for connectors that need them
        updateJumpsForConnectors(pendingList);

        pendingList.clear();
        pendingFlag = false;
      });
    }
  };

  const disposables = [
    surface.elementAdded.subscribe(({ id }) => {
      const element = elementGetter(id);

      if (!element) return;

      if ('type' in element && element.type === 'connector') {
        addToUpdateList(element as ConnectorElementModel);
      } else {
        surface.getConnectors(id).forEach(c => addToUpdateList(c));
      }
    }),
    surface.elementUpdated.subscribe(({ id, props }) => {
      const element = elementGetter(id);

      if (props['xywh'] || props['rotate']) {
        surface.getConnectors(id).forEach(c => addToUpdateList(c));
      }

      if (
        'type' in element &&
        element.type === 'connector' &&
        (props['mode'] !== undefined ||
          props['target'] ||
          props['source'] ||
          props['waypoints'] !== undefined ||
          props['jumpStyle'] !== undefined)
      ) {
        addToUpdateList(element as ConnectorElementModel);
      }

      if (
        'type' in element &&
        element.type === 'connector' &&
        props['index'] !== undefined
      ) {
        surface
          .getElementsByType('connector')
          .forEach(connector =>
            addToUpdateList(connector as ConnectorElementModel)
          );
      }

      if (
        'type' in element &&
        element.type === 'connector' &&
        (props['xywh'] || props['path'])
      ) {
        const connector = element as ConnectorElementModel;
        // Avoid heavy jump recalculation during drag updates.
        if (!connector.updatingPath) {
          surface
            .getElementsByType('connector')
            .forEach(connectorItem =>
              addToUpdateList(connectorItem as ConnectorElementModel)
            );
        } else if (!pendingJumpRefresh) {
          pendingJumpRefresh = true;
          requestAnimationFrame(() => {
            pendingJumpRefresh = false;
            const allConnectors = surface.getElementsByType(
              'connector'
            ) as ConnectorElementModel[];
            updateJumpsForConnectors(new Set(allConnectors));
          });
        }
      }
    }),
    surface.store.slots.blockUpdated.subscribe(payload => {
      if (
        payload.type === 'add' ||
        (payload.type === 'update' && payload.props.key === 'xywh')
      ) {
        surface.getConnectors(payload.id).forEach(c => addToUpdateList(c));
      }
    }),
  ];

  const initialConnectors = surface.getElementsByType(
    'connector'
  ) as ConnectorElementModel[];
  initialConnectors.forEach(connector => updateConnectorPath(connector));
  updateJumpsForConnectors(new Set(initialConnectors));

  return () => {
    disposables.forEach(d => d.unsubscribe());
  };
};

export const connectorWatcherExtension = surfaceMiddlewareExtension(
  'connector-watcher',
  connectorWatcher
);
