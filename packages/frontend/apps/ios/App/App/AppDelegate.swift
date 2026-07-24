import Capacitor
import Network
import UIKit

private final class LocalNetworkAccess: NSObject, NetServiceDelegate {
  static let shared = LocalNetworkAccess()

  private var browser: NWBrowser?
  private var service: NetService?
  private var hasStarted = false

  func preflight() {
    guard !hasStarted else { return }
    hasStarted = true

    let parameters = NWParameters()
    parameters.includePeerToPeer = true

    let browser = NWBrowser(for: .bonjour(type: "_http._tcp", domain: "local."), using: parameters)
    browser.stateUpdateHandler = { state in
      if case let .failed(error) = state {
        NSLog("[AFFiNE] Local network preflight browser failed: \(error)")
      }
    }
    browser.start(queue: .main)
    self.browser = browser

    let service = NetService(
      domain: "local.",
      type: "_affine-local-network._tcp.",
      name: "AFFiNE Local Network Preflight",
      port: 9
    )
    service.delegate = self
    service.publish(options: .listenForConnections)
    self.service = service
  }

  func netService(_ sender: NetService, didNotPublish errorDict: [String: NSNumber]) {
    NSLog("[AFFiNE] Local network preflight service failed: \(errorDict)")
  }
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(_: UIApplication, didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    LocalNetworkAccess.shared.preflight()
    return true
  }

  func applicationWillResignActive(_: UIApplication) {
    // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
    // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
  }

  func applicationDidEnterBackground(_: UIApplication) {
    // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
    // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
  }

  func applicationWillEnterForeground(_: UIApplication) {
    // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
  }

  func applicationDidBecomeActive(_: UIApplication) {
    // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
  }

  func applicationWillTerminate(_: UIApplication) {
    // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
  }

  func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    // Called when the app was launched with a url. Feel free to add additional processing here,
    // but if you want the App API to support tracking app url opens, make sure to keep this call
    ApplicationDelegateProxy.shared.application(app, open: url, options: options)
  }

  func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    // Called when the app was launched with an activity, including Universal Links.
    // Feel free to add additional processing here, but if you want the App API to support
    // tracking app url opens, make sure to keep this call
    ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
  }
}
