import Capacitor
import Intelligents
import OSLog
import UIKit
import WebKit

private let affineLog = Logger(subsystem: "app.affine.pro", category: "debug")

class AFFiNEViewController: CAPBridgeViewController, UIScrollViewDelegate, WKScriptMessageHandler {
  var intelligentsButton: IntelligentsButton?
  private var isWebContentProcessTerminated = false
  private var consoleBridgeInstalled = false

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
    if #available(iOS 16.4, *) {
      webView?.isInspectable = true
    }

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

  private func installConsoleBridge() {
    guard !consoleBridgeInstalled, let webView else {
      print("[affine-native] console-bridge skipped (webView unavailable)")
      return
    }
    let controller = webView.configuration.userContentController
    consoleBridgeInstalled = true
    controller.add(self, name: "affineConsole")
    let consoleBridgeScript = """
      (function() {
        if (window.__affineNativeConsoleBridged) return;
        window.__affineNativeConsoleBridged = true;
        function bridge(level, args) {
          try {
            var msg = Array.prototype.map.call(args, function(a) {
              if (typeof a === 'string') return a;
              try { return JSON.stringify(a); } catch (e) { return String(a); }
            }).join(' ');
            window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.affineConsole
              && window.webkit.messageHandlers.affineConsole.postMessage({ level: level, message: msg });
          } catch (e) {}
        }
        var ow = console.warn.bind(console);
        var oe = console.error.bind(console);
        var oi = console.info.bind(console);
        console.warn = function() { bridge('warn', arguments); return ow.apply(console, arguments); };
        console.error = function() { bridge('error', arguments); return oe.apply(console, arguments); };
        console.info = function() {
          var first = arguments.length ? String(arguments[0]) : '';
          if (first.indexOf('[viewport-lifecycle]') === 0 || first.indexOf('[affine-heartbeat]') === 0) {
            bridge('info', arguments);
          }
          return oi.apply(console, arguments);
        };
        bridge('info', ['[viewport-lifecycle] console-bridge live']);
      })();
    """
    controller.addUserScript(
      WKUserScript(source: consoleBridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )
    // capacitorDidLoad runs after first navigation may have started — inject live too.
    webView.evaluateJavaScript(consoleBridgeScript, completionHandler: nil)
    print("[affine-native] console-bridge installed")
  }

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard message.name == "affineConsole" else { return }
    let body = message.body as? [String: Any]
    let level = body?["level"] as? String ?? "log"
    let text = body?["message"] as? String ?? String(describing: message.body)
    affineLog.warning("affine-js-\(level, privacy: .public) \(text, privacy: .public)")
    print("[affine-js-\(level)] \(text)")
  }

  override func capacitorDidLoad() {
    let plugins: [CAPPlugin] = [
      AuthPlugin(),
      CookiePlugin(),
      HashcashPlugin(),
      NavigationGesturePlugin(),
      NbStorePlugin(),
      PayWallPlugin(associatedController: self),
      PencilInputPlugin(),
      PreviewPlugin(),
    ]
    plugins.forEach { bridge?.registerPluginInstance($0) }
    // WebView is guaranteed here; viewDidLoad is often too early for Cap.
    installConsoleBridge()
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
    NSLog("[affine-webview] WebContent process terminated — reloading")
    webView.reload()
  }
}
