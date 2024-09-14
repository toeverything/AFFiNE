export async function polyfillPromise() {
  if (typeof Promise.withResolvers !== 'function') {
    // @ts-expect-error ignore
    await import('core-js/features/promise/with-resolvers');
  }
}
