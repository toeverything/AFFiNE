import Capacitor
import Intelligents
import UIKit
import WebKit

class AFFiNEViewController: CAPBridgeViewController, UIScrollViewDelegate, AffineThemeConfigurable {
  var intelligentsButton: IntelligentsButton?
  var appThemeUserInterfaceStyle: UIUserInterfaceStyle = .unspecified {
    didSet {
      overrideUserInterfaceStyle = appThemeUserInterfaceStyle
    }
  }

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

  override func didReceiveMemoryWarning() {
    super.didReceiveMemoryWarning()
    webView?.evaluateJavaScript("window.dispatchEvent(new Event('affine:memory-pressure'))")
  }

  override func capacitorDidLoad() {
    let plugins: [CAPPlugin] = [
      AffineThemePlugin(associatedController: self),
      AuthPlugin(),
      CookiePlugin(),
      HashcashPlugin(),
      ImagePickerPlugin(associatedController: self),
      NavigationGesturePlugin(),
      NbStorePlugin(),
      PayWallPlugin(associatedController: self),
      PreviewPlugin(),
      ShareInboxPlugin(),
    ]
    plugins.forEach { bridge?.registerPluginInstance($0) }
  }

  private static let intelligentsButtonRefreshInterval: TimeInterval = 0.5

  private var intelligentsButtonTimer: Timer?
  private var isCheckingIntelligentEligibility = false

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    IntelligentContext.shared.webView = webView
    navigationController?.setNavigationBarHidden(false, animated: animated)
    checkEligibilityOfIntelligent()
    let timer = Timer.scheduledTimer(withTimeInterval: Self.intelligentsButtonRefreshInterval, repeats: true) { [weak self] _ in
      self?.checkEligibilityOfIntelligent()
    }
    intelligentsButtonTimer = timer
    RunLoop.main.add(timer, forMode: .common)
    processShareInboxIfNeeded()
  }

  func processShareInboxIfNeeded() {
    guard let webView, !ShareInboxStore.shared.pendingItems().isEmpty else { return }
    webView.evaluateJavaScript(
      "window.dispatchEvent(new Event('affine:share-inbox'))"
    )
  }

  private func checkEligibilityOfIntelligent() {
    guard !isCheckingIntelligentEligibility else { return }
    assert(intelligentsButton != nil)
    guard let webView else {
      if intelligentsButton?.isHidden == false {
        dismissIntelligentsButton()
      }
      return
    }

    isCheckingIntelligentEligibility = true
    Task { @MainActor [weak self, webView] in
      guard let self else { return }

      guard await PaywallAuthGuard.currentUserIdentifier(in: webView) != nil else {
        if self.intelligentsButton?.isHidden == false {
          self.dismissIntelligentsButton()
        }
        self.isCheckingIntelligentEligibility = false
        return
      }

      guard self.intelligentsButton?.isHidden ?? false else {
        self.isCheckingIntelligentEligibility = false
        return
      }

      IntelligentContext.shared.webView = webView
      IntelligentContext.shared.preparePresent(createSession: false) { [weak self] result in
        DispatchQueue.main.async {
          guard let self else { return }
          defer { self.isCheckingIntelligentEligibility = false }
          switch result {
          case .failure: break
          case .success:
            self.presentIntelligentsButton()
          }
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

  // MARK: - Web Content Process Crash Recovery

  // NOTE: Capacitor's CAPBridgeViewController owns the WKWebView
  // navigationDelegate (it assigns its own WebViewDelegationHandler), so this
  // override is NOT called in practice — Capacitor's handler logs
  // "⚡️ WebView process terminated" and reloads instead. Kept as defensive
  // fallback, matching the prior baseline behavior.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    webView.reload()
  }
}
