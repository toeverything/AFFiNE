//
//  IntelligentsButton.swift
//
//
//  Created by 秋星桥 on 2024/11/18.
//

import SnapKit
import SwifterSwift
import UIKit

// floating button to open intelligent panel
public class IntelligentsButton: UIView {
  lazy var image = UIImageView().then {
    $0.image = .init(named: "spark", in: .module, with: .none)
    $0.contentMode = .scaleAspectFit
  }

  lazy var background = UIView().then {
    $0.backgroundColor = .init(
      light: .systemBackground,
      dark: .darkGray.withAlphaComponent(0.25)
    )
  }

  lazy var activityIndicator = UIActivityIndicatorView()

  public weak var delegate: (any IntelligentsButtonDelegate)? {
    didSet { assert(Thread.isMainThread) }
  }

  public init() {
    super.init(frame: .zero)
    setupViews()
    setupConstraints()
    setupGesture()
    setupAppearance()
    stopProgress()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  deinit {
    delegate = nil
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    layer.cornerRadius = bounds.width / 2
  }

  private var allowedTap = true

  @objc func tapped() {
    guard allowedTap else { return }
    delegate?.onIntelligentsButtonTapped(self)
  }

  public func beginProgress() {
    allowedTap = false
    activityIndicator.startAnimating()
    activityIndicator.isHidden = false
    image.isHidden = true
    bringSubviewToFront(activityIndicator)
  }

  public func stopProgress() {
    allowedTap = true
    activityIndicator.stopAnimating()
    activityIndicator.isHidden = true
    image.isHidden = false
  }
}

// MARK: - Setup Methods

private extension IntelligentsButton {
  func setupViews() {
    addSubview(background)
    addSubview(image)
    addSubview(activityIndicator)
  }

  func setupConstraints() {
    background.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    image.snp.makeConstraints { make in
      make.edges.equalToSuperview().inset(12)
    }

    activityIndicator.snp.makeConstraints { make in
      make.center.equalToSuperview()
    }
  }

  func setupGesture() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
    addGestureRecognizer(tap)
    isUserInteractionEnabled = true
  }

  func setupAppearance() {
    clipsToBounds = true
    layer.borderWidth = 2
    layer.borderColor = UIColor.gray.withAlphaComponent(0.1).cgColor
  }
}
