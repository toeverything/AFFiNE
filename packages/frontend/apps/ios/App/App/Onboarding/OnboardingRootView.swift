import AffineResources
import SwiftUI

struct OnboardingRootView: View {
  @ObservedObject var state: OnboardingFlowState
  let onFinish: () -> Void
  let onPurchase: (OnboardingPurchaseType) -> Void

  @State private var pageIndex = 0
  @State private var selectedRole = "Professional"

  private let pages = OnboardingPage.all

  var body: some View {
    ZStack {
      OnboardingBackground()
      VStack(spacing: 0) {
        header
        TabView(selection: $pageIndex) {
          ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
            pageView(for: page)
              .tag(index)
              .padding(.horizontal, 20)
          }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(.spring(response: 0.45, dampingFraction: 0.88), value: pageIndex)

        PageDots(count: pages.count, selectedIndex: pageIndex)
          .padding(.bottom, 10)

        footer
      }
    }
    .foregroundStyle(AffineColors.textPrimary.color)
  }

  private var header: some View {
    HStack {
      Button {
        goBack()
      } label: {
        Image(systemName: "chevron.left")
          .font(.system(size: 16, weight: .semibold))
          .frame(width: 40, height: 40)
          .foregroundStyle(AffineColors.textSecondary.color)
      }
      .opacity(pageIndex > 0 ? 1 : 0)
      .disabled(pageIndex == 0)

      Spacer()

      Button {
        onFinish()
      } label: {
        Text("Skip")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(AffineColors.textSecondary.color)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
      }
    }
    .padding(.horizontal, 12)
    .padding(.top, 8)
  }

  @ViewBuilder
  private func pageView(for page: OnboardingPage) -> some View {
    switch page {
    case .intro:
      IntroPage()
    case .role:
      RolePage(selectedRole: $selectedRole)
    case let .feature(feature):
      FeaturePage(feature: feature)
    case let .paywall(plan):
      PlanPage(plan: plan)
    }
  }

