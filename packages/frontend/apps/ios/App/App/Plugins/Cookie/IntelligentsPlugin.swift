import Capacitor
import Foundation

//@objc(IntelligentsPlugin)
//public class IntelligentsPlugin: CAPPlugin, CAPBridgedPlugin {
//  public let identifier = "IntelligentsPlugin"
//  public let jsName = "Intelligents"
//  public let pluginMethods: [CAPPluginMethod] = [
//    CAPPluginMethod(name: "presentIntelligentsButton", returnType: CAPPluginReturnPromise),
//    CAPPluginMethod(name: "dismissIntelligentsButton", returnType: CAPPluginReturnPromise),
//  ]
//  public private(set) weak var representController: UIViewController?
//
//  init(representController: UIViewController) {
//    self.representController = representController
//    super.init()
//  }
//
//  deinit {
//    representController = nil
//  }
//
//  @objc public func presentIntelligentsButton(_ call: CAPPluginCall) {
//    DispatchQueue.main.async {
//      self.representController?.presentIntelligentsButton()
//      call.resolve()
//    }
//  }
//
//  @objc public func dismissIntelligentsButton(_ call: CAPPluginCall) {
//    DispatchQueue.main.async {
//      self.representController?.dismissIntelligentsButton()
//      call.resolve()
//    }
//  }
//}
