import AffineResources
import SwiftUI

struct OnboardingRootView: View {
  @ObservedObject var state: OnboardingFlowState
  let onFinish: () -> Void
  let onPurchase: (OnboardingPurchaseType) -> Void

  @State private var pageIndex = 0
  @State private var selectedRole = "Professional"

  private let pages = OnboardingPage.all

  private var isIntroPage: Bool {
    pageIndex == 0
  }

  var body: some View {
    ZStack {
      Color.clear
        .ignoresSafeArea()

      OnboardingBackground(isIntroPage: isIntroPage)

      VStack(spacing: 0) {
        if !isIntroPage {
          header
        }
        TabView(selection: $pageIndex) {
          ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
            pageView(for: page)
              .tag(index)
              .padding(.horizontal, index == 0 ? 0 : 20)
          }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(.spring(response: 0.45, dampingFraction: 0.88), value: pageIndex)

        if !isIntroPage {
          PageDots(count: pages.count, selectedIndex: pageIndex)
            .padding(.bottom, 10)
        }

        footer
      }

      if isIntroPage {
        IntroGridOverlay()
          .ignoresSafeArea()
          .allowsHitTesting(false)
          .zIndex(999)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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
      if isIntroPage {
        IntroFooter {
          goNext()
        }
      } else if let plan = pages[pageIndex].plan {
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
        PrimaryButton(title: "Next") {
          goNext()
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.bottom, isIntroPage ? 22 : 18)
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
  let isIntroPage: Bool

  var body: some View {
    Group {
      if isIntroPage {
        AffineColors.layerPureWhite.color
      } else {
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
      }
    }
    .ignoresSafeArea()
  }
}

private struct IntroPage: View {
  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 18)
      VStack(spacing: 16) {
        VStack(spacing: 6) {
          titleView
          Text("Write, organize, and connect ideas with docs, whiteboards, and AI.")
            .font(.system(size: 15, weight: .medium))
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
    .font(.system(size: 29, weight: .bold))
    .multilineTextAlignment(.center)
  }
}

private struct IntroFooter: View {
  let onGetStarted: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      Button(action: onGetStarted) {
        HStack(spacing: 10) {
          Text("Get Started")
            .font(.system(size: 18, weight: .bold))
          Image(systemName: "arrow.right")
            .font(.system(size: 18, weight: .bold))
        }
        .foregroundStyle(AffineColors.layerPureWhite.color)
        .frame(maxWidth: .infinity)
        .frame(height: 66)
        .background(AffineColors.buttonPrimary.color)
        .clipShape(Capsule())
      }
      .buttonStyle(.plain)

      HStack(spacing: 8) {
        Text("🎁")
          .font(.system(size: 18))
        Text("Have an invite?")
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(AffineColors.textPrimary.color)
      }
      .padding(.bottom, 6)
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

private struct IntroGridOverlay: View {
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
    .ignoresSafeArea()
  }
}

private struct IntroTag: View {
  let label: String
  let tint: Color

  var body: some View {
    Text(label)
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle(AffineColors.textSecondary.color)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(tint)
      .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
  }
}

private struct IntroDocumentCard: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Project Brief")
        .font(.system(size: 15, weight: .bold))
      Text("Overview")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(AffineColors.textSecondary.color)
      introLines(widths: [96, 74, 88])
      Text("Goals")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(AffineColors.textSecondary.color)
      introBulletLines(widths: [102, 92, 84])
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 16)
    .frame(width: 168, height: 174, alignment: .topLeading)
    .background(AffineColors.layerPureWhite.color)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .shadow(color: .black.opacity(0.06), radius: 18, x: 0, y: 10)
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(AffineColors.layerBorder.color.opacity(0.6), lineWidth: 1)
    }
  }

  private func introLines(widths: [CGFloat]) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach(Array(widths.enumerated()), id: \.offset) { _, width in
        RoundedRectangle(cornerRadius: 3, style: .continuous)
          .fill(AffineColors.layerBorder.color.opacity(0.7))
          .frame(width: width, height: 5)
      }
    }
  }

  private func introBulletLines(widths: [CGFloat]) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      ForEach(Array(widths.enumerated()), id: \.offset) { _, width in
        HStack(spacing: 6) {
          Circle()
            .fill(AffineColors.textSecondary.color.opacity(0.55))
            .frame(width: 4, height: 4)
          RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(AffineColors.layerBorder.color.opacity(0.7))
            .frame(width: width, height: 5)
        }
      }
    }
  }
}

private struct IntroSummaryCard: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Image(systemName: "sparkles")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(AffineColors.buttonPrimary.color)
        Text("AI Summary")
          .font(.system(size: 10, weight: .bold))
          .foregroundStyle(AffineColors.buttonPrimary.color)
      }
      Text("A smart, local-first workspace\nthat helps teams write, plan,\nand communicate better.")
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(AffineColors.textPrimary.color)
        .lineSpacing(2)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .frame(width: 170, alignment: .leading)
    .background(AffineColors.buttonPrimary.color.opacity(0.08))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(AffineColors.buttonPrimary.color.opacity(0.12), lineWidth: 1)
    }
    .shadow(color: .black.opacity(0.04), radius: 10, x: 0, y: 6)
  }
}

