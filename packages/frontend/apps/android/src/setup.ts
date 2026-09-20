import '@affine/core/bootstrap/browser';
import '@affine/component/theme';
import '@affine/core/mobile/styles/mobile.css';
import './proxy';

import { viewportRuntimeConfig } from '@blocksuite/affine/std/gfx';

// Android WebView is less prone to the iOS WKWebView process kill, so keep the
// user-facing zoom range unchanged. These knobs only reduce gesture-time work
// and low-zoom canvas memory while preserving the normal-zoom render quality.
viewportRuntimeConfig.VIEWPORT_REFRESH_PIXEL_THRESHOLD = 60;
viewportRuntimeConfig.VIEWPORT_REFRESH_MAX_INTERVAL = 300;
viewportRuntimeConfig.SKIP_REFRESH_DURING_GESTURE = true;
viewportRuntimeConfig.OVERSCAN_RATIO = 0.2;
viewportRuntimeConfig.OVERSCAN_RATIO_BLOCK = 0;
// Keep this aligned with iOS: the ~200ms gesture debounce plus this delay gives
// elements/connectors enough time to settle while still reappearing within ~500ms.
viewportRuntimeConfig.POST_GESTURE_REFRESH_DELAY = 220;
viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [
  [0.5, 1],
  [0.8, 2],
];
