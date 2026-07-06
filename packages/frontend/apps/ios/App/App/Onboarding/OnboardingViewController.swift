import Combine
import SwiftUI
import UIKit

enum OnboardingPurchaseType: String {
  case pro
  case ai
}

@MainActor
final class OnboardingFlowState: ObservableObject {
  @Published var isProcessingPurchase = false
}

final class OnboardingViewController: UIViewController {
  var onFinish: (() -> Void)?
  var onPurchase: ((OnboardingPurchaseType) -> Void)?

  private let flowState = OnboardingFlowState()
  private var hostingController: UIHostingController<OnboardingRootView>?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let rootView = OnboardingRootView(
      state: flowState,
      onFinish: { [weak self] in self?.onFinish?() },
      onPurchase: { [weak self] type in self?.onPurchase?(type) }
    )
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

  func setPurchaseProcessing(_ processing: Bool) {
    flowState.isProcessingPurchase = processing
  }
}