private struct IntroMindMapCluster: View {
  var body: some View {
    ZStack {
      IntroConnector(start: CGPoint(x: 45, y: 34), end: CGPoint(x: 104, y: 34))
      IntroConnector(start: CGPoint(x: 104, y: 34), end: CGPoint(x: 154, y: 12))
      IntroConnector(start: CGPoint(x: 104, y: 34), end: CGPoint(x: 154, y: 58))
      IntroConnector(start: CGPoint(x: 104, y: 34), end: CGPoint(x: 154, y: 96))
      IntroConnector(start: CGPoint(x: 12, y: 34), end: CGPoint(x: 45, y: 34))
      IntroConnector(start: CGPoint(x: 12, y: 72), end: CGPoint(x: 45, y: 34))

      IntroPill(text: "Product", tint: AffineColors.textLink.color.opacity(0.18))
        .position(x: 74, y: 34)
      IntroPill(text: "Vision", tint: AffineColors.buttonPrimary.color.opacity(0.12))
        .position(x: 18, y: 18)
      IntroPill(text: "Strategy", tint: AffineColors.textPlaceholder.color.opacity(0.22))
        .position(x: 22, y: 72)
      IntroPill(text: "User Value", tint: AffineColors.layerBorder.color.opacity(0.55))
        .position(x: 172, y: 12)
      IntroPill(text: "Growth", tint: AffineColors.textPlaceholder.color.opacity(0.18))
        .position(x: 166, y: 58)
      IntroPill(text: "Features", tint: AffineColors.buttonPrimary.color.opacity(0.12))
        .position(x: 170, y: 96)
    }
    .frame(width: 200, height: 110)
  }
}

private struct IntroChecklistCard: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      IntroChecklistRow(text: "Landing Page")
      IntroChecklistRow(text: "Onboarding Flow")
      IntroChecklistRow(text: "Beta Launch")
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 12)
    .frame(width: 116, alignment: .leading)
    .background(AffineColors.layerPureWhite.color)
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .shadow(color: .black.opacity(0.05), radius: 12, x: 0, y: 8)
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(AffineColors.layerBorder.color.opacity(0.65), lineWidth: 1)
    }
  }
}

private struct IntroChecklistRow: View {
  let text: String

  var body: some View {
    HStack(spacing: 7) {
      RoundedRectangle(cornerRadius: 3, style: .continuous)
        .stroke(AffineColors.layerBorder.color, lineWidth: 1)
        .frame(width: 12, height: 12)
        .overlay {
          Image(systemName: "checkmark")
            .font(.system(size: 7, weight: .bold))
            .foregroundStyle(AffineColors.buttonPrimary.color)
        }
      Text(text)
        .font(.system(size: 10, weight: .medium))
        .foregroundStyle(AffineColors.textPrimary.color)
    }
  }
}

private struct IntroToolbar: View {
  var body: some View {
    HStack(spacing: 14) {
      ForEach(toolbarSymbols, id: \.self) { symbol in
        Image(systemName: symbol)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(AffineColors.textSecondary.color)
      }
      Circle()
        .fill(AffineColors.layerBorder.color.opacity(0.8))
        .frame(width: 1, height: 18)
      Image(systemName: "plus")
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(AffineColors.textSecondary.color)
    }
    .padding(.horizontal, 16)
    .frame(height: 34)
    .background(AffineColors.layerPureWhite.color)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .shadow(color: .black.opacity(0.05), radius: 12, x: 0, y: 8)
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(AffineColors.layerBorder.color.opacity(0.65), lineWidth: 1)
    }
  }

  private var toolbarSymbols: [String] {
    ["cursorarrow", "textformat", "square.on.square", "scribble.variable", "link", "photo"]
  }
}

private struct IntroNodeBadge: View {
  let title: String
  let tint: Color
  let width: CGFloat

  var body: some View {
    Text(title)
      .font(.system(size: 12, weight: .semibold))
      .multilineTextAlignment(.center)
      .foregroundStyle(AffineColors.textPrimary.color)
      .frame(width: width, height: width)
      .background(tint)
      .clipShape(Circle())
  }
}

private struct IntroPill: View {
  let text: String
  let tint: Color

  var body: some View {
    Text(text)
      .font(.system(size: 9, weight: .medium))
      .foregroundStyle(AffineColors.textPrimary.color)
      .padding(.horizontal, 8)
      .padding(.vertical, 5)
      .background(tint)
      .clipShape(Capsule())
  }
}

private struct IntroConnector: View {
  let start: CGPoint
  let end: CGPoint

  var body: some View {
    Path { path in
      path.move(to: start)
      path.addCurve(
        to: end,
        control1: CGPoint(x: (start.x + end.x) / 2, y: start.y),
        control2: CGPoint(x: (start.x + end.x) / 2, y: end.y)
      )
    }
    .stroke(AffineColors.layerBorder.color.opacity(0.9), lineWidth: 1.2)
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
