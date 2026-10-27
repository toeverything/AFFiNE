import AffineResources
import SwiftUI

struct OnboardingBackground: View {
  let isIntroPage: Bool

  var body: some View {
    Group {
      if isIntroPage {
        Color("OnboardingIntroBackground")
      } else {
        Color("OnboardingBackground")
      }
    }
    .ignoresSafeArea()
  }
}

struct IntroPage: View {
  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 18)
      VStack(spacing: 16) {
        VStack(spacing: 6) {
          titleView
          Text("Write, organize, and connect ideas with docs, whiteboards, and AI.")
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(AffineColors.textSecondary.color)
            .multilineTextAlignment(.center)
            .lineSpacing(4)
            .padding(.horizontal, 22)
        }

        IntroHeroArtwork()
          .frame(height: 420)
          .padding(.horizontal, 10)
      }
      Spacer(minLength: 0)
    }
  }

  private var titleView: some View {
    (
      Text("Everything,")
        .foregroundColor(AffineColors.buttonPrimary.color)
        .italic()
      + Text(" in One\nWorkspace")
        .foregroundColor(AffineColors.textPrimary.color)
    )
    .font(.system(size: 31, weight: .bold))
    .multilineTextAlignment(.center)
  }
}

struct IntroFooter: View {
  let onGetStarted: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      Button(action: onGetStarted) {
        HStack(spacing: 10) {
          Text("Get Started")
            .font(.system(size: 18, weight: .bold))
          Image(systemName: "arrow.right")
            .font(.system(size: 16, weight: .bold))
        }
        .foregroundStyle(AffineColors.layerPureWhite.color)
        .frame(maxWidth: .infinity)
        .frame(height: 54)
        .background(AffineColors.buttonPrimary.color)
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      }
      .buttonStyle(.plain)
    }
  }
}

private struct IntroHeroArtwork: View {
  var body: some View {
    Image("OnboardingIntroReference")
      .resizable()
      .scaledToFit()
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      .padding(.horizontal, 4)
      .accessibilityHidden(true)
  }
}
