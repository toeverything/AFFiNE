import { ServerService } from '@affine/core/modules/cloud';
import { AdapterPanel } from '@blocksuite/affine/fragments/adapter-panel';
import {
  customImageProxyMiddleware,
  docLinkBaseURLMiddlewareBuilder,
  embedSyncedDocMiddleware,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import type { EditorHost } from '@blocksuite/affine/std';
import type { TransformerMiddleware } from '@blocksuite/affine/store';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useRef } from 'react';

import * as styles from './adapter.css';

const createImageProxyUrl = (baseUrl: string) => {
  try {
    return new URL(BUILD_CONFIG.imageProxyUrl, baseUrl).toString();
  } catch (error) {
    console.error('Failed to create image proxy url', error);
    return '';
  }
};

const createMiddlewares = (
  host: EditorHost,
  baseUrl: string
): TransformerMiddleware[] => {
  const imageProxyUrl = createImageProxyUrl(baseUrl);

  return [
    docLinkBaseURLMiddlewareBuilder(baseUrl, host.store.workspace.id).get(),
    titleMiddleware(host.store.workspace.meta.docMetas),
    embedSyncedDocMiddleware('content'),
    customImageProxyMiddleware(imageProxyUrl),
  ];
};

const getTransformerMiddlewares = (
  host: EditorHost | null,
  baseUrl: string
) => {
  if (!host) return [];
  return createMiddlewares(host, baseUrl);
};

// A wrapper for AdapterPanel
export const EditorAdapterPanel = ({ host }: { host: EditorHost | null }) => {
  const server = useService(ServerService).server;
  const adapterPanelRef = useRef<AdapterPanel | null>(null);

  const onRefChange = useCallback(
    (container: HTMLDivElement | null) => {
      if (container && host && container.children.length === 0) {
        adapterPanelRef.current = new AdapterPanel();
        adapterPanelRef.current.store = host.store;
        adapterPanelRef.current.transformerMiddlewares =
          getTransformerMiddlewares(host, server.baseUrl);
        container.append(adapterPanelRef.current);
      }
    },
    [host, server]
  );

  useEffect(() => {
    if (host && adapterPanelRef.current) {
      adapterPanelRef.current.store = host.store;
      adapterPanelRef.current.transformerMiddlewares =
        getTransformerMiddlewares(host, server.baseUrl);
    }
  }, [host, server]);

  return <div className={styles.root} ref={onRefChange} />;
};
