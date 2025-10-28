import Capacitor
import Intelligents
import UIKit

class AFFiNEViewController: CAPBridgeViewController {
  var intelligentsButton: IntelligentsButton?

  override func viewDidLoad() {
    super.viewDidLoad()
    webView?.allowsBackForwardNavigationGestures = true
    navigationController?.navigationBar.isHidden = true
    extendedLayoutIncludesOpaqueBars = false
    edgesForExtendedLayout = []
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
    super.webView(with: frame, configuration: configuration)
  }

  override func capacitorDidLoad() {
    let plugins: [CAPPlugin] = [
      AuthPlugin(),
      CookiePlugin(),
      HashcashPlugin(),
      NavigationGesturePlugin(),
      NbStorePlugin(),
      PayWallPlugin(associatedController: self),
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
    guard intelligentsButton?.isHidden ?? false else { return } // already eligible
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
}
