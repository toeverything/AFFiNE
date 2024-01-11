import 'reflect-metadata';
import './affine.env';
import './affine';
import './affine.config';

if (process.env.NODE_ENV === 'development') {
  console.log('AFFiNE Config:', globalThis.AFFiNE);
}
