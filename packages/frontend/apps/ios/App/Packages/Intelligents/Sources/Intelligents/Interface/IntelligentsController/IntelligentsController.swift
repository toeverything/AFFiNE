//
//  IntelligentsController.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/17/25.
//

import UIKit

public class IntelligentsController: UINavigationController {
  public init() {
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .custom
    transitioningDelegate = BlurTransitioningDelegate.shared
    setNavigationBarHidden(true, animated: false)
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  override public func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
  }

  override public func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    setNavigationBarHidden(true, animated: animated)
  }

  override public func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    setNavigationBarHidden(false, animated: animated)
  }
}
