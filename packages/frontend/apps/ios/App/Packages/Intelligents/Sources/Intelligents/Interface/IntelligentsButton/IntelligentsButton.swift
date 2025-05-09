//
//  IntelligentsButton.swift
//
//
//  Created by 秋星桥 on 2024/11/18.
//

import UIKit

// floating button to open intelligent panel
public class IntelligentsButton: UIView {
  let image = UIImageView()
  let background = UIView()
  let activityIndicator = UIActivityIndicatorView()

  public weak var delegate: (any IntelligentsButtonDelegate)? = nil {
    didSet { assert(Thread.isMainThread) }
  }

  public init() {
    super.init(frame: .zero)

    background.backgroundColor = .white
    addSubview(background)
    background.translatesAutoresizingMaskIntoConstraints = false
    [
      background.leadingAnchor.constraint(equalTo: leadingAnchor),
      background.trailingAnchor.constraint(equalTo: trailingAnchor),
      background.topAnchor.constraint(equalTo: topAnchor),
      background.bottomAnchor.constraint(equalTo: bottomAnchor),
    ].forEach { $0.isActive = true }

    image.image = .init(named: "spark", in: .module, with: .none)
    image.contentMode = .scaleAspectFit
    image.tintColor = .accent
    addSubview(image)
    let imageInsetValue: CGFloat = 12
    image.translatesAutoresizingMaskIntoConstraints = false
    [
      image.leadingAnchor.constraint(equalTo: leadingAnchor, constant: imageInsetValue),
      image.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -imageInsetValue),
      image.topAnchor.constraint(equalTo: topAnchor, constant: imageInsetValue),
      image.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -imageInsetValue),
    ].forEach { $0.isActive = true }

    activityIndicator.translatesAutoresizingMaskIntoConstraints = false
    addSubview(activityIndicator)
    [
      activityIndicator.centerXAnchor.constraint(equalTo: centerXAnchor),
      activityIndicator.centerYAnchor.constraint(equalTo: centerYAnchor),
    ].forEach { $0.isActive = true }

    clipsToBounds = true
    layer.borderWidth = 2
    layer.borderColor = UIColor.gray.withAlphaComponent(0.1).cgColor

    let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
    addGestureRecognizer(tap)
    isUserInteractionEnabled = true

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
