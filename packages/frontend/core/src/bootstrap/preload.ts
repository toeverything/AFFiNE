import { ResizeObserver } from '@juggle/resize-observer';
window.ResizeObserver = ResizeObserver;

import '@affine/env/constant';
import './edgeless-template';

import { setupGlobal } from '@affine/env/global';

setupGlobal();
