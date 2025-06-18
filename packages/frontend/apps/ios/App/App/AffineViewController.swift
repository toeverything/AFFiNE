import Capacitor
import Intelligents
import UIKit

class AFFiNEViewController: CAPBridgeViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    webView?.allowsBackForwardNavigationGestures = true
    navigationController?.navigationBar.isHidden = true
    extendedLayoutIncludesOpaqueBars = false
    edgesForExtendedLayout = []
    let intelligentsButton = installIntelligentsButton()
    intelligentsButton.delegate = self
    dismissIntelligentsButton()
  }
  
  override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
    let configuration = super.webViewConfiguration(for: instanceConfiguration)
    return configuration
  }
  
  override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
    return super.webView(with: frame, configuration: configuration)
}

  override func capacitorDidLoad() {
    let plugins: [CAPPlugin] = [
      AuthPlugin(),
      CookiePlugin(),
      HashcashPlugin(),
      NavigationGesturePlugin(),
      // IntelligentsPlugin(representController: self), // no longer put in use
      NbStorePlugin(),
    ]
    plugins.forEach { bridge?.registerPluginInstance($0) }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    navigationController?.setNavigationBarHidden(false, animated: animated)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
      self.presentIntelligentsButton()
    }
  }
}



