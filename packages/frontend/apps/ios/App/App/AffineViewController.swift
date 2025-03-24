import Capacitor
import Intelligents
import UIKit

class AFFiNEViewController: CAPBridgeViewController {
  var baseUrl: String? {
    didSet { Intelligents.setUpstreamEndpoint(baseUrl ?? "") }
  }
  var documentID: String?
  var workspaceID: String?
  var documentContent: String?

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
      IntelligentsPlugin(representController: self),
      NbStorePlugin(),
    ]
    plugins.forEach { bridge?.registerPluginInstance($0) }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    navigationController?.setNavigationBarHidden(false, animated: animated)
  }
}


