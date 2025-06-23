//
//  ParticleView.swift
//  TrollNFC
//
//  Created by 砍砍 on 6/8/25.
//

import MetalKit
import simd

import UIKit

class ParticleView: UIView {
  private var device: MTLDevice!
  private var metalView: MTKView!
  private var renderer = Renderer()

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupMetalDevice()
    setupMetalView()
    setupViewProperties()
  }

  private func setupMetalDevice() {
    guard let device = Self.createSystemDefaultDevice() else {
      fatalError("failed to create Metal device")
    }
    self.device = device
  }

  private func setupMetalView() {
    metalView = MTKView(frame: .zero, device: device)
    configureMetalView()
    addSubview(metalView)
  }

  private func configureMetalView() {
    metalView.layer.isOpaque = false
    metalView.backgroundColor = UIColor.clear
    metalView.delegate = renderer
  }

  private func setupViewProperties() {
    clipsToBounds = false
    metalView.clipsToBounds = false
  }

  private static func createSystemDefaultDevice() -> MTLDevice? {
    MTLCreateSystemDefaultDevice()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  func beginWith(
    _ image: CGImage,
    targetFrame: CGRect,
    onComplete: @escaping () -> Void,
    onFirstFrameRendered: @escaping () -> Void
  ) {
    renderer.prepareResources(
      with: device,
      image: image,
      targetFrame: targetFrame,
      onComplete: onComplete,
      onFirstFrameRendered: onFirstFrameRendered
    )
    metalView.draw()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let expandedBounds = bounds.insetBy(dx: -bounds.width, dy: -bounds.height)
    metalView.frame = expandedBounds
  }
}
