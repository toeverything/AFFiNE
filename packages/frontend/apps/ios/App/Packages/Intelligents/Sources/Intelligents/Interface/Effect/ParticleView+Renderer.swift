//
//  ParticleView+Renderer.swift
//  UIEffectKit
//
//  Created by 秋星桥 on 6/13/25.
//

import MetalKit

extension ParticleView {
  class Renderer: NSObject, MTKViewDelegate {
    private struct Particle {
      var position: simd_float2
      var velocity: simd_float2
      var life: simd_float1
      var duration: simd_float1
    }

    private struct Vertex {
      var position: simd_float4
      var uv: simd_float2
      var opacity: simd_float1
    }

    private var isPrepared = false
    private var renderPipeline: MTLRenderPipelineState!
    private var computePipeline: MTLComputePipelineState!
    private var vertexBuffer: MTLBuffer!
    private var particleBuffer: MTLBuffer!
    private var particleCount: Int = 0
    private var texture: MTLTexture!
    private var targetFrameSize: simd_float2 = .zero
    private var stepSize: Float = 0
    private var commandQueue: MTLCommandQueue!
    private var maxLife: Float = 0
    private var onComplete: (() -> Void)?
    private var onFirstFrameRendered: (() -> Void)?
    private var hasRenderedFirstFrame = false
    private var device: MTLDevice!

    func prepareResources(
      with device: MTLDevice,
      image: CGImage,
      targetFrame: CGRect,
      onComplete: @escaping () -> Void,
      onFirstFrameRendered: @escaping () -> Void
    ) {
      guard !isPrepared else { return }

      self.device = device
      self.onComplete = onComplete
      self.onFirstFrameRendered = onFirstFrameRendered
      let integralTargetFrame = targetFrame.integral

      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        guard let self else { return }

        setupPipelineStates(with: device)
        setupVertexBuffer(with: device)
        setupParticleSystem(targetFrame: integralTargetFrame, device: device)
        setupTexture(from: image, device: device)
        finalizeSetup(targetFrame: integralTargetFrame, device: device)

        DispatchQueue.main.async { self.isPrepared = true }
      }
    }

    private func setupPipelineStates(with device: MTLDevice) {
      let library = try! device.makeDefaultLibrary(bundle: .module)

      let particleVertexFunction = library.makeFunction(name: "PTS_ParticleVertex")!
      let particleFragmentFunction = library.makeFunction(name: "PTS_ParticleFragment")!
      let updateParticlesFunction = library.makeFunction(name: "PTS_UpdateParticles")!

      let renderPipelineDescriptor = createRenderPipelineDescriptor(
        vertexFunction: particleVertexFunction,
        fragmentFunction: particleFragmentFunction
      )

      do {
        renderPipeline = try device.makeRenderPipelineState(descriptor: renderPipelineDescriptor)
        computePipeline = try device.makeComputePipelineState(function: updateParticlesFunction)
      } catch {
        fatalError("failed to create pipeline states: \(error)")
      }
    }

    private func createRenderPipelineDescriptor(
      vertexFunction: MTLFunction,
      fragmentFunction: MTLFunction
    ) -> MTLRenderPipelineDescriptor {
      let descriptor = MTLRenderPipelineDescriptor()
      descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
      descriptor.colorAttachments[0].isBlendingEnabled = true
      descriptor.colorAttachments[0].rgbBlendOperation = .add
      descriptor.colorAttachments[0].alphaBlendOperation = .add
      descriptor.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
      descriptor.colorAttachments[0].sourceAlphaBlendFactor = .sourceAlpha
      descriptor.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
      descriptor.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
      descriptor.vertexFunction = vertexFunction
      descriptor.fragmentFunction = fragmentFunction
      return descriptor
    }

    func mtkView(_: MTKView, drawableSizeWillChange _: CGSize) {
      // No-op since view is not subject to resize
    }

