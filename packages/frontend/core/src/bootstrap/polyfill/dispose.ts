export async function polyfillDispose() {
  if (typeof Symbol.dispose !== 'symbol') {
    // @ts-expect-error ignore
    await import('core-js/modules/esnext.symbol.async-dispose');
    // @ts-expect-error ignore
    await import('core-js/modules/esnext.symbol.dispose');
  }
}
