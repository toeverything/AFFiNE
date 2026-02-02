import {
  type SurfaceBlockModel,
  type SurfaceMiddleware,
  surfaceMiddlewareExtension,
} from '@blocksuite/affine-block-surface';
import type { ConnectorElementModel } from '@blocksuite/affine-model';
import type { GfxModel } from '@blocksuite/std/gfx';

import { ConnectorPathGenerator } from './connector-manager';
import { updateConnectorJumps as calculateConnectorJumps } from './jump-calculator';

export const connectorWatcher: SurfaceMiddleware = (
  surface: SurfaceBlockModel
) => {
  const hasElementById = (id: string) =>
    surface.hasElementById(id) || surface.store.hasBlock(id);
  const elementGetter = (id: string) =>
    surface.getElementById(id) ?? (surface.store.getModelById(id) as GfxModel);
  const updateConnectorPath = (
    connector: ConnectorElementModel,
    clearWaypoints = false
  ) => {
    if (
      ((connector.source?.id && hasElementById(connector.source.id)) ||
        (!connector.source?.id && connector.source?.position)) &&
      ((connector.target?.id && hasElementById(connector.target.id)) ||
        (!connector.target?.id && connector.target?.position))
    ) {
      // Clear waypoints if a connected shape moved
      // Waypoints are in absolute coordinates and don't move with shapes
      if (clearWaypoints && connector.waypoints) {
        connector.waypoints = undefined;
      }
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

    connectors.forEach(connector => {
      if (
        connector.jumpStyle !== 'none' &&
        connector.absolutePath.length >= 2
      ) {
        // Calculate jump points based on intersections
        const routedPoints = calculateConnectorJumps(connector, allConnectors);
        connector.routedPoints = routedPoints.length > 0 ? routedPoints : null;
      } else {
        // Clear jump points if jump style is disabled
        connector.routedPoints = null;
      }
    });
  };

  // Track connectors that need waypoints cleared (due to shape movement)
  const pendingList = new Set<ConnectorElementModel>();
  const pendingClearWaypoints = new Set<ConnectorElementModel>();
  let pendingFlag = false;

  const addToUpdateList = (
    connector: ConnectorElementModel,
    clearWaypoints = false
  ) => {
    pendingList.add(connector);
    if (clearWaypoints) {
      pendingClearWaypoints.add(connector);
    }

    if (!pendingFlag) {
      pendingFlag = true;
      queueMicrotask(() => {
        // First update all connector paths
        pendingList.forEach(c => {
          const shouldClearWaypoints = pendingClearWaypoints.has(c);
          updateConnectorPath(c, shouldClearWaypoints);
        });

        // Then calculate jumps for connectors that need them
        updateJumpsForConnectors(pendingList);

        pendingList.clear();
        pendingClearWaypoints.clear();
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
        // Shape moved - clear waypoints so connector path regenerates cleanly
        surface
          .getConnectors(id)
          .forEach(c => addToUpdateList(c, true /* clearWaypoints */));
      }

      if (
        'type' in element &&
        element.type === 'connector' &&
        (props['mode'] !== undefined || props['target'] || props['source'])
      ) {
        addToUpdateList(element as ConnectorElementModel);
      }
    }),
    surface.store.slots.blockUpdated.subscribe(payload => {
      if (
        payload.type === 'add' ||
        (payload.type === 'update' && payload.props.key === 'xywh')
      ) {
        // Shape moved - clear waypoints so connector path regenerates cleanly
        surface
          .getConnectors(payload.id)
          .forEach(c => addToUpdateList(c, true /* clearWaypoints */));
      }
    }),
  ];

  surface
    .getElementsByType('connector')
    .forEach(connector =>
      updateConnectorPath(connector as ConnectorElementModel)
    );

  return () => {
    disposables.forEach(d => d.unsubscribe());
  };
};

export const connectorWatcherExtension = surfaceMiddlewareExtension(
  'connector-watcher',
  connectorWatcher
);