    func draw(in view: MTKView) {
      guard isPrepared else { return }

      updateParticles()

      if checkAllParticlesDead() {
        DispatchQueue.main.async { [weak self] in
          self?.onComplete?()
        }
        return
      }

      renderParticles(in: view)

      if !hasRenderedFirstFrame {
        hasRenderedFirstFrame = true
        DispatchQueue.main.async { [weak self] in
          self?.onFirstFrameRendered?()
        }
      }
    }

    private func updateParticles() {
      let maxThreadsPerThreadgroup = computePipeline.maxTotalThreadsPerThreadgroup
      let threadgroupSize = min(maxThreadsPerThreadgroup, 2048)
      let threadgroupCount = (particleCount + threadgroupSize - 1) / threadgroupSize

      let computeCommandBuffer = commandQueue.makeCommandBuffer()!

      let computeCommandEncoder = computeCommandBuffer.makeComputeCommandEncoder()!
      computeCommandEncoder.setComputePipelineState(computePipeline)
      computeCommandEncoder.setBuffer(particleBuffer, offset: 0, index: 0)
      computeCommandEncoder.dispatchThreadgroups(
        .init(width: threadgroupCount, height: 1, depth: 1),
        threadsPerThreadgroup: .init(width: threadgroupSize, height: 1, depth: 1)
      )
      computeCommandEncoder.endEncoding()

      computeCommandBuffer.commit()
    }

    private func checkAllParticlesDead() -> Bool {
      let particleData = particleBuffer
        .contents()
        .bindMemory(to: Particle.self, capacity: particleCount)

      for i in 0 ..< particleCount {
        if particleData[i].life >= 0 {
          return false
        }
      }
      return true
    }

    private func renderParticles(in view: MTKView) {
      let viewCGSize = view.bounds.size
      var viewSize = simd_float2(Float(viewCGSize.width), Float(viewCGSize.height))

      let renderCommandBuffer = commandQueue.makeCommandBuffer()!

      guard let renderPassDescriptor = view.currentRenderPassDescriptor else { return }
      renderPassDescriptor.colorAttachments[0].loadAction = .clear
      renderPassDescriptor.colorAttachments[0].clearColor = .init(red: 0, green: 0, blue: 0, alpha: 0)

      let renderCommandEncoder = renderCommandBuffer.makeRenderCommandEncoder(descriptor: renderPassDescriptor)!
      renderCommandEncoder.setRenderPipelineState(renderPipeline)
      renderCommandEncoder.setVertexBuffer(vertexBuffer, offset: 0, index: 0)

      withUnsafeBytes(of: &viewSize) { pointer in
        renderCommandEncoder.setVertexBytes(
          pointer.baseAddress!,
          length: MemoryLayout<simd_float2>.size,
          index: 1
        )
      }
      renderCommandEncoder.setVertexBuffer(particleBuffer, offset: 0, index: 2)
      withUnsafeBytes(of: &targetFrameSize) { pointer in
        renderCommandEncoder.setVertexBytes(
          pointer.baseAddress!,
          length: MemoryLayout<simd_float2>.size,
          index: 3
        )
      }
      withUnsafeBytes(of: &stepSize) { pointer in
        renderCommandEncoder.setVertexBytes(
          pointer.baseAddress!,
          length: MemoryLayout<Float>.size,
          index: 4
        )
      }
      renderCommandEncoder.setFragmentTexture(texture, index: 0)

      setupSampler(renderCommandEncoder: renderCommandEncoder)

      renderCommandEncoder.drawPrimitives(
        type: .triangleStrip,
        vertexStart: 0,
        vertexCount: 4,
        instanceCount: particleCount
      )
      renderCommandEncoder.endEncoding()

      renderCommandBuffer.present(view.currentDrawable!)
      renderCommandBuffer.commit()
    }

    private func setupSampler(renderCommandEncoder: MTLRenderCommandEncoder) {
      let samplerDescriptor = MTLSamplerDescriptor()
      samplerDescriptor.minFilter = .linear
      samplerDescriptor.magFilter = .linear
      samplerDescriptor.mipFilter = .notMipmapped
      samplerDescriptor.sAddressMode = .clampToEdge
      samplerDescriptor.tAddressMode = .clampToEdge
      let samplerState = device.makeSamplerState(descriptor: samplerDescriptor)
      renderCommandEncoder.setFragmentSamplerState(samplerState, index: 0)
    }
  }
}

