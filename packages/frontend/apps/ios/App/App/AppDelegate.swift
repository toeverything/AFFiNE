import Capacitor
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(_: UIApplication, didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    // Override point for customization after application launch.
    true
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
    if let root = window?.rootViewController {
      findAffineViewController(from: root)?.processShareInboxIfNeeded()
    }
  }

  private func findAffineViewController(from root: UIViewController) -> AFFiNEViewController? {
    if let affine = root as? AFFiNEViewController {
      return affine
    }
    if let navigation = root as? UINavigationController {
      for controller in navigation.viewControllers {
        if let found = findAffineViewController(from: controller) {
          return found
        }
      }
    }
    for child in root.children {
      if let found = findAffineViewController(from: child) {
        return found
      }
    }
    if let presented = root.presentedViewController {
      return findAffineViewController(from: presented)
    }
    return nil
  }

  func applicationWillTerminate(_: UIApplication) {
    // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
  }

  func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    // Called when the app was launched with a url. Feel free to add additional processing here,
    // but if you want the App API to support tracking app url opens, make sure to keep this call
    let handled = ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    let isShareInboxURL = url.scheme == "affine" && url.host == "share-inbox"
    if isShareInboxURL {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        guard let self, let root = self.window?.rootViewController else { return }
        self.findAffineViewController(from: root)?.processShareInboxIfNeeded()
      }
    }
    return handled || isShareInboxURL
  }

  func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    // Called when the app was launched with an activity, including Universal Links.
    // Feel free to add additional processing here, but if you want the App API to support
    // tracking app url opens, make sure to keep this call
    ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
  }
}
