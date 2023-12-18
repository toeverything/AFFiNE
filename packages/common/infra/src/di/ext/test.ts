import { serviceCollectionExt, serviceProviderExt } from './shared';

export const serviceProvider = serviceProviderExt(origin => {
  return class extends origin {
    resolveTest(): { hello: string } {
      return this.resolveRaw('test');
    }
  };
});

export const serviceCollection = serviceCollectionExt(origin => {
  return class extends origin {
    addTest() {
      this.add('test', { hello: 'world' });
    }
  };
});
