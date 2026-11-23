import Capacitor
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo _: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    for activity in connectionOptions.userActivities {
      self.scene(scene, continue: activity)
    }
  }

  func sceneDidBecomeActive(_: UIScene) {
    processShareInbox()
  }

  func scene(_: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      options[.sourceApplication] = context.options.sourceApplication
      options[.annotation] = context.options.annotation
      _ = ApplicationDelegateProxy.shared.application(.shared, open: context.url, options: options)
      if context.url.scheme == "affine", context.url.host == "share-inbox" {
        processShareInbox()
      }
    }
  }

  func scene(_: UIScene, continue userActivity: NSUserActivity) {
    _ = ApplicationDelegateProxy.shared.application(.shared, continue: userActivity) { _ in }
  }

  private func processShareInbox() {
    let navigation = window?.rootViewController as? RootViewController
    (navigation?.viewControllers.first as? AFFiNEViewController)?.processShareInboxIfNeeded()
  }
}
