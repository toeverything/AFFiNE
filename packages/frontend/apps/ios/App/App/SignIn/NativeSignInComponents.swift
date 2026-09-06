import SwiftUI

struct LoginDotOverlay: View {
  let dotColor: Color
  private let spacing: CGFloat = 13
  private let dotSize: CGFloat = 2.2

  var body: some View {
    Canvas { context, size in
      let dot = Path(ellipseIn: CGRect(x: 0, y: 0, width: dotSize, height: dotSize))
      for x in stride(from: CGFloat(0), through: size.width, by: spacing) {
        for y in stride(from: CGFloat(0), through: size.height, by: spacing) {
          context.fill(
            dot.applying(CGAffineTransform(translationX: x, y: y)),
            with: .color(dotColor)
          )
        }
      }
    }
  }
}

struct LoginRedGridOverlay: View {
  private let spacing: CGFloat = 12

  var body: some View {
    GeometryReader { geometry in
      let drawWidth = geometry.size.width
      let drawHeight = geometry.size.height

      Path { path in
        stride(from: 0, through: drawWidth, by: spacing).forEach { x in
          path.move(to: CGPoint(x: x, y: 0))
          path.addLine(to: CGPoint(x: x, y: drawHeight))
        }

        stride(from: 0, through: drawHeight, by: spacing).forEach { y in
          path.move(to: CGPoint(x: 0, y: y))
          path.addLine(to: CGPoint(x: drawWidth, y: y))
        }
      }
      .stroke(Color.red.opacity(0.4), lineWidth: 0.4)
      .frame(width: drawWidth, height: drawHeight, alignment: .topLeading)
    }
  }
}

struct OAuthButton: View {
  let provider: NativeOAuthProvider
  let palette: NativeSignInPalette
  let isLoading: Bool
  let isDisabled: Bool
  let action: () -> Void

  private var foreground: Color {
    provider == .google ? .white : palette.appleButtonForeground
  }

  var body: some View {
    Button(action: action) {
      HStack(spacing: 13) {
        if isLoading {
          ProgressView()
            .tint(foreground)
            .frame(width: 28, height: 28)
        } else {
          providerIcon
            .frame(width: 28, height: 28)
        }
        Text(LocalizedStringKey(provider == .google ? "Continue with Google" : "Continue with Apple"))
          .font(.system(size: 18, weight: .medium))
      }
      .foregroundStyle(foreground)
      .frame(maxWidth: .infinity)
      .frame(height: palette.authButtonHeight)
      .background(provider == .google ? palette.googleButtonBackground : palette.appleButtonBackground)
      .clipShape(RoundedRectangle(cornerRadius: palette.authButtonCornerRadius, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: palette.authButtonCornerRadius, style: .continuous)
          .stroke(provider == .apple ? palette.appleButtonBorder : Color.clear, lineWidth: palette.appleButtonBorderWidth)
      }
      .shadow(color: palette.controlShadow.opacity(0.7), radius: 8, x: 0, y: 3)
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .opacity(isDisabled && !isLoading ? 0.62 : 1)
  }

  @ViewBuilder
  private var providerIcon: some View {
    if provider == .google {
      Text("G")
        .font(.system(size: 32, weight: .bold))
        .foregroundStyle(.white)
    } else {
      Image(systemName: "apple.logo")
        .font(.system(size: 28, weight: .semibold))
        .foregroundStyle(foreground)
    }
  }
}

struct EmailContinueButton: View {
  let palette: NativeSignInPalette
  let isLoading: Bool
  let isDisabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if isLoading {
          ProgressView()
            .tint(palette.accent)
        }
        Text("Continue with Email")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(palette.emailButtonText)
        Image(systemName: "arrow.right")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(palette.accent)
      }
      .frame(maxWidth: .infinity)
      .frame(height: palette.emailButtonHeight)
      .background(palette.emailButtonBackground)
      .clipShape(RoundedRectangle(cornerRadius: palette.emailButtonCornerRadius, style: .continuous))
      .shadow(color: palette.controlShadow.opacity(0.65), radius: 10, x: 0, y: 4)
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .opacity(isDisabled && !isLoading ? 0.62 : 1)
  }
}

struct LegalLinkButton: View {
  let title: String
  let palette: NativeSignInPalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(LocalizedStringKey(title))
        .font(.system(size: 12, weight: .medium))
        .underline(true, color: palette.accent)
        .foregroundStyle(palette.accent)
    }
    .buttonStyle(.plain)
  }
}

struct PrimaryNativeSignInButton: View {
  let title: String
  let palette: NativeSignInPalette
  let isLoading: Bool
  let isEnabled: Bool
  let isDisabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if isLoading {
          ProgressView()
            .tint(.white)
        }
      Text(LocalizedStringKey(title))
          .font(.system(size: 17, weight: .bold))
      }
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity)
      .frame(height: palette.emailButtonHeight)
      .background(isEnabled && (!isDisabled || isLoading) ? palette.accent : palette.primaryDisabledBackground)
      .clipShape(RoundedRectangle(cornerRadius: palette.emailButtonCornerRadius, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled || isDisabled)
  }
}

struct FooterLinkButton: View {
  let systemName: String
  let title: String
  let palette: NativeSignInPalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 9) {
        Image(systemName: systemName)
          .font(.system(size: 21, weight: .medium))
      Text(LocalizedStringKey(title))
          .font(.system(size: 16, weight: .regular))
      }
      .foregroundStyle(palette.accent)
      .frame(maxWidth: .infinity)
      .frame(height: 34)
    }
    .buttonStyle(.plain)
  }
}
