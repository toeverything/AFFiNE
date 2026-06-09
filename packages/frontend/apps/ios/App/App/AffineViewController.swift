import Capacitor
import Intelligents
import UIKit
import WebKit

final class WebDiagnosticsCollector: NSObject, WKScriptMessageHandler {
  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard let sample = message.body as? String else { return }
    print("[AFFiNE-DIAG] \(sample)")
  }
}

class AFFiNEViewController: CAPBridgeViewController, UIScrollViewDelegate {
  var intelligentsButton: IntelligentsButton?
  private var isWebContentProcessTerminated = false

  // [AFFiNE-DIAG] retained strongly here; the userContentController also retains
  // it via add(_:name:), but it references neither the VC nor the webView, so
  // there is no retain cycle.
  private let webDiagnostics = WebDiagnosticsCollector()

  override func viewDidLoad() {
    super.viewDidLoad()
    webView?.allowsBackForwardNavigationGestures = false
    navigationController?.navigationBar.isHidden = true
    extendedLayoutIncludesOpaqueBars = false
    edgesForExtendedLayout = []

    // Disable WKWebView scrollView zoom/bounce to prevent conflict with edgeless canvas gestures
    webView?.scrollView.minimumZoomScale = 1.0
    webView?.scrollView.maximumZoomScale = 1.0
    webView?.scrollView.bouncesZoom = false
    webView?.scrollView.bounces = false
    webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
    webView?.scrollView.delegate = self

    // Inject viewport meta to prevent WKWebView smart zoom
    let viewportScript = """
      (function() {
        function setViewport() {
          var meta = document.querySelector('meta[name="viewport"]');
          if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            (document.head || document.documentElement).appendChild(meta);
          }
          meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        }
        if (document.head) {
          setViewport();
        } else {
          document.addEventListener('DOMContentLoaded', setViewport);
        }
      })();
    """
    webView?.configuration.userContentController.addUserScript(
      WKUserScript(source: viewportScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )

    let intelligentsButton = installIntelligentsButton()
    intelligentsButton.delegate = self
    self.intelligentsButton = intelligentsButton
    dismissIntelligentsButton()
  }

  override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
    let configuration = super.webViewConfiguration(for: instanceConfiguration)
    return configuration
  }

