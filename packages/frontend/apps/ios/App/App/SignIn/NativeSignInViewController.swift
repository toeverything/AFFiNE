import SwiftUI
import UIKit
import WebKit

final class NativeSignInViewController: UIViewController {
  var onComplete: ((Bool) -> Void)?

  private let viewModel: NativeSignInViewModel
  private let backgroundImageView: UIImageView = {
    let imageView = UIImageView(image: UIImage(named: "NativeLoginBackground"))
    imageView.translatesAutoresizingMaskIntoConstraints = false
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.isUserInteractionEnabled = false
    return imageView
  }()

  private let backgroundOverlayView: UIView = {
    let view = UIView()
    view.translatesAutoresizingMaskIntoConstraints = false
    view.isUserInteractionEnabled = false
    return view
  }()

  private var didComplete = false

  init(webView: WKWebView) {
    viewModel = NativeSignInViewModel(bridge: NativeSignInWebBridge(webView: webView))
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
    modalTransitionStyle = .coverVertical
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    installBackgroundViews()
    updateBackground(for: viewModel.appearance)

    viewModel.onFinished = { [weak self] isSignedIn in
      self?.finish(isSignedIn: isSignedIn)
    }
    viewModel.onAppearanceChanged = { [weak self] appearance in
      self?.updateBackground(for: appearance)
    }
    viewModel.loadAppearance()

    let hostingController = UIHostingController(rootView: NativeSignInView(viewModel: viewModel))
    addChild(hostingController)
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false
    hostingController.view.backgroundColor = .clear
    view.addSubview(hostingController.view)
    NSLayoutConstraint.activate([
      hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    hostingController.didMove(toParent: self)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    updateBackgroundImageOffset()
  }

  private func installBackgroundViews() {
    view.addSubview(backgroundImageView)
    view.addSubview(backgroundOverlayView)
    NSLayoutConstraint.activate([
      backgroundImageView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: -24),
      backgroundImageView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: 24),
      backgroundImageView.topAnchor.constraint(equalTo: view.topAnchor, constant: -80),
      backgroundImageView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: 80),
      backgroundOverlayView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      backgroundOverlayView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      backgroundOverlayView.topAnchor.constraint(equalTo: view.topAnchor),
      backgroundOverlayView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }

  private func updateBackgroundImageOffset() {
    let isLandscape = view.bounds.width > view.bounds.height
    backgroundImageView.transform = CGAffineTransform(translationX: 0, y: isLandscape ? 14 : 34)
  }

  private func updateBackground(for appearance: NativeSignInAppearanceSnapshot) {
    let isDark = appearance.resolvedScheme == .dark
    view.backgroundColor = isDark
      ? UIColor(red: 0.30, green: 0.30, blue: 0.30, alpha: 1)
      : UIColor(red: 0.95, green: 0.95, blue: 0.95, alpha: 1)
    backgroundImageView.alpha = isDark ? 0.68 : 1
    backgroundOverlayView.backgroundColor = isDark
      ? UIColor.black.withAlphaComponent(0.34)
      : UIColor.white.withAlphaComponent(0.02)
  }

  private func finish(isSignedIn: Bool) {
    guard !didComplete else { return }
    didComplete = true
    view.isUserInteractionEnabled = false
    dismiss(animated: false) { [onComplete] in
      onComplete?(isSignedIn)
    }
  }
}
