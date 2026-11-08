import SwiftUI

struct NativeSignInHUDView: View {
  let message: String
  let isSuccess: Bool
  let palette: NativeSignInPalette

  @State private var successProgress: CGFloat = 0
  @State private var successCheckScale: CGFloat = 0.56
  @State private var successCheckOpacity: Double = 0
  @State private var isSuccessAnimationSettled = false

  private var usesCompactSuccessLayout: Bool {
    isSuccess && isSuccessAnimationSettled
  }

  var body: some View {
    content
      .padding(.horizontal, usesCompactSuccessLayout ? 10 : 24)
      .padding(.vertical, usesCompactSuccessLayout ? 10 : 22)
      .background {
        RoundedRectangle(cornerRadius: usesCompactSuccessLayout ? 22 : 30, style: .continuous)
          .fill(.ultraThinMaterial)
          .overlay {
            RoundedRectangle(cornerRadius: usesCompactSuccessLayout ? 22 : 30, style: .continuous)
              .fill(palette.hudBackground)
          }
      }
      .overlay {
        RoundedRectangle(cornerRadius: usesCompactSuccessLayout ? 22 : 30, style: .continuous)
          .stroke(palette.hudBorder, lineWidth: 1)
      }
      .shadow(color: palette.hudShadow, radius: 24, x: 0, y: 14)
      .shadow(color: palette.controlShadow, radius: 6, x: 0, y: 2)
      .allowsHitTesting(false)
      .onAppear {
        guard isSuccess else { return }
        startSuccessAnimation()
      }
      .onChange(of: isSuccess) { value in
        if value {
          startSuccessAnimation()
        } else {
          resetSuccessAnimation()
        }
      }
  }

  @ViewBuilder
  private var content: some View {
    if isSuccess {
      if isSuccessAnimationSettled {
        successContent
      } else {
        animatedSuccessContent
      }
    } else {
      loadingContent
    }
  }

  private var loadingContent: some View {
    VStack(spacing: 14) {
      NativeSignInLoadingRing(palette: palette)

      Text(message)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(palette.primaryText)
        .lineLimit(1)
    }
  }

  private var animatedSuccessContent: some View {
    VStack(spacing: 14) {
      NativeSignInSuccessRing(
        palette: palette,
        progress: successProgress,
        checkScale: successCheckScale,
        checkOpacity: successCheckOpacity
      )

      Text(message)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(palette.primaryText)
        .lineLimit(1)
    }
  }

  private var successContent: some View {
    HStack(spacing: 12) {
      ZStack {
        Circle()
          .fill(palette.successText.opacity(0.14))
          .frame(width: 34, height: 34)

        Image(systemName: "checkmark")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(palette.successText)
      }

      Text(message)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(palette.primaryText)
        .lineLimit(1)
    }
  }

  private func startSuccessAnimation() {
    resetSuccessAnimation()
    withAnimation(.easeOut(duration: 0.28)) {
      successProgress = 1
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
      withAnimation(.spring(response: 0.42, dampingFraction: 0.62)) {
        successCheckScale = 1
        successCheckOpacity = 1
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.76) {
      withAnimation(.easeInOut(duration: 0.18)) {
        isSuccessAnimationSettled = true
      }
    }
  }

  private func resetSuccessAnimation() {
    successProgress = 0
    successCheckScale = 0.56
    successCheckOpacity = 0
    isSuccessAnimationSettled = false
  }
}

private struct NativeSignInSuccessRing: View {
  let palette: NativeSignInPalette
  let progress: CGFloat
  let checkScale: CGFloat
  let checkOpacity: Double

  var body: some View {
    ZStack {
      Circle()
        .stroke(palette.hudLoadingTrack, lineWidth: 7)
        .frame(width: 76, height: 76)

      Circle()
        .trim(from: 0, to: progress)
        .stroke(
          LinearGradient(
            colors: [palette.accent, palette.hudGradientEnd],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          ),
          style: StrokeStyle(lineWidth: 7, lineCap: .round)
        )
        .frame(width: 76, height: 76)
        .rotationEffect(.degrees(-90))

      Image(systemName: "checkmark")
        .font(.system(size: 32, weight: .bold))
        .foregroundStyle(palette.successText)
        .scaleEffect(checkScale)
        .opacity(checkOpacity)
    }
  }
}

private struct NativeSignInLoadingRing: View {
  let palette: NativeSignInPalette

  @State private var rotation: Double = -90
  @State private var pulseScale: CGFloat = 0.94
  @State private var pulseOpacity: Double = 0.44

  var body: some View {
    ZStack {
      Circle()
        .stroke(palette.hudLoadingTrack, lineWidth: 6.5)
        .frame(width: 76, height: 76)

      Circle()
        .trim(from: 0.06, to: 0.36)
        .stroke(
          LinearGradient(
            colors: [palette.accent, palette.hudGradientEnd],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          ),
          style: StrokeStyle(lineWidth: 7, lineCap: .round)
        )
        .frame(width: 76, height: 76)
        .rotationEffect(.degrees(rotation))
        .shadow(color: palette.accent.opacity(0.26), radius: 7, x: 0, y: 0)

      Circle()
        .trim(from: 0.58, to: 0.72)
        .stroke(
          LinearGradient(
            colors: [palette.hudGradientEnd.opacity(0.72), palette.accent.opacity(0.22)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          ),
          style: StrokeStyle(lineWidth: 4.5, lineCap: .round)
        )
        .frame(width: 76, height: 76)
        .rotationEffect(.degrees(rotation + 12))

      Circle()
        .fill(
          RadialGradient(
            colors: [palette.accent.opacity(0.20), Color.clear],
            center: .center,
            startRadius: 0,
            endRadius: 26
          )
        )
        .frame(width: 52, height: 52)
        .scaleEffect(pulseScale)
        .opacity(pulseOpacity)

      Circle()
        .fill(palette.accent.opacity(0.82))
        .frame(width: 5.5, height: 5.5)
        .scaleEffect(pulseScale)
        .opacity(0.86)
    }
    .onAppear {
      rotation = -90
      pulseScale = 0.94
      pulseOpacity = 0.44
      withAnimation(.linear(duration: 1.08).repeatForever(autoreverses: false)) {
        rotation = 270
      }
      withAnimation(.easeInOut(duration: 0.92).repeatForever(autoreverses: true)) {
        pulseScale = 1.12
        pulseOpacity = 0.72
      }
    }
  }
}

