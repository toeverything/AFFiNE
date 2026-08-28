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

enum OnboardingRole: String, CaseIterable {
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

enum OnboardingFeature: CaseIterable {
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
