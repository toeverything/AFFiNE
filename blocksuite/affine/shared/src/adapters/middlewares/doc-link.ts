import type { TransformerMiddleware } from '@blocksuite/store';

const customDocLinkBaseUrlMiddleware = (
  baseUrl: string,
  collectionId: string
): TransformerMiddleware => {
  return ({ adapterConfigs }) => {
    const docLinkBaseUrl = baseUrl
      ? `${baseUrl}/workspace/${collectionId}`
      : '';
    adapterConfigs.set('docLinkBaseUrl', docLinkBaseUrl);
  };
};

export const docLinkBaseURLMiddlewareBuilder = (
  baseUrl: string,
  collectionId: string
) => {
  let middleware = customDocLinkBaseUrlMiddleware(baseUrl, collectionId);
  return {
    get: () => middleware,
    set: (url: string) => {
      middleware = customDocLinkBaseUrlMiddleware(url, collectionId);
    },
  };
};

const defaultDocLinkBaseURLMiddlewareBuilder = (collectionId: string) =>
  docLinkBaseURLMiddlewareBuilder(
    typeof window !== 'undefined' ? window.location.origin : '.',
    collectionId
  );

export const docLinkBaseURLMiddleware = (collectionId: string) =>
  defaultDocLinkBaseURLMiddlewareBuilder(collectionId).get();

export const setDocLinkBaseURLMiddleware = (collectionId: string) =>
  defaultDocLinkBaseURLMiddlewareBuilder(collectionId).set;

export const embedSyncedDocMiddleware =
  (type: 'content'): TransformerMiddleware =>
  ({ adapterConfigs }) => {
    adapterConfigs.set('embedSyncedDocExportType', type);
  };
