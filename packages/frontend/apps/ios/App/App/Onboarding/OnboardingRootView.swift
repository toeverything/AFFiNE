import AffineResources
import SwiftUI
import UIKit

struct OnboardingRootView: View {
  let onCompleteOnboarding: () -> Void

  @State private var pageIndex = 0
  @State private var selectedRole: OnboardingRole?

  private let pages = OnboardingPage.all

  private var isIntroPage: Bool {
    pages[pageIndex].isIntro
  }

  private var isRolePage: Bool {
    if case .role = pages[pageIndex] { return true }
    return false
  }

  private var shouldShowHeader: Bool {
    !isIntroPage
  }

  private var isNextEnabled: Bool {
    !isRolePage || selectedRole != nil
  }

  private var shouldShowContinueLabel: Bool {
    pageIndex == pages.count - 1
  }

  private var progressPageCount: Int {
    pages.filter(\.showsProgress).count
  }

  private var progressIndex: Int {
    let visibleProgressCount = pages.prefix(pageIndex + 1).filter(\.showsProgress).count
    return max(visibleProgressCount - 1, 0)
  }

  var body: some View {
    GeometryReader { geometry in
      let layout = OnboardingLayout(size: geometry.size, safeAreaInsets: geometry.safeAreaInsets)

      ZStack {
        Color.clear
          .ignoresSafeArea()

        OnboardingBackground(isIntroPage: isIntroPage)

        onboardingContent(layout: layout)

        #if DEBUG
          if isIntroPage {
            IntroGridOverlay()
              .ignoresSafeArea()
              .allowsHitTesting(false)
              .zIndex(999)
          }
        #endif
      }
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .foregroundStyle(AffineColors.textPrimary.color)
  }

  @ViewBuilder
  private func onboardingContent(layout: OnboardingLayout) -> some View {
    if layout.usesScrollableContainer {
      ScrollView(.vertical, showsIndicators: false) {
        onboardingStack(layout: layout)
          .frame(maxWidth: layout.maxContentWidth)
          .frame(maxWidth: .infinity)
      }
    } else {
      onboardingStack(layout: layout)
        .frame(maxWidth: layout.maxContentWidth)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func onboardingStack(layout: OnboardingLayout) -> some View {
    VStack(spacing: 0) {
      VStack(spacing: 0) {
        if shouldShowHeader {
          header
        }

        pageContainer
          .frame(height: layout.pageContainerHeight(for: pages[pageIndex]))
      }
      .offset(y: isIntroPage ? 0 : -30)

      footer
        .offset(y: 30)
    }
  }

  private var header: some View {
    let sideInset: CGFloat = 12
    let backButtonSize: CGFloat = 40
    let pageDotsHorizontalInset: CGFloat = 65

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
    .frame(height: 44)
  }

  private var pageContainer: some View {
    pageView(for: pages[pageIndex])
      .padding(.horizontal, horizontalPadding(for: pages[pageIndex]))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .id(pageIndex)
      .transition(.opacity)
      .animation(.spring(response: 0.30, dampingFraction: 0.88), value: pageIndex)
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
    }
  }

  private var footer: some View {
    VStack(spacing: 10) {
      if isIntroPage {
        IntroFooter {
          triggerOnboardingHaptic()
          goNext()
        }
      } else {
        PrimaryButton(
          title: shouldShowContinueLabel ? "Continue" : "Next",
          isEnabled: isNextEnabled,
          fontSize: 18
        ) {
          triggerOnboardingHaptic()
          goNext()
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.bottom, isIntroPage ? 22 : 10)
  }

  private func goNext() {
    guard isNextEnabled else { return }
    guard pageIndex < pages.count - 1 else {
      onCompleteOnboarding()
      return
    }
    pageIndex += 1
  }

  private func goBack() {
    guard pageIndex > 0 else { return }
    pageIndex -= 1
  }

  private func horizontalPadding(for page: OnboardingPage) -> CGFloat {
    if page.isIntro {
      return 0
    }
    return 20
  }

  private func triggerOnboardingHaptic() {
    let generator = UIImpactFeedbackGenerator(style: .light)
    generator.prepare()
    generator.impactOccurred()
  }
}

private struct OnboardingLayout {
  let size: CGSize
  let safeAreaInsets: EdgeInsets

  private var isLandscape: Bool {
    size.width > size.height
  }

  private var isPadLike: Bool {
    min(size.width, size.height) >= 700
  }

  private var isCompactHeight: Bool {
    size.height < 560
  }

  private var horizontalSafeArea: CGFloat {
    safeAreaInsets.leading + safeAreaInsets.trailing
  }

  var usesScrollableContainer: Bool {
    isLandscape && !isPadLike && isCompactHeight
  }

  var maxContentWidth: CGFloat {
    let availableWidth = max(size.width - horizontalSafeArea, 320)
    if isPadLike {
      return min(availableWidth, 620)
    }
    if usesScrollableContainer {
      return min(availableWidth, 520)
    }
    return min(availableWidth, 430)
  }

  func pageContainerHeight(for page: OnboardingPage) -> CGFloat {
    if usesScrollableContainer {
      return compactPageHeight(for: page)
    }

    let reservedHeight: CGFloat = page.isIntro ? 72 : 116
    let availableHeight = size.height - safeAreaInsets.top - safeAreaInsets.bottom - reservedHeight
    return max(360, availableHeight)
  }

  private func compactPageHeight(for page: OnboardingPage) -> CGFloat {
    switch page {
    case .intro:
      return 620
    case .role:
      return 560
    case .feature:
      return 540
    }
  }
}

private enum OnboardingPage {
  case intro
  case role
  case feature(OnboardingFeature)

  static let all: [OnboardingPage] = [
    .intro,
    .role,
    .feature(.clearDocs),
    .feature(.biggerPicture),
    .feature(.multipleViews),
    .feature(.everyDevice),
    .feature(.ai),
  ]

  var isIntro: Bool {
    if case .intro = self { return true }
    return false
  }

  var showsProgress: Bool {
    switch self {
    case .role, .feature:
      return true
    case .intro:
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

struct IntroGridOverlay: View {
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
