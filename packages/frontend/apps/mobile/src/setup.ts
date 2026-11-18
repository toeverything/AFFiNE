import '@affine/core/bootstrap/browser';
import '@affine/core/bootstrap/cleanup';
import '@affine/component/theme';
import '@affine/core/mobile/styles/mobile.css';

import { registerServiceWorkerWithUpdateNotice } from './service-worker-update-notice';

registerServiceWorkerWithUpdateNotice();
