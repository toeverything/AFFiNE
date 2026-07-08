import AffineResources
import SwiftUI

struct OnboardingRootView: View {
  @ObservedObject var state: OnboardingFlowState
  let onFinish: () -> Void
  let onPurchase: (OnboardingPurchaseType) -> Void
  let onRestorePurchases: () -> Void

  @State private var pageIndex = 0
  @State private var selectedRole: OnboardingRole?
  @State private var selectedPaywallPlan: OnboardingPlan = .pro
  @State private var hasInitializedPaywallSelection = false

  private let pages = OnboardingPage.all

  private var isIntroPage: Bool {
    pages[pageIndex].isIntro
  }

  private var isRolePage: Bool {
    if case .role = pages[pageIndex] { return true }
    return false
  }

  private var isPaywallPage: Bool {
    pages[pageIndex].isPaywall
  }

  private var shouldShowHeader: Bool {
    !isIntroPage && !isPaywallPage
  }

  private var isNextEnabled: Bool {
    !isRolePage || selectedRole != nil
  }

  private var progressPageCount: Int {
    pages.filter(\.showsProgress).count
  }

  private var progressIndex: Int {
    let visibleProgressCount = pages.prefix(pageIndex + 1).filter(\.showsProgress).count
    return max(visibleProgressCount - 1, 0)
  }

  private var pageSelection: Binding<Int> {
    Binding(
      get: { pageIndex },
      set: { newValue in
        guard shouldAllowPageChange(from: pageIndex, to: newValue) else { return }
        pageIndex = newValue
      }
    )
  }