  private var footer: some View {
    VStack(spacing: 10) {
      if let plan = pages[pageIndex].plan {
        PrimaryButton(
          title: plan.buttonTitle,
          isLoading: state.isProcessingPurchase
        ) {
          onPurchase(plan.purchaseType)
        }
        Button {
          onFinish()
        } label: {
          Text("Not now")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(AffineColors.textSecondary.color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
        }
        .disabled(state.isProcessingPurchase)
      } else {
        PrimaryButton(title: pageIndex == 0 ? "Get Started" : "Next") {
          goNext()
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.bottom, 18)
  }

  private func goNext() {
    guard pageIndex < pages.count - 1 else {
      onFinish()
      return
    }
    pageIndex += 1
  }

  private func goBack() {
    guard pageIndex > 0 else { return }
    pageIndex -= 1
  }
}

private enum OnboardingPage {
  case intro
  case role
  case feature(OnboardingFeature)
  case paywall(OnboardingPlan)

  static let all: [OnboardingPage] = [
    .intro,
    .role,
    .feature(.clearDocs),
    .feature(.biggerPicture),
    .feature(.multipleViews),
    .feature(.everyDevice),
    .feature(.ai),
    .paywall(.pro),
    .paywall(.lite),
    .paywall(.ai),
  ]

  var plan: OnboardingPlan? {
    if case let .paywall(plan) = self { return plan }
    return nil
  }
}

private enum OnboardingFeature: CaseIterable {
  case clearDocs
  case biggerPicture
  case multipleViews
  case everyDevice
  case ai

  var title: String {
    switch self {
    case .clearDocs: "Turn ideas into Clear Docs"
    case .biggerPicture: "See the Bigger Picture"
    case .multipleViews: "One idea, Multiple Views"
    case .everyDevice: "Your Work, Every Device"
    case .ai: "Get More Done with AI"
    }
  }

  var subtitle: String {
    switch self {
    case .clearDocs: "Tasks, notes, mindmaps, and docs in one flexible workspace."
    case .biggerPicture: "Connect ideas, docs, and projects with a visual knowledge graph."
    case .multipleViews: "Bring structure to your work with docs, tables, boards, and canvases."
    case .everyDevice: "Keep writing, planning, and thinking across iPhone and desktop."
    case .ai: "Draft, summarize, translate, and brainstorm faster with AFFiNE AI."
    }
  }

  var symbol: String {
    switch self {
    case .clearDocs: "doc.text"
    case .biggerPicture: "point.3.connected.trianglepath.dotted"
    case .multipleViews: "square.grid.2x2"
    case .everyDevice: "iphone.and.arrow.forward"
    case .ai: "sparkles"
    }
  }
}

private enum OnboardingPlan {
  case pro
  case lite
  case ai

  var name: String {
    switch self {
    case .pro: "PRO"
    case .lite: "LITE"
    case .ai: "AFFiNE AI"
    }
  }

  var title: String {
    switch self {
    case .pro: "Best for serious creators"
    case .lite: "Start light, grow later"
    case .ai: "Your thinking partner"
    }
  }

  var price: String {
    switch self {
    case .pro: "$8.75 / mo"
    case .lite: "$6.75 / mo"
    case .ai: "$8.9 / mo"
    }
  }

  var footnote: String {
    switch self {
    case .pro, .lite: "billed annually"
    case .ai: "AI plan billed annually"
    }
  }

  var badge: String? {
    switch self {
    case .pro: "BEST VALUE"
    case .lite: nil
    case .ai: "AI BOOST"
    }
  }

  var buttonTitle: String {
    switch self {
    case .pro: "Start Pro Free Trial"
    case .lite: "Start Lite Free Trial"
    case .ai: "Start AI Free Trial"
    }
  }

  var purchaseType: OnboardingPurchaseType {
    switch self {
    case .pro, .lite: .pro
    case .ai: .ai
    }
  }

  var features: [String] {
    switch self {
    case .pro:
      [
        "Unlimited workspace history",
        "Larger cloud storage quota",
        "Advanced collaboration controls",
        "Priority AFFiNE Cloud features",
        "Best for full-time personal systems",
      ]
    case .lite:
      [
        "Essential cloud sync",
        "Reliable backup across devices",
        "Core collaboration features",
        "Flexible upgrade path",
        "Great for focused personal work",
      ]
    case .ai:
      [
        "AI writing and summarization",
        "Smart translation and polishing",
        "Brainstorming inside your docs",
        "Faster research from context",
        "Designed for creative momentum",
      ]
    }
  }
}

private struct OnboardingBackground: View {
  var body: some View {
    LinearGradient(
      colors: [
        AffineColors.layerBackgroundPrimary.color,
        AffineColors.layerBackgroundSecondary.color,
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
    .overlay(alignment: .topTrailing) {
      Circle()
        .fill(AffineColors.buttonPrimary.color.opacity(0.1))
        .frame(width: 220, height: 220)
        .blur(radius: 24)
        .offset(x: 80, y: -80)
    }
    .overlay(alignment: .bottomLeading) {
      Circle()
        .fill(AffineColors.textLink.color.opacity(0.08))
        .frame(width: 260, height: 260)
        .blur(radius: 30)
        .offset(x: -110, y: 90)
    }
    .ignoresSafeArea()
  }
}

private struct IntroPage: View {
  var body: some View {
    VStack(spacing: 24) {
      Spacer(minLength: 12)
      WorkspaceGalaxy()
        .frame(height: 310)
      VStack(spacing: 12) {
        Text("Everything, in One Workspace")
          .font(.system(size: 30, weight: .bold, design: .rounded))
          .multilineTextAlignment(.center)
        Text("Write, plan, whiteboard, and organize your ideas with AFFiNE.")
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(AffineColors.textSecondary.color)
          .multilineTextAlignment(.center)
          .lineSpacing(3)
      }
      Spacer(minLength: 4)
    }
  }
}

private struct RolePage: View {
  @Binding var selectedRole: String

  private let roles = ["Student", "Educator", "Professional", "Other"]

  var body: some View {
    VStack(spacing: 24) {
      Spacer(minLength: 20)
      VStack(spacing: 10) {
        Text("Which best describes you?")
          .font(.system(size: 24, weight: .bold, design: .rounded))
          .multilineTextAlignment(.center)
        Text("This helps AFFiNE shape your first workspace experience.")
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(AffineColors.textSecondary.color)
          .multilineTextAlignment(.center)
      }
      VStack(spacing: 12) {
        ForEach(roles, id: \.self) { role in
          RoleOption(
            title: role,
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

private struct FeaturePage: View {
  let feature: OnboardingFeature

  var body: some View {
    VStack(spacing: 26) {
      Spacer(minLength: 16)
      DeviceShowcase(symbol: feature.symbol)
        .frame(height: 330)
      VStack(spacing: 10) {
        Text(feature.title)
          .font(.system(size: 27, weight: .bold, design: .rounded))
          .multilineTextAlignment(.center)
        Text(feature.subtitle)
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(AffineColors.textSecondary.color)
          .multilineTextAlignment(.center)
          .lineSpacing(4)
      }
      Spacer(minLength: 4)
    }
  }
}

private struct PlanPage: View {
  let plan: OnboardingPlan

  var body: some View {
    VStack(spacing: 18) {
      Spacer(minLength: 6)
      Text("Individual Plans")
        .font(.system(size: 28, weight: .bold, design: .rounded))
      VStack(alignment: .leading, spacing: 18) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
              Text(plan.name)
                .font(.system(size: 22, weight: .black, design: .rounded))
              if let badge = plan.badge {
                Text(badge)
                  .font(.system(size: 10, weight: .bold))
                  .foregroundStyle(AffineColors.layerPureWhite.color)
                  .padding(.horizontal, 8)
                  .padding(.vertical, 4)
                  .background(AffineColors.buttonPrimary.color)
                  .clipShape(Capsule())
              }
            }
            Text(plan.title)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(AffineColors.textSecondary.color)
          }
          Spacer()
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(plan.price)
            .font(.system(size: 31, weight: .black, design: .rounded))
          Text(plan.footnote)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(AffineColors.textSecondary.color)
        }
        Divider()
          .overlay(AffineColors.layerBorder.color)
        VStack(alignment: .leading, spacing: 13) {
          ForEach(plan.features, id: \.self) { feature in
            HStack(alignment: .top, spacing: 10) {
              Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(AffineColors.buttonPrimary.color)
              Text(feature)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AffineColors.textPrimary.color)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
      }
      .padding(22)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(AffineColors.layerBackgroundPrimary.color)
      .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 28, style: .continuous)
          .stroke(AffineColors.layerBorder.color, lineWidth: 1)
      }
      .shadow(color: .black.opacity(0.08), radius: 24, x: 0, y: 12)
      Text("Tap the trial button to sign in first when needed, then continue with secure App Store purchase.")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(AffineColors.textSecondary.color)
        .multilineTextAlignment(.center)
      Spacer(minLength: 4)
    }
  }
}

private struct RoleOption: View {
  let title: String
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: iconName)
          .font(.system(size: 18, weight: .semibold))
          .frame(width: 30, height: 30)
          .foregroundStyle(isSelected ? AffineColors.buttonPrimary.color : AffineColors.textSecondary.color)
        Text(title)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(AffineColors.textPrimary.color)
        Spacer()
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(isSelected ? AffineColors.buttonPrimary.color : AffineColors.textPlaceholder.color)
      }
      .padding(.horizontal, 16)
      .frame(height: 62)
      .background(isSelected ? AffineColors.buttonPrimary.color.opacity(0.12) : AffineColors.layerBackgroundPrimary.color)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(isSelected ? AffineColors.buttonPrimary.color : AffineColors.layerBorder.color, lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
  }

  private var iconName: String {
    switch title {
    case "Student": "graduationcap"
    case "Educator": "person.2"
    case "Professional": "briefcase"
    default: "person"
    }
  }
}

private struct WorkspaceGalaxy: View {
  private let items: [(String, String)] = [
    ("doc.text", "Docs"),
    ("checklist", "Tasks"),
    ("rectangle.3.group", "Boards"),
    ("sparkles", "AI"),
    ("calendar", "Plans"),
    ("point.3.connected.trianglepath.dotted", "Graph"),
    ("square.grid.2x2", "Views"),
    ("bubble.left.and.bubble.right", "Teams"),
  ]

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 34, style: .continuous)
        .fill(AffineColors.layerBackgroundPrimary.color.opacity(0.82))
        .shadow(color: .black.opacity(0.08), radius: 24, x: 0, y: 12)
      ForEach(Array(items.enumerated()), id: \.offset) { index, item in
        FloatingTile(symbol: item.0, title: item.1)
          .offset(offset(for: index))
      }
    }
  }

  private func offset(for index: Int) -> CGSize {
    let positions = [
      CGSize(width: -92, height: -94),
      CGSize(width: 8, height: -112),
      CGSize(width: 96, height: -58),
      CGSize(width: -104, height: 4),
      CGSize(width: 86, height: 34),
      CGSize(width: -46, height: 92),
      CGSize(width: 38, height: 92),
      CGSize(width: 0, height: 0),
    ]
    return positions[index]
  }
}

private struct FloatingTile: View {
  let symbol: String
  let title: String

  var body: some View {
    VStack(spacing: 6) {
      Image(systemName: symbol)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(AffineColors.buttonPrimary.color)
      Text(title)
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(AffineColors.textSecondary.color)
    }
    .frame(width: 76, height: 64)
    .background(AffineColors.layerBackgroundSecondary.color)
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(AffineColors.layerBorder.color.opacity(0.75), lineWidth: 1)
    }
  }
}

private struct DeviceShowcase: View {
  let symbol: String

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 34, style: .continuous)
        .fill(AffineColors.layerBackgroundPrimary.color.opacity(0.88))
        .shadow(color: .black.opacity(0.08), radius: 24, x: 0, y: 12)
      HStack(spacing: 12) {
        MockDocumentCard(title: "Idea", rows: 4)
          .rotationEffect(.degrees(-5))
          .offset(y: 18)
        PhoneMock(symbol: symbol)
        MockDocumentCard(title: "Plan", rows: 5)
          .rotationEffect(.degrees(5))
          .offset(y: -18)
      }
    }
  }
}

