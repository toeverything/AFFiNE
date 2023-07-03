import { lazy } from 'react';

const Provider = lazy(() =>
  import('../../components/cloud/provider').then(({ Provider }) => ({
    default: Provider,
  }))
);

const unimplemented = () => {
  throw new Error('Cloud API Not implemented');
};

export const UI = {
  Provider,
  Header: unimplemented,
  PageDetail: unimplemented,
  PageList: unimplemented,
  SettingsDetail: unimplemented,
  NewSettingsDetail: unimplemented,
};