  var body: some View {
    ZStack {
      Color.clear
        .ignoresSafeArea()

      OnboardingBackground(isIntroPage: isIntroPage, isPaywallPage: isPaywallPage)

      VStack(spacing: 0) {
        if shouldShowHeader {
          header
        }

        pageContainer

        footer
      }

      if isIntroPage || isPaywallPage {
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
    let sideInset: CGFloat = 12
    let backButtonSize: CGFloat = 40
    let pageDotsHorizontalInset = sideInset + backButtonSize

    return ZStack(alignment: .leading) {
      PageDots(count: progressPageCount, selectedIndex: progressIndex)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, pageDotsHorizontalInset)

      Button {
        goBack()
      } label: {
        Image(systemName: "chevron.left")
          .font(.system(size: 16, weight: .semibold))
          .frame(width: backButtonSize, height: backButtonSize)
          .foregroundStyle(AffineColors.textSecondary.color)
      }
      .padding(.leading, sideInset)
      .opacity(pageIndex > 0 ? 1 : 0)
      .disabled(pageIndex == 0)
    }
    .frame(height: backButtonSize)
    .padding(.top, 8)
  }

  @ViewBuilder
  private var pageContainer: some View {
    if isPaywallPage {
      pageView(for: pages[pageIndex])
        .padding(.horizontal, horizontalPadding(for: pages[pageIndex]))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      TabView(selection: pageSelection) {
        ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
          pageView(for: page)
            .tag(index)
            .padding(.horizontal, horizontalPadding(for: page))
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
      .animation(.spring(response: 0.30, dampingFraction: 0.88), value: pageIndex)
    }
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
    case .paywall:
      PaywallCarouselPage(
        selectedPlan: $selectedPaywallPlan,
        isProcessingPurchase: state.isProcessingPurchase,
        onPurchase: { plan in
          onPurchase(plan.purchaseType)
        },
        onRestorePurchases: onRestorePurchases,
        onSkip: onFinish,
        onInitialized: {
          guard !hasInitializedPaywallSelection else { return }
          hasInitializedPaywallSelection = true
          selectedPaywallPlan = .pro
        }
      )
    }
  }

  private var footer: some View {
    VStack(spacing: 10) {
      if isIntroPage {
        IntroFooter {
          goNext()
        }
      } else if !isPaywallPage {
        PrimaryButton(title: "Next", isEnabled: isNextEnabled, fontSize: 18) {
          goNext()
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.bottom, isIntroPage ? 22 : (isPaywallPage ? 0 : 18))
  }

  private func goNext() {
    guard isNextEnabled else { return }
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

  private func shouldAllowPageChange(from currentIndex: Int, to newIndex: Int) -> Bool {
    guard newIndex != currentIndex else { return true }
    guard pages.indices.contains(currentIndex) else { return false }
    guard !pages[currentIndex].isPaywall else { return false }
    guard newIndex > currentIndex else { return true }
    return canAdvance(from: currentIndex)
  }

  private func canAdvance(from index: Int) -> Bool {
    guard pages.indices.contains(index) else { return false }
    if case .role = pages[index] {
      return selectedRole != nil
    }
    return true
  }

  private func horizontalPadding(for page: OnboardingPage) -> CGFloat {
    if page.isIntro || page.isPaywall {
      return 0
    }
    return 20
  }
}

private enum OnboardingPage {
  case intro
  case role
  case feature(OnboardingFeature)
  case paywall

  static let all: [OnboardingPage] = [
    .intro,
    .role,
    .feature(.clearDocs),
    .feature(.biggerPicture),
    .feature(.multipleViews),
    .feature(.everyDevice),
    .feature(.ai),
    .paywall,
  ]

  var isIntro: Bool {
    if case .intro = self { return true }
    return false
  }

  var isPaywall: Bool {
    if case .paywall = self { return true }
    return false
  }

  var showsProgress: Bool {
    switch self {
    case .role, .feature:
      return true
    case .intro, .paywall:
      return false
    }
  }
}

private enum OnboardingRole: String, CaseIterable {
  case student = "Student"
  case educator = "Educator"
  case professional = "Professional"
  case other = "Other"

  var title: String {
    rawValue
  }

  var assetName: String {
    switch self {
    case .student: "OnboardingRoleStudent"
    case .educator: "OnboardingRoleEducator"
    case .professional: "OnboardingRoleProfessional"
    case .other: "OnboardingRoleOther"
    }
  }
}

private enum OnboardingFeature: CaseIterable {
  case clearDocs
  case biggerPicture
  case multipleViews
  case everyDevice
  case ai

  var titleSegments: [(text: String, isHighlighted: Bool)] {
    switch self {
    case .clearDocs:
      [("Turn Ideas into ", false), ("Clear Docs", true)]
    case .biggerPicture:
      [("See the ", false), ("Bigger Picture", true)]
    case .multipleViews:
      [("One Idea, ", false), ("Multiple Views", true)]
    case .everyDevice:
      [("Your Work, ", false), ("Every Device", true)]
    case .ai:
      [("Get More Done with ", false), ("AI", true)]
    }
  }

  var subtitle: String {
    switch self {
    case .clearDocs: "Capture notes, meetings, and plans in one focused workspace."
    case .biggerPicture: "Connect ideas, plans, and knowledge visually."
    case .multipleViews: "Bring notes, whiteboards, and projects together in one workspace."
    case .everyDevice: "Stay synced across desktop, web, and mobile devices."
    case .ai: "Write, summarize, and structure ideas in seconds."
    }
  }

  var assetName: String {
    switch self {
    case .clearDocs: "OnboardingFeatureClearDocs"
    case .biggerPicture: "OnboardingFeatureBiggerPicture"
    case .multipleViews: "OnboardingFeatureMultipleViews"
    case .everyDevice: "OnboardingFeatureEveryDevice"
    case .ai: "OnboardingFeatureAI"
    }
  }
}

private enum OnboardingPlan: String, CaseIterable {
  case pro
  case lite
  case ai

  var headerName: String {
    switch self {
    case .pro: "Pro"
    case .lite: "LITE"
    case .ai: "AFFINE AI"
    }
  }

  var badge: String? {
    switch self {
    case .pro: "BEST FOR YOU"
    case .lite: nil
    case .ai: nil
    }
  }

  var priceValue: String {
    switch self {
    case .pro: "$81"
    case .lite: "$6.75"
    case .ai: "$8.9"
    }
  }

  var priceSuffix: String {
    switch self {
    case .pro: "/year"
    case .lite, .ai: "/mo, billed annually"
    }
  }

  var description: String {
    switch self {
    case .pro: "Keep your knowledge available everywhere."
    case .lite: "For people who want their workspace available everywhere."
    case .ai: "For people who want to create, organize faster with AI."
    }
  }

  var buttonTitle: String {
    switch self {
    case .pro, .lite, .ai: "Start Your Pro Free Trial"
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
        "Upload files larger than 10 MB",
        "Sync docs and boards across all devices",
        "Access your workspace on Mac, Windows, Linux, Web, iPhone, and Android",
        "Secure cloud backup for your content",
        "Everything stays up to date, wherever you work",
      ]
    case .lite:
      [
        "Sync docs and boards across all devices",
        "Access AFFiNE on Mac, Windows, Linux, Web, iPhone, and Android",
        "Upload files larger than 10 MB",
        "Secure cloud backup for your content",
        "Pick up where you left off, anytime",
      ]
    case .ai:
      [
        "Generate articles, notes, and content in seconds",
        "Rewrite, improve, and translate your writing",
        "Turn ideas into visuals, mind maps, and presentations",
        "Chat with your documents and knowledge",
        "AI-powered organization and insights",
      ]
    }
  }
}

private struct OnboardingBackground: View {
  let isIntroPage: Bool
  let isPaywallPage: Bool

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

private struct IntroPage: View {
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

private struct IntroFooter: View {
  let onGetStarted: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      Button(action: onGetStarted) {
        HStack(spacing: 10) {
          Text("Get Started")
            .font(.system(size: 20, weight: .bold))
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
  @Binding var selectedRole: OnboardingRole?

  private let roles = OnboardingRole.allCases

  var body: some View {
    VStack(spacing: 24) {
      Spacer(minLength: 8)
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

private struct FeaturePage: View {
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

private struct PaywallCarouselPage: View {
  @Environment(\.openURL) private var openURL

  @Binding var selectedPlan: OnboardingPlan
  let isProcessingPurchase: Bool
  let onPurchase: (OnboardingPlan) -> Void
  let onRestorePurchases: () -> Void
  let onSkip: () -> Void
  let onInitialized: () -> Void

  private let plans: [OnboardingPlan] = [.lite, .pro, .ai]
  private let visibleSlots = [-2, -1, 0, 1, 2]
  private let settleAnimation = Animation.spring(response: 0.32, dampingFraction: 0.9)
  private let settleDuration = 0.24

  @State private var currentPlanIndex = 1
  @State private var settlingOffset: CGFloat = 0
  @State private var isSettling = false
  @GestureState private var dragTranslation: CGFloat = 0

  private var activePlanIndex: Int {
    currentPlanIndex
  }

  var body: some View {
    VStack(spacing: 0) {
      paywallHeader
        .padding(.top, 14)
        .padding(.horizontal, 18)

      Spacer(minLength: 18)

      Text("Individual Plans")
        .font(.system(size: 30, weight: .black))
        .foregroundStyle(AffineColors.textPrimary.color)

      Spacer(minLength: 10)

      GeometryReader { geometry in
        let cardWidth = min(max(geometry.size.width - 116, 244), 288)
        let cardSpacing: CGFloat = 8
        let step = cardWidth + cardSpacing
        let totalOffset = settlingOffset + dragTranslation
        let normalizedOffset = totalOffset / step

        ZStack {
          ForEach(visibleSlots, id: \.self) { relativeSlot in
            let position = CGFloat(relativeSlot) + normalizedOffset
            let distance = abs(position)
            let clampedDistance = min(distance, 2)
            let horizontalDirection: CGFloat = position > 0 ? 1 : (position < 0 ? -1 : 0)
            let scale = max(0.94, 1 - clampedDistance * 0.038)
            let opacity = max(0.8, 1 - clampedDistance * 0.11)
            let sideSpread = clampedDistance * 2
            let verticalOffset = clampedDistance * 16
            let rotation = Double(position * 6)
            let shadowOpacity = Double(max(0.09, 0.2 - clampedDistance * 0.05))
            let shadowRadius = max(20, 30 - clampedDistance * 5)
            let shadowYOffset = max(12, 18 - clampedDistance * 2.5)

            PaywallCard(plan: plan(for: relativeSlot))
              .frame(width: cardWidth, height: geometry.size.height)
              .scaleEffect(scale)
              .rotation3DEffect(
                .degrees(rotation),
                axis: (x: 0, y: 1, z: 0),
                perspective: 0.82
              )
              .opacity(opacity)
              .offset(
                x: position * step + horizontalDirection * sideSpread,
                y: verticalOffset
              )
              .shadow(color: .black.opacity(shadowOpacity), radius: shadowRadius, x: 0, y: shadowYOffset)
              .zIndex(10 - distance)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .allowsHitTesting(!isSettling)
        .highPriorityGesture(carouselDragGesture(step: step))
      }
      .frame(height: 494)

      HStack(spacing: 9) {
        ForEach(0..<plans.count, id: \.self) { index in
          Circle()
            .fill(index == activePlanIndex ? AffineColors.buttonPrimary.color : AffineColors.buttonPrimary.color.opacity(0.18))
            .frame(width: 9, height: 9)
        }
      }
      .padding(.top, 10)

      PaywallFooterLinks(onSkip: onSkip)
        .padding(.top, 8)
        .padding(.horizontal, 28)

      PrimaryButton(
        title: selectedPlan.buttonTitle,
        isLoading: isProcessingPurchase,
        fontSize: 18,
        height: 58
      ) {
        onPurchase(selectedPlan)
      }
      .padding(.horizontal, 28)
      .padding(.top, 10)

      PaywallLegalLinks(
        onOpenTerms: { openLegalURL("https://affine.pro/terms") },
        onOpenPrivacy: { openLegalURL("https://affine.pro/privacy") },
        onOpenSubscriptionTerms: { openLegalURL("https://affine.pro/terms/#subscription") },
        onRestore: onRestorePurchases
      )
        .padding(.top, 10)
        .padding(.bottom, 8)
        .padding(.horizontal, 28)
    }
    .onAppear {
      onInitialized()
      currentPlanIndex = selectedIndex(for: selectedPlan)
      selectedPlan = plans[currentPlanIndex]
      settlingOffset = 0
    }
  }

  private var paywallHeader: some View {
    HStack {
      Spacer()
      Button(action: onSkip) {
        Image(systemName: "xmark")
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(AffineColors.textSecondary.color)
          .frame(width: 32, height: 32)
      }
      .buttonStyle(.plain)
    }
  }

  private func carouselDragGesture(step: CGFloat) -> some Gesture {
    DragGesture(minimumDistance: 12)
      .updating($dragTranslation) { value, state, _ in
        state = value.translation.width
      }
      .onEnded { value in
        guard !isSettling else { return }

        settlingOffset = value.translation.width
        let threshold = step * 0.18
        let projectedOffset = value.predictedEndTranslation.width

        if projectedOffset < -threshold {
          settleCarousel(step: step, direction: 1)
        } else if projectedOffset > threshold {
          settleCarousel(step: step, direction: -1)
        } else {
          withAnimation(settleAnimation) {
            settlingOffset = 0
          }
        }
      }
  }

  private func settleCarousel(step: CGFloat, direction: Int) {
    isSettling = true

    withAnimation(settleAnimation) {
      settlingOffset = direction > 0 ? -step : step
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + settleDuration) {
      let nextIndex = wrappedIndex(currentPlanIndex + direction)
      var transaction = Transaction()
      transaction.disablesAnimations = true

      withTransaction(transaction) {
        currentPlanIndex = nextIndex
        selectedPlan = plans[nextIndex]
        settlingOffset = 0
      }

      isSettling = false
    }
  }

  private func selectedIndex(for plan: OnboardingPlan) -> Int {
    plans.firstIndex(of: plan) ?? 1
  }

  private func wrappedIndex(_ index: Int) -> Int {
    let count = plans.count
    let remainder = index % count
    return remainder >= 0 ? remainder : remainder + count
  }

  private func plan(for relativeSlot: Int) -> OnboardingPlan {
    plans[wrappedIndex(currentPlanIndex + relativeSlot)]
  }

  private func openLegalURL(_ string: String) {
    guard let url = URL(string: string) else { return }
    openURL(url)
  }
}

private struct PaywallCard: View {
  let plan: OnboardingPlan

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(LocalizedStringKey(plan.headerName))
        .font(.system(size: 28, weight: .black))
        .foregroundStyle(AffineColors.textPrimary.color)
        .padding(.bottom, 16)

      HStack(alignment: .lastTextBaseline, spacing: 5) {
        Text(LocalizedStringKey(plan.priceValue))
          .font(.system(size: 30, weight: .black))
          .foregroundStyle(AffineColors.textPrimary.color)
        Text(LocalizedStringKey(plan.priceSuffix))
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(AffineColors.textPrimary.color)
      }

      Text(LocalizedStringKey(plan.description))
        .font(.system(size: 15.5, weight: .medium))
        .foregroundStyle(AffineColors.textSecondary.color)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 7)
        .padding(.bottom, 20)

      Divider()
        .overlay(AffineColors.layerBorder.color.opacity(0.55))
        .padding(.bottom, 20)

      VStack(alignment: .leading, spacing: 17) {
        ForEach(plan.features, id: \.self) { feature in
          PaywallFeatureRow(text: feature)
        }
      }

      Spacer(minLength: 0)
    }
    .padding(.horizontal, 23)
    .padding(.top, 22)
    .padding(.bottom, 20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(AffineColors.layerPureWhite.color)
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    .shadow(color: AffineColors.buttonPrimary.color.opacity(0.12), radius: 22, x: 0, y: 10)
    .shadow(color: .black.opacity(0.06), radius: 16, x: 0, y: 5)
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(AffineColors.buttonPrimary.color.opacity(0.98), lineWidth: 1.45)
    }
    .overlay(alignment: .topTrailing) {
      if let badge = plan.badge {
        Text(LocalizedStringKey(badge))
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(AffineColors.layerPureWhite.color)
          .padding(.horizontal, 16)
          .padding(.vertical, 7)
          .background(AffineColors.buttonPrimary.color)
          .clipShape(Capsule())
          .shadow(color: AffineColors.buttonPrimary.color.opacity(0.22), radius: 12, x: 0, y: 5)
          .offset(x: -8, y: -15)
      }
    }
  }
}

private struct PaywallFeatureRow: View {
  let text: String

  var body: some View {
    HStack(alignment: .top, spacing: 11) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 15, weight: .bold))
        .foregroundStyle(AffineColors.buttonPrimary.color)
        .padding(.top, 2)

      Text(LocalizedStringKey(text))
        .font(.system(size: 15.5, weight: .medium))
        .foregroundStyle(AffineColors.textPrimary.color)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct PaywallFooterLinks: View {
  let onSkip: () -> Void

  var body: some View {
    Button(action: onSkip) {
      Text("Cancel Anytime")
        .font(.system(size: 16.5, weight: .medium))
        .foregroundStyle(AffineColors.textPrimary.color)
    }
    .buttonStyle(.plain)
  }
}

private struct PaywallLegalLinks: View {
  let onOpenTerms: () -> Void
  let onOpenPrivacy: () -> Void
  let onOpenSubscriptionTerms: () -> Void
  let onRestore: () -> Void

  var body: some View {
    ViewThatFits {
      HStack(spacing: 0) {
        legalButton(title: "Terms of Use", action: onOpenTerms)
        separator
        legalButton(title: "Privacy Policy", action: onOpenPrivacy)
        separator
        legalButton(title: "Subscription Terms", action: onOpenSubscriptionTerms)
        separator
        legalButton(title: "Restore", action: onRestore)
      }

      VStack(spacing: 6) {
        HStack(spacing: 0) {
          legalButton(title: "Terms of Use", action: onOpenTerms)
          separator
          legalButton(title: "Privacy Policy", action: onOpenPrivacy)
        }

        HStack(spacing: 0) {
          legalButton(title: "Subscription Terms", action: onOpenSubscriptionTerms)
          separator
          legalButton(title: "Restore", action: onRestore)
        }
      }
    }
    .font(.system(size: 12.5, weight: .medium))
    .foregroundStyle(AffineColors.textSecondary.color)
  }

  private var separator: some View {
    Text(" | ")
      .foregroundStyle(AffineColors.textSecondary.color)
  }

  private func legalButton(title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .foregroundStyle(AffineColors.textSecondary.color)
    }
    .buttonStyle(.plain)
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
        Text(role.title)
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

private struct PrimaryButton: View {
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
        Text(title)
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

private struct PageDots: View {
  let count: Int
  let selectedIndex: Int

  private let dotWidth: CGFloat = 20
  private let dotHeight: CGFloat = 6
  private let dotSpacing: CGFloat = 8

  var body: some View {
    HStack(spacing: dotSpacing) {
      ForEach(0..<count, id: \.self) { index in
        Capsule()
          .fill(index == selectedIndex ? AffineColors.buttonPrimary.color : AffineColors.buttonPrimary.color.opacity(0.18))
          .frame(width: dotWidth, height: dotHeight)
      }
    }
    .animation(.spring(response: 0.35, dampingFraction: 0.8), value: selectedIndex)
  }
}

#Preview {
  OnboardingRootView(
    state: OnboardingFlowState(),
    onFinish: {},
    onPurchase: { _ in },
    onRestorePurchases: {}
  )
}
