import SwiftUI

struct NativeSignInView: View {
  @ObservedObject var viewModel: NativeSignInViewModel
  @Environment(\.openURL) private var openURL
  @Environment(\.colorScheme) private var systemColorScheme

  private var palette: NativeSignInPalette {
    NativeSignInPalette(colorScheme: viewModel.appearance.effectiveScheme(systemScheme: systemColorScheme))
  }

  var body: some View {
    GeometryReader { geometry in
      let layout = NativeSignInLayout(
        size: geometry.size,
        safeAreaInsets: geometry.safeAreaInsets
      )
      ZStack(alignment: .top) {
        ScrollView(.vertical, showsIndicators: false) {
          VStack(spacing: 0) {
            Color.clear
              .frame(height: layout.headerHeight)

            VStack(alignment: .leading, spacing: layout.contentSpacing) {
              titleSection

              switch viewModel.step {
              case .signIn:
                signInStep
              case .password:
                passwordStep
              case .magicCode:
                magicCodeStep
              }
            }
            .padding(.horizontal, layout.horizontalPadding)
            .padding(.bottom, layout.bottomPadding)
            .frame(maxWidth: layout.maxContentWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
          }
          .frame(minHeight: geometry.size.height, alignment: .top)
        }
        .zIndex(2)

        if palette.usesDarkStyle {
          LoginDotOverlay(dotColor: palette.dotColor)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .zIndex(1)
        } else {
          LoginRedGridOverlay()
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .zIndex(10)
        }

        Button(action: viewModel.close) {
          Image(systemName: "xmark")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(palette.closeIcon)
            .frame(width: 44, height: 44)
            .background(palette.closeButtonBackground)
            .clipShape(RoundedRectangle(cornerRadius: palette.closeButtonCornerRadius, style: .continuous))
            .shadow(color: palette.controlShadow, radius: 10, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .padding(.top, layout.closeButtonTopPadding)
        .padding(.trailing, layout.closeButtonTrailingPadding)
        .frame(maxWidth: .infinity, alignment: .topTrailing)
        .zIndex(11)

        if viewModel.isLoading || viewModel.isSuccessFeedback {
          NativeSignInHUDView(
            message: viewModel.isSuccessFeedback
              ? String(localized: "Sign in Success")
              : String(localized: "Logging in..."),
            isSuccess: viewModel.isSuccessFeedback,
            palette: palette
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
          .transition(.opacity.combined(with: .scale(scale: 0.96)))
          .zIndex(12)
        }
      }
      .animation(.easeInOut(duration: 0.16), value: viewModel.isLoading)
      .animation(.easeInOut(duration: 0.16), value: viewModel.isSuccessFeedback)
      .frame(width: geometry.size.width, height: geometry.size.height)
    }
    .preferredColorScheme(viewModel.appearance.preferredColorScheme)
  }

  private var titleSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        Image("NativeLoginLogo")
          .resizable()
          .renderingMode(.template)
          .scaledToFit()
          .foregroundStyle(palette.logoTint)
          .frame(width: 36, height: 36)
        Text("Sign in")
          .font(.system(size: 24, weight: .bold))
          .foregroundStyle(palette.primaryText)
      }
      Text("AFFiNE Cloud")
        .font(.system(size: 23, weight: .bold))
        .foregroundStyle(palette.primaryText)
    }
  }

  private var signInStep: some View {
    VStack(alignment: .leading, spacing: 13) {
      OAuthButton(
        provider: .google,
        palette: palette,
        isLoading: viewModel.isProviderLoading(.google),
        isDisabled: viewModel.isLoading
      ) {
        viewModel.startOAuth(provider: .google)
      }
      OAuthButton(
        provider: .apple,
        palette: palette,
        isLoading: viewModel.isProviderLoading(.apple),
        isDisabled: viewModel.isLoading
      ) {
        viewModel.startOAuth(provider: .apple)
      }

      VStack(alignment: .leading, spacing: 10) {
        Text("Email")
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(palette.secondaryText)
        TextField(
          "",
          text: $viewModel.email,
          prompt: Text("Enter your email address").foregroundColor(palette.placeholderText)
        )
          .keyboardType(.emailAddress)
          .textContentType(.emailAddress)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .font(.system(size: 16, weight: .regular))
          .foregroundStyle(palette.primaryText)
          .tint(palette.accent)
          .padding(.horizontal, 16)
          .frame(height: palette.inputHeight)
          .background(palette.inputBackground)
          .clipShape(RoundedRectangle(cornerRadius: palette.inputCornerRadius, style: .continuous))
          .submitLabel(.continue)
          .onSubmit(viewModel.continueWithEmail)
      }
      .padding(.top, 8)

      EmailContinueButton(
        palette: palette,
        isLoading: viewModel.isActionLoading(.email),
        isDisabled: viewModel.isLoading
      ) {
        viewModel.continueWithEmail()
      }

      feedbackText

      legalText
        .padding(.top, 8)

      divider
        .padding(.vertical, 2)

      FooterLinkButton(systemName: "globe", title: "Connect to a Self-Hosted Instance", palette: palette) {
        viewModel.openSelfHosted()
      }
      FooterLinkButton(systemName: "person.crop.square", title: "Start AFFiNE without an account", palette: palette) {
        viewModel.close()
      }
    }
  }

  private var passwordStep: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Email")
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(palette.secondaryText)
      Text(viewModel.email)
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(palette.secondaryText)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: palette.inputHeight)
        .background(palette.readonlyInputBackground)
        .clipShape(RoundedRectangle(cornerRadius: palette.inputCornerRadius, style: .continuous))