extension ParticleView.Renderer {
  private func setupVertexBuffer(with device: MTLDevice) {
    let vertices: [Vertex] = [
      .init(position: .init(0, 0, 0, 1), uv: .init(0, 0), opacity: .zero),
      .init(position: .init(1, 0, 0, 1), uv: .init(1, 0), opacity: .zero),
      .init(position: .init(0, 1, 0, 1), uv: .init(0, 1), opacity: .zero),
      .init(position: .init(1, 1, 0, 1), uv: .init(1, 1), opacity: .zero),
    ]
    let vertexBuffer = vertices.withUnsafeBytes { pointer in
      device.makeBuffer(
        bytes: pointer.baseAddress!,
        length: MemoryLayout<Vertex>.stride * vertices.count,
        options: .storageModeShared
      )
    }
    self.vertexBuffer = vertexBuffer!
  }

  private func setupParticleSystem(targetFrame: CGRect, device: MTLDevice) {
    var particles = [Particle]()
    let targetFrameHeight = Float(targetFrame.height)
    let targetFrameWidth = Float(targetFrame.width)
    let particleStep = 1

    let estimatedParticleCount = 1
      * Int(targetFrameWidth / Float(particleStep))
      * Int(targetFrameHeight / Float(particleStep))
    let pixelMultiplier = 1
    particles.reserveCapacity(estimatedParticleCount * pixelMultiplier)

    for y in stride(from: 0, to: Int(targetFrameHeight), by: particleStep) {
      for x in stride(from: 0, to: Int(targetFrameWidth), by: particleStep) {
        let particle = createParticle(x: x, y: y, step: particleStep)
        for _ in 0 ..< pixelMultiplier {
          particles.append(particle)
        }
      }
    }

    particleCount = particles.count
    let particleBuffer = particles.withUnsafeBytes { pointer in
      device.makeBuffer(
        bytes: pointer.baseAddress!,
        length: MemoryLayout<Particle>.stride * particles.count,
        options: .storageModeShared
      )
    }
    self.particleBuffer = particleBuffer!
    stepSize = Float(particleStep)
  }

  private func createParticle(x: Int, y: Int, step: Int) -> Particle {
    let particleDuration: Float = .random(in: 20 ... 60)
    let initialX = Float(x) + Float(step) / 2.0
    let initialY = Float(y) + Float(step) / 2.0
    return .init(
      position: .init(initialX, initialY),
      velocity: .init(
        cos(Float.random(in: 0 ... (2 * Float.pi))) * Float.random(in: 1 ... 4),
        sin(Float.random(in: 0 ... (2 * Float.pi))) * Float.random(in: 1 ... 4) - 2.5
      ),
      life: simd_float1(particleDuration),
      duration: simd_float1(particleDuration)
    )
  }

  private func setupTexture(from image: CGImage, device: MTLDevice) {
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)

    guard let context = CGContext(
      data: nil,
      width: image.width,
      height: image.height,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: colorSpace,
      bitmapInfo: bitmapInfo.rawValue
    ) else { return }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))

    guard let convertedImage = context.makeImage() else { return }

    let textureLoader = MTKTextureLoader(device: device)
    let textureLoaderOptions: [MTKTextureLoader.Option: Any] = [
      .textureStorageMode: MTLStorageMode.private.rawValue,
      .SRGB: false,
    ]
    guard let texture = try? textureLoader.newTexture(
      cgImage: convertedImage,
      options: textureLoaderOptions
    ) else { return }

    self.texture = texture
  }

  private func finalizeSetup(targetFrame: CGRect, device: MTLDevice) {
    let targetFrameWidth = Float(targetFrame.width)
    let targetFrameHeight = Float(targetFrame.height)
    targetFrameSize = .init(targetFrameWidth, targetFrameHeight)
    commandQueue = device.makeCommandQueue()!
  }
}
