import { isWindow } from '@affine/env/constant';
import createCache from '@emotion/cache';

export default function createEmotionCache() {
  let insertionPoint;

  if (isWindow) {
    const emotionInsertionPoint = document.querySelector<HTMLMetaElement>(
      'meta[name="emotion-insertion-point"]'
    );
    insertionPoint = emotionInsertionPoint ?? undefined;
  }

  return createCache({ key: 'affine', insertionPoint });
}