      SecureField(
        "",
        text: $viewModel.password,
        prompt: Text("Enter your password").foregroundColor(palette.placeholderText)
      )
        .textContentType(.password)
        .font(.system(size: 16, weight: .regular))
        .foregroundStyle(palette.primaryText)
        .tint(palette.accent)
        .padding(.horizontal, 16)
        .frame(height: palette.inputHeight)
        .background(palette.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: palette.inputCornerRadius, style: .continuous))
        .submitLabel(.go)
        .onSubmit(viewModel.signInWithPassword)

      PrimaryNativeSignInButton(
        title: "Continue",
        palette: palette,
        isLoading: viewModel.isActionLoading(.password),
        isEnabled: viewModel.canContinueWithPassword,
        isDisabled: viewModel.isLoading,
        action: viewModel.signInWithPassword
      )

      if viewModel.canUseMagicLink {
        Button("Use email code instead", action: viewModel.useMagicLink)
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(palette.accent)
          .buttonStyle(.plain)
      }

      feedbackText
    }
  }

  private var magicCodeStep: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Enter the code sent to")
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(palette.secondaryText)
      Text(viewModel.email)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(palette.primaryText)

      TextField(
        "",
        text: $viewModel.magicCode,
        prompt: Text("6-digit code").foregroundColor(palette.placeholderText)
      )
        .keyboardType(.numberPad)
        .textContentType(.oneTimeCode)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(palette.primaryText)
        .tint(palette.accent)
        .padding(.horizontal, 16)
        .frame(height: palette.inputHeight)
        .background(palette.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: palette.inputCornerRadius, style: .continuous))
        .onChange(of: viewModel.magicCode) { value in
          viewModel.magicCode = String(value.prefix(6))
        }

      PrimaryNativeSignInButton(
        title: "Continue",
        palette: palette,
        isLoading: viewModel.isActionLoading(.magicCode),
        isEnabled: viewModel.canContinueWithCode,
        isDisabled: viewModel.isLoading,
        action: viewModel.signInWithMagicCode
      )

      Button("Resend code") {
        viewModel.resendMagicCode()
      }
      .font(.system(size: 15, weight: .medium))
      .foregroundStyle(palette.accent)
      .buttonStyle(.plain)

      feedbackText
    }
  }

  private var legalText: some View {
    VStack(alignment: palette.usesDarkStyle ? .leading : .center, spacing: 3) {
      Text("By clicking \"Continue with Google/Email\" above, you")
      Text("acknowledge that you agree to AFFiNE's")
      HStack(spacing: 3) {
        LegalLinkButton(title: "Terms of Conditions", palette: palette) {
          openLegalURL("https://affine.pro/terms")
        }
        Text("and")
        LegalLinkButton(title: "Privacy Policy", palette: palette) {
          openLegalURL("https://affine.pro/privacy")
        }
        Text(".")
      }
    }
    .font(.system(size: 12, weight: .medium))
    .foregroundStyle(palette.tertiaryText)
    .frame(maxWidth: .infinity, alignment: palette.legalFrameAlignment)
    .multilineTextAlignment(palette.legalTextAlignment)
  }

  private var divider: some View {
    HStack(spacing: 14) {
      Rectangle()
        .fill(palette.divider)
        .frame(height: 1)
      Text("Or")
        .font(.system(size: 16, weight: .regular))
        .foregroundStyle(palette.secondaryText)
      Rectangle()
        .fill(palette.divider)
        .frame(height: 1)
    }
  }

  @ViewBuilder
  private var feedbackText: some View {
    if let errorMessage = viewModel.errorMessage {
      Text(errorMessage)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(.red)
        .frame(maxWidth: .infinity, alignment: .leading)
    } else if let statusMessage = viewModel.statusMessage {
      HStack(spacing: 8) {
        if viewModel.isLoading {
          ProgressView()
            .tint(palette.accent)
        }
        Text(statusMessage)
          .font(.system(size: 13, weight: .medium))
      }
      .foregroundStyle(viewModel.isSuccessFeedback ? palette.successText : palette.tertiaryText)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func openLegalURL(_ urlString: String) {
    guard let url = URL(string: urlString) else { return }
    openURL(url)
  }
}

private struct NativeSignInLayout {
  let size: CGSize
  let safeAreaInsets: EdgeInsets

  private var isLandscape: Bool {
    size.width > size.height
  }

  private var isPadLike: Bool {
    min(size.width, size.height) >= 700
  }

  var headerHeight: CGFloat {
    if isLandscape {
      return isPadLike ? 170 : 118
    }
    return isPadLike ? 250 : 226
  }

  var contentSpacing: CGFloat {
    isLandscape && !isPadLike ? 14 : 20
  }

  var horizontalPadding: CGFloat {
    isLandscape ? 24 : 20
  }

  var bottomPadding: CGFloat {
    max(safeAreaInsets.bottom + (isLandscape ? 16 : 18), isLandscape ? 24 : 34)
  }

  var maxContentWidth: CGFloat {
    if isPadLike {
      return 460
    }
    return isLandscape ? 520 : 420
  }

  var closeButtonTopPadding: CGFloat {
    safeAreaInsets.top + max((44 - closeButtonSize) / 2, 0)
  }

  var closeButtonTrailingPadding: CGFloat {
    max(safeAreaInsets.trailing + 8, 12)
  }

  private var closeButtonSize: CGFloat {
    44
  }
}
