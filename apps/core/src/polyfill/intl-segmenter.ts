if (Intl.Segmenter === undefined) {
  await import('intl-segmenter-polyfill-rs').then(({ Segmenter }) => {
    Object.defineProperty(Intl, 'Segmenter', {
      value: Segmenter,
      configurable: true,
      writable: true,
    });
  });
}

export {};
