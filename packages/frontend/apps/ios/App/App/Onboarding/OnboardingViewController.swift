import SwiftUI
import UIKit

final class OnboardingViewController: UIViewController {
  var onCompleteOnboarding: (() -> Void)?

  private var hostingController: UIHostingController<OnboardingRootView>?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(named: "OnboardingIntroBackground") ?? .systemBackground

    let rootView = OnboardingRootView(onCompleteOnboarding: { [weak self] in
      self?.onCompleteOnboarding?()
    })
    let hostingController = UIHostingController(rootView: rootView)
    self.hostingController = hostingController

    addChild(hostingController)
    view.addSubview(hostingController.view)
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    hostingController.didMove(toParent: self)
  }
}
