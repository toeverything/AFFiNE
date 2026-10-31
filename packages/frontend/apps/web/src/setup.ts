import '@affine/core/bootstrap/browser';
import '@affine/core/bootstrap/cleanup';
import '@affine/component/theme';

import { registerServiceWorkerWithUpdateNotice } from './service-worker-update-notice';

registerServiceWorkerWithUpdateNotice();