  override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
    // [AFFiNE-DIAG] NATIVE PROBE — fires synchronously while Capacitor builds the
    // web view, before any JavaScript runs and long before any crash. This is a
    // bisection test: if this line does NOT appear in the logs, the running build
    // does not contain this code (stale build / wrong target), and chasing the JS
    // injection is pointless. If it DOES appear but the JS samples below do not,
    // the problem is isolated to JS execution / message posting.
    print("[AFFiNE-DIAG] native: webView(with:configuration:) called — installing telemetry")
    // [AFFiNE-DIAG] Register the telemetry channel + sampler on the REAL
    // configuration here, BEFORE the web view is created. Doing this in
    // viewDidLoad via `webView.configuration` is a silent no-op: that property
    // returns a *copy*, so the handler/script never reach the live web view.
    configuration.userContentController.add(webDiagnostics, name: "affineDiag")
    let diagScript = """
      (function() {
        if (window.__affineDiagInstalled) return;
        window.__affineDiagInstalled = true;
        var post = function(s) {
          // Dual path: native message handler + console (Capacitor bridges
          // console to the Xcode log), so we get data even if one path fails.
          try { window.webkit.messageHandlers.affineDiag.postMessage(s); } catch (e) {}
          try { console.log('[AFFiNE-DIAG] ' + s); } catch (e) {}
        };
        post(JSON.stringify({ installed: true }));
        // The crash happens within a single 250ms gap from a flat, low state, so
        // the previous interval-only sampler missed the spike entirely. This
        // version measures the heavy DOM/canvas metrics EVERY FRAME and reports
        // the windowed MAXIMUM every 250ms, so a transient spike between posts
        // survives. We also capture the single largest canvas (to test the "one
        // giant transient allocation" theory), the zoom level (to correlate with
        // the ~0.5 repro), and JS heap when the engine exposes it.
        var maxRafGap = 0;
        var lastRaf = performance.now();
        // Windowed maxima, reset after every post.
        var wMaxCanvases = 0;   // peak <canvas> element count
        var wMaxMp = 0;         // peak SUM of all canvas megapixels
        var wMaxCanvasMp = 0;   // peak SINGLE canvas megapixels (largest backing store)
        var wMaxActive = 0;     // peak .block-active count
        var wMaxBlocks = 0;     // peak [data-block-id] count
        var wMaxHeap = 0;       // peak usedJSHeapSize (MB), if available
        var wMinZoom = null;    // smallest zoom seen (zoom-out is the trigger)
        var wMaxZoom = null;
        // Best-effort zoom read. The edgeless surface canvas carries a CSS
        // transform of scale(1/viewScale); the gfx viewport zoom is not on the
        // DOM, so we sniff a few known hooks and fall back to null. Wrapped in
        // try/catch so a missing hook can never break sampling.
        function readZoom() {
          try {
            var el = document.querySelector(
              'affine-edgeless-root, affine-edgeless-root-preview'
            );
            if (el) {
              var gfx = el.gfx || (el.service && el.service.gfx);
              if (gfx && gfx.viewport && typeof gfx.viewport.zoom === 'number') {
                return gfx.viewport.zoom;
              }
              if (el.service && el.service.viewport &&
                  typeof el.service.viewport.zoom === 'number') {
                return el.service.viewport.zoom;
              }
            }
          } catch (e) {}
          return null;
        }
        function sample() {
          var canvases = document.querySelectorAll('canvas');
          if (canvases.length > wMaxCanvases) wMaxCanvases = canvases.length;
          var megapixels = 0;
          for (var i = 0; i < canvases.length; i++) {
            var mp = (canvases[i].width * canvases[i].height) / 1e6;
            megapixels += mp;
            if (mp > wMaxCanvasMp) wMaxCanvasMp = mp;
          }
          if (megapixels > wMaxMp) wMaxMp = megapixels;
          var active = document.querySelectorAll('.block-active').length;
          if (active > wMaxActive) wMaxActive = active;
          var blocks = document.querySelectorAll('[data-block-id]').length;
          if (blocks > wMaxBlocks) wMaxBlocks = blocks;
          if (performance.memory && performance.memory.usedJSHeapSize) {
            var heap = performance.memory.usedJSHeapSize / 1048576;
            if (heap > wMaxHeap) wMaxHeap = heap;
          }
          var z = readZoom();
          if (z !== null) {
            if (wMinZoom === null || z < wMinZoom) wMinZoom = z;
            if (wMaxZoom === null || z > wMaxZoom) wMaxZoom = z;
          }
        }
        function rafLoop(now) {
          var gap = now - lastRaf;
          if (gap > maxRafGap) maxRafGap = gap;
          lastRaf = now;
          sample();
          requestAnimationFrame(rafLoop);
        }
        requestAnimationFrame(rafLoop);
        // Every 250ms, post the windowed maxima. setInterval drift is itself a
        // stall signal. All values are PEAKS within the window, not snapshots.
        var expected = performance.now() + 250;
        setInterval(function() {
          var now = performance.now();
          var drift = now - expected;
          expected = now + 250;
          // Make sure we have at least one fresh reading even if rAF is starved.
          sample();
          post(JSON.stringify({
            t: Math.round(now),
            rafGap: Math.round(maxRafGap),
            drift: Math.round(drift),
            canvases: wMaxCanvases,
            mp: Math.round(wMaxMp * 10) / 10,
            maxCanvasMp: Math.round(wMaxCanvasMp * 10) / 10,
            active: wMaxActive,
            blocks: wMaxBlocks,
            heapMB: Math.round(wMaxHeap),
            zMin: wMinZoom === null ? null : Math.round(wMinZoom * 100) / 100,
            zMax: wMaxZoom === null ? null : Math.round(wMaxZoom * 100) / 100
          }));
          maxRafGap = 0;
          wMaxCanvases = 0;
          wMaxMp = 0;
          wMaxCanvasMp = 0;
          wMaxActive = 0;
          wMaxBlocks = 0;
          wMaxHeap = 0;
          wMinZoom = null;
          wMaxZoom = null;
        }, 250);
      })();
    """
    configuration.userContentController.addUserScript(
      WKUserScript(source: diagScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
    )
    return super.webView(with: frame, configuration: configuration)
  }

  override func capacitorDidLoad() {
    let plugins: [CAPPlugin] = [
      AuthPlugin(),
      CookiePlugin(),
      HashcashPlugin(),
      NavigationGesturePlugin(),
      NbStorePlugin(),
      PayWallPlugin(associatedController: self),
      PreviewPlugin(),
    ]
    plugins.forEach { bridge?.registerPluginInstance($0) }
  }

  private var intelligentsButtonTimer: Timer?
  private var isCheckingIntelligentEligibility = false

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    IntelligentContext.shared.webView = webView
    navigationController?.setNavigationBarHidden(false, animated: animated)
    let timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
      self?.checkEligibilityOfIntelligent()
    }
    intelligentsButtonTimer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  private func checkEligibilityOfIntelligent() {
    guard !isCheckingIntelligentEligibility else { return }
    assert(intelligentsButton != nil)
    guard intelligentsButton?.isHidden ?? false else { return }
    isCheckingIntelligentEligibility = true
    IntelligentContext.shared.webView = webView
    IntelligentContext.shared.preparePresent { [self] result in
      DispatchQueue.main.async {
        defer { self.isCheckingIntelligentEligibility = false }
        switch result {
        case .failure: break
        case .success:
          self.presentIntelligentsButton()
        }
      }
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    intelligentsButtonTimer?.invalidate()
  }

  // MARK: - UIScrollViewDelegate

  func viewForZooming(in scrollView: UIScrollView) -> UIView? {
    return nil
  }

  func scrollViewDidZoom(_ scrollView: UIScrollView) {
    scrollView.zoomScale = 1.0
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    if scrollView.contentOffset != .zero {
      scrollView.contentOffset = .zero
    }
  }

  // MARK: - Web Content Process Crash Recovery

  // NOTE: Capacitor's CAPBridgeViewController owns the WKWebView
  // navigationDelegate (it assigns its own WebViewDelegationHandler), so this
  // override is NOT called in practice — Capacitor's handler logs
  // "⚡️ WebView process terminated" and reloads instead. Kept as defensive
  // fallback, matching the prior baseline behavior.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    isWebContentProcessTerminated = true
    webView.reload()
  }
}
