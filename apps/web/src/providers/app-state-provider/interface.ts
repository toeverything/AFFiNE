export type AppStateValue = {
  blobDataSynced: boolean;
};

/**
 * @deprecated
 */
export type AppStateFunction = {
  // todo: remove this in the future
};

export type AppStateContext = AppStateValue & AppStateFunction;
