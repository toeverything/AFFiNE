(function () {
  var errorEl = null;
  function showGlobalErrorPage() {
    if (errorEl) {
      return;
    }

    errorEl = document.createElement('div');
    errorEl.innerHTML = [
      '<style>',
      '.gue {display:flex;flex-direction:column;align-items:center;justify-content:center;width:380px;}',
      '.gue img{width:380px;}',
      '.gue div{padding:16px 40px 0 40px;text-align:center;}',
      '.gue .p1{color:#141414;line-height:24px;font-weight:500;}',
      '.gue .p2{color:#7A7A7A;line-height:22px;}',
      '</style>',
      '<div class="gue">',
      '<img src="https://cdn.affine.pro/error.png" />',
      '<div>',
      '<p class="p1">Unsupported Environment</p>',
      '<p class="p2">',
      'It looks like AFFiNE cannot run in this environment.',
      "Please ensure you are using a supported browser or update your device's operating system to the latest version.",
      'If the issue persists, visit our <a href="https://github.com/toeverything/AFFiNE/issues">support page</a> for further assistance.',
      '</p>',
      '</div>',
      '</div>',
    ].join('');
    errorEl.setAttribute(
      'style',
      'position:absolute;top:0;left:0;height:100vh;width:100vw;display:flex;flex-direction:column;align-items:center;justify-content:center;background:white;z-index:999;'
    );
    document.body.append(errorEl);
  }

  /**
   * @param event {PromiseRejectionEvent|ErrorEvent}
   */
  function handler(event) {
    var error;

    if ('error' in event) {
      error =
        event.error ||
        (event.message === 'Script error.'
          ? new SyntaxError(event.message)
          : new Error(event.message));
    } else {
      error = event.reason;
    }

    console.error('unhandled unrecoverable error', error);

    var shouldCache =
      // syntax error
      error && error instanceof SyntaxError;

    if (!shouldCache) {
      return;
    }

    event.stopImmediatePropagation();
    showGlobalErrorPage();
  }

  function registerGlobalErrorHandler() {
    if (typeof document !== 'undefined') {
      globalThis.addEventListener('unhandledrejection', handler);
      globalThis.addEventListener('error', handler);

      return function () {
        globalThis.removeEventListener('unhandledrejection', handler);
        globalThis.removeEventListener('error', handler);
      };
    }

    return null;
  }

  function unregisterRegisterGlobalErrorHandler(fn) {
    if (typeof fn === 'function') {
      var app = document.getElementById('app');
      if (app) {
        var ob = new MutationObserver(function () {
          fn();
          ob.disconnect();
          ob = null;
        });

        ob.observe(app, { childList: true });
      }
    }
  }

  function ensureBasicEnvironment() {
    var globals = [
      'Promise',
      'Map',
      'fetch',
      'customElements',
      'MutationObserver',
    ];

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (var i = 0; i < globals.length; i++) {
      if (!(globals[i] in globalThis)) {
        showGlobalErrorPage();
        return;
      }
    }
  }

  ensureBasicEnvironment();
  var goodtogo = registerGlobalErrorHandler();
  unregisterRegisterGlobalErrorHandler(goodtogo);
})();