private struct PhoneMock: View {
  let symbol: String

  var body: some View {
    VStack(spacing: 12) {
      RoundedRectangle(cornerRadius: 3)
        .fill(AffineColors.textPlaceholder.color.opacity(0.35))
        .frame(width: 38, height: 5)
      Spacer()
      Image(systemName: symbol)
        .font(.system(size: 42, weight: .bold))
        .foregroundStyle(AffineColors.buttonPrimary.color)
      VStack(spacing: 8) {
        ForEach(0..<4, id: \.self) { index in
          RoundedRectangle(cornerRadius: 4)
            .fill(AffineColors.layerBorder.color.opacity(index == 0 ? 0.9 : 0.55))
            .frame(height: index == 0 ? 12 : 8)
        }
      }
      Spacer()
    }
    .padding(16)
    .frame(width: 128, height: 246)
    .background(AffineColors.layerBackgroundSecondary.color)
    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 30, style: .continuous)
        .stroke(AffineColors.textPrimary.color.opacity(0.16), lineWidth: 6)
    }
  }
}

private struct MockDocumentCard: View {
  let title: String
  let rows: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(AffineColors.textSecondary.color)
      ForEach(0..<rows, id: \.self) { index in
        RoundedRectangle(cornerRadius: 4)
          .fill(index == 0 ? AffineColors.buttonPrimary.color.opacity(0.35) : AffineColors.layerBorder.color.opacity(0.7))
          .frame(width: index.isMultiple(of: 2) ? 78 : 58, height: 8)
      }
      Spacer(minLength: 0)
    }
    .padding(14)
    .frame(width: 104, height: 154)
    .background(AffineColors.layerBackgroundSecondary.color)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(AffineColors.layerBorder.color, lineWidth: 1)
    }
  }
}

private struct PrimaryButton: View {
  let title: String
  var isLoading = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        if isLoading {
          ProgressView()
            .tint(AffineColors.layerPureWhite.color)
        }
        Text(title)
          .font(.system(size: 16, weight: .bold))
      }
      .foregroundStyle(AffineColors.layerPureWhite.color)
      .frame(maxWidth: .infinity)
      .frame(height: 54)
      .background(AffineColors.buttonPrimary.color)
      .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(isLoading)
    .opacity(isLoading ? 0.8 : 1)
  }
}

private struct PageDots: View {
  let count: Int
  let selectedIndex: Int

  var body: some View {
    HStack(spacing: 6) {
      ForEach(0..<count, id: \.self) { index in
        Capsule()
          .fill(index == selectedIndex ? AffineColors.buttonPrimary.color : AffineColors.layerBorder.color)
          .frame(width: index == selectedIndex ? 18 : 6, height: 6)
      }
    }
    .animation(.spring(response: 0.35, dampingFraction: 0.8), value: selectedIndex)
  }
}

#Preview {
  OnboardingRootView(
    state: OnboardingFlowState(),
    onFinish: {},
    onPurchase: { _ in }
  )
}
