import AffineResources
import SwiftUI

struct RolePage: View {
  @Binding var selectedRole: OnboardingRole?

  private let roles = OnboardingRole.allCases

  var body: some View {
    VStack(spacing: 24) {
      Color.clear
        .frame(height: 18)
      VStack(spacing: 18) {
        Text("Which best describes you?")
          .font(.system(size: 26, weight: .bold, design: .rounded))
          .multilineTextAlignment(.center)
        Text("We'll use this to improve your experience and prioritize relevant features.")
          .font(.system(size: 17, weight: .medium))
          .foregroundStyle(AffineColors.textSecondary.color)
          .multilineTextAlignment(.center)
      }
      VStack(spacing: 12) {
        ForEach(roles, id: \.self) { role in
          RoleOption(
            role: role,
            isSelected: selectedRole == role
          ) {
            selectedRole = role
          }
        }
      }
      Spacer()
    }
  }
}

struct FeaturePage: View {
  let feature: OnboardingFeature

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 10)
      VStack(spacing: 12) {
        featureTitle
        Text(LocalizedStringKey(feature.subtitle))
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(AffineColors.textSecondary.color)
          .multilineTextAlignment(.center)
          .lineSpacing(3)
          .padding(.horizontal, 12)
      }

      Spacer(minLength: 18)

      FeatureArtwork(feature: feature)
        .frame(maxWidth: .infinity)
        .frame(height: 360)

      Spacer(minLength: 10)
    }
  }

  private var featureTitle: some View {
    feature.titleSegments.reduce(Text("")) { partial, segment in
      partial
        + Text(LocalizedStringKey(segment.text))
        .foregroundColor(segment.isHighlighted ? AffineColors.buttonPrimary.color : AffineColors.textPrimary.color)
    }
    .font(.system(size: 30, weight: .bold))
    .multilineTextAlignment(.center)
    .fixedSize(horizontal: false, vertical: true)
    .padding(.horizontal, 8)
  }
}

private struct RoleOption: View {
  let role: OnboardingRole
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 16) {
        Image(role.assetName)
          .renderingMode(.template)
          .resizable()
          .scaledToFit()
          .frame(width: 38, height: 38)
          .foregroundStyle(AffineColors.textPrimary.color)
        Text(LocalizedStringKey(role.title))
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(AffineColors.textPrimary.color)
        Spacer()
      }
      .padding(.horizontal, 20)
      .frame(height: 84)
      .background(isSelected ? AffineColors.buttonPrimary.color.opacity(0.12) : AffineColors.layerPureWhite.color)
      .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(
            isSelected ? AffineColors.buttonPrimary.color : AffineColors.layerBorder.color.opacity(0.7),
            lineWidth: isSelected ? 2 : 1
          )
      }
      .shadow(color: .black.opacity(isSelected ? 0.05 : 0.04), radius: 12, x: 0, y: 6)
    }
    .buttonStyle(.plain)
  }
}

private struct FeatureArtwork: View {
  let feature: OnboardingFeature

  var body: some View {
    Image(feature.assetName)
      .resizable()
      .scaledToFit()
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .padding(.horizontal, 4)
      .accessibilityHidden(true)
  }
}

struct PrimaryButton: View {
  let title: String
  var isLoading = false
  var isEnabled = true
  var fontSize: CGFloat = 16
  var height: CGFloat = 54
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        if isLoading {
          ProgressView()
            .tint(AffineColors.layerPureWhite.color)
        }
        Text(LocalizedStringKey(title))
          .font(.system(size: fontSize, weight: .bold))
      }
      .foregroundStyle(AffineColors.layerPureWhite.color)
      .frame(maxWidth: .infinity)
      .frame(height: height)
      .background(isEnabled ? AffineColors.buttonPrimary.color : AffineColors.textPlaceholder.color)
      .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(isLoading || !isEnabled)
    .opacity(isLoading ? 0.8 : (isEnabled ? 1 : 0.72))
  }
}

struct PageDots: View {
  let count: Int
  let selectedIndex: Int

  private let dotHeight: CGFloat = 6
  private let dotSpacing: CGFloat = 12

  var body: some View {
    HStack(spacing: dotSpacing) {
      ForEach(0..<count, id: \.self) { index in
        Capsule()
          .fill(index == selectedIndex ? AffineColors.buttonPrimary.color : AffineColors.buttonPrimary.color.opacity(0.18))
          .frame(height: dotHeight)
          .frame(maxWidth: .infinity)
      }
    }
    .frame(height: dotHeight)
    .animation(.spring(response: 0.35, dampingFraction: 0.8), value: selectedIndex)
  }
}

#Preview {
  OnboardingRootView(onCompleteOnboarding: {})
}
