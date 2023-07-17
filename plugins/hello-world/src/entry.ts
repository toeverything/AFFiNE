import type { Entry } from '@toeverything/plugin-infra/core';

const entry: Entry = context => {
  console.log('registering hello-world plugin');
  console.log('affine', context);

  return () => {
    console.log('unregistering hello-world plugin');
  };
};

export default entry;
