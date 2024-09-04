import createCache from '@emotion/cache';

export default function createEmotionCache() {
  const emotionInsertionPoint = document.querySelector<HTMLMetaElement>(
    'meta[name="emotion-insertion-point"]'
  );
  const insertionPoint = emotionInsertionPoint ?? undefined;

  return createCache({ key: 'affine', insertionPoint });
}
