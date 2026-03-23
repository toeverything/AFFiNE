import type {
  ConnectorElementModel,
  SurfaceElementModelMap,
} from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { SurfaceBlockProps } from '@blocksuite/std/gfx';
import { SurfaceBlockModel as BaseSurfaceModel } from '@blocksuite/std/gfx';
import { BlockSchemaExtension, defineBlockSchema } from '@blocksuite/store';
import * as Y from 'yjs';

import { elementsCtorMap } from './element-model/index.js';
import { surfaceMiddlewareIdentifier } from './extensions/surface-middleware.js';
import { SurfaceBlockTransformer } from './surface-transformer.js';

export const SurfaceBlockSchema = defineBlockSchema({
  flavour: 'affine:surface',
  props: (internalPrimitives): SurfaceBlockProps => ({
    elements: internalPrimitives.Boxed(new Y.Map()),
  }),
  metadata: {
    version: 5,
    role: 'hub',
    parent: ['@root'],
    children: [
      'affine:frame',
      'affine:image',
      'affine:bookmark',
      'affine:attachment',
      'affine:embed-*',
      'affine:edgeless-text',
    ],
  },
  transformer: transformerConfigs =>
    new SurfaceBlockTransformer(transformerConfigs),
  toModel: () => new SurfaceBlockModel(),
});

export const SurfaceBlockSchemaExtension =
  BlockSchemaExtension(SurfaceBlockSchema);

export class SurfaceBlockModel extends BaseSurfaceModel {
  private readonly _disposables: DisposableGroup = new DisposableGroup();
  private readonly _connectorIdsByEndpoint = new Map<string, Set<string>>();
  private readonly _connectorIndexDisposables = new DisposableGroup();
  private readonly _connectorEndpoints = new Map<
    string,
    { sourceId: string | null; targetId: string | null }
  >();

  private _addConnectorEndpoint(endpointId: string, connectorId: string) {
    const connectorIds = this._connectorIdsByEndpoint.get(endpointId);

    if (connectorIds) {
      connectorIds.add(connectorId);
      return;
    }

    this._connectorIdsByEndpoint.set(endpointId, new Set([connectorId]));
  }

  private _isConnectorModel(model: unknown): model is ConnectorElementModel {
    return (
      !!model &&
      typeof model === 'object' &&
      'type' in model &&
      (model as { type?: string }).type === 'connector'
    );
  }

  private _removeConnectorEndpoint(endpointId: string, connectorId: string) {
    const connectorIds = this._connectorIdsByEndpoint.get(endpointId);

    if (!connectorIds) {
      return;
    }

    connectorIds.delete(connectorId);

    if (connectorIds.size === 0) {
      this._connectorIdsByEndpoint.delete(endpointId);
    }
  }

  private _removeConnectorFromIndex(connectorId: string) {
    const endpoints = this._connectorEndpoints.get(connectorId);

    if (!endpoints) {
      return;
    }

    if (endpoints.sourceId) {
      this._removeConnectorEndpoint(endpoints.sourceId, connectorId);
    }

    if (endpoints.targetId) {
      this._removeConnectorEndpoint(endpoints.targetId, connectorId);
    }

    this._connectorEndpoints.delete(connectorId);
  }

  private _rebuildConnectorIndex() {
    this._connectorIdsByEndpoint.clear();
    this._connectorEndpoints.clear();

    this.getElementsByType('connector').forEach(connector => {
      this._setConnectorEndpoints(connector as ConnectorElementModel);
    });
  }

  private _setConnectorEndpoints(connector: ConnectorElementModel) {
    const sourceId = connector.source?.id ?? null;
    const targetId = connector.target?.id ?? null;
    const previousEndpoints = this._connectorEndpoints.get(connector.id);

    if (
      previousEndpoints?.sourceId === sourceId &&
      previousEndpoints?.targetId === targetId
    ) {
      return;
    }

    if (previousEndpoints?.sourceId) {
      this._removeConnectorEndpoint(previousEndpoints.sourceId, connector.id);
    }

    if (previousEndpoints?.targetId) {
      this._removeConnectorEndpoint(previousEndpoints.targetId, connector.id);
    }

    if (sourceId) {
      this._addConnectorEndpoint(sourceId, connector.id);
    }

    if (targetId) {
      this._addConnectorEndpoint(targetId, connector.id);
    }

    this._connectorEndpoints.set(connector.id, {
      sourceId,
      targetId,
    });
  }

  override _init() {
    this._extendElement(elementsCtorMap);
    super._init();
    this._rebuildConnectorIndex();
    this._connectorIndexDisposables.add(
      this.elementAdded.subscribe(({ id }) => {
        const model = this.getElementById(id);

        if (this._isConnectorModel(model)) {
          this._setConnectorEndpoints(model);
        }
      })
    );
    this._connectorIndexDisposables.add(
      this.elementUpdated.subscribe(({ id, props }) => {
        if (!props['source'] && !props['target']) {
          return;
        }

        const model = this.getElementById(id);

        if (this._isConnectorModel(model)) {
          this._setConnectorEndpoints(model);
        }
      })
    );
    this._connectorIndexDisposables.add(
      this.elementRemoved.subscribe(({ id, type }) => {
        if (type === 'connector') {
          this._removeConnectorFromIndex(id);
        }
      })
    );
    this.deleted.subscribe(() => {
      this._connectorIndexDisposables.dispose();
      this._connectorIdsByEndpoint.clear();
      this._connectorEndpoints.clear();
    });
    this.store.provider
      .getAll(surfaceMiddlewareIdentifier)
      .forEach(({ middleware }) => {
        this._disposables.add(middleware(this));
      });
  }

  getConnectors(id: string) {
    const connectorIds = this._connectorIdsByEndpoint.get(id);

    if (!connectorIds?.size) {
      return [];
    }

    const staleConnectorIds: string[] = [];
    const connectors: ConnectorElementModel[] = [];

    connectorIds.forEach(connectorId => {
      const model = this.getElementById(connectorId);

      if (!this._isConnectorModel(model)) {
        staleConnectorIds.push(connectorId);
        return;
      }

      connectors.push(model);
    });

    staleConnectorIds.forEach(connectorId => {
      this._removeConnectorFromIndex(connectorId);
    });

    return connectors;
  }

  override getElementsByType<K extends keyof SurfaceElementModelMap>(
    type: K
  ): SurfaceElementModelMap[K][] {
    return super.getElementsByType(type) as SurfaceElementModelMap[K][];
  }
}
