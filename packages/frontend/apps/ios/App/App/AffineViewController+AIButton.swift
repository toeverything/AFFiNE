//
//  AffineViewController+AIButton.swift
//  App
//
//  Created by 秋星桥 on 2025/1/8.
//

import ChidoriMenu
import Intelligents
import UIKit

extension AFFiNEViewController: IntelligentsButtonDelegate, IntelligentsFocusApertureViewDelegate {
  func onIntelligentsButtonTapped(_ button: IntelligentsButton) {
    guard let webView else {
      assertionFailure() // ? wdym ?
      return
    }

    button.beginProgress()
    
    // associate current view controller to callbacks
    Intelligents.Delegates.createNewDocument = { title, content in
      print("[*] creating new document \(title) \(content)")
      webView.evaluateScript(
        .createNewDocument,
        arguments: [content, title]
      ) { _ in }
    }
    Intelligents.Delegates.dismissAll = { [weak self] in
      guard let self else { return }
      if self.presentedViewController != nil {
        self.dismiss(animated: true)
      }
      if let focusView = self.focusView {
        focusView.executeAnimationDismiss() {
          focusView.removeFromSuperview()
        }
      }
      self.focusView = nil
    }

    let group = DispatchGroup()

    group.enter()
    webView.evaluateScript(.getCurrentServerBaseUrl) { result in
      self.baseUrl = result as? String
      print("[*] setting baseUrl: \(self.baseUrl ?? "")")
      group.leave()
    }

    group.enter()
    webView.evaluateScript(.getCurrentDocId) { result in
      self.documentID = result as? String
      print("[*] setting documentID: \(self.documentID ?? "")")
      group.leave()
    }

    group.enter()
    webView.evaluateScript(.getCurrentWorkspaceId) { result in
      self.workspaceID = result as? String
      print("[*] setting workspaceID: \(self.workspaceID ?? "")")
      group.leave()
    }

    group.enter()
    webView.evaluateScript(.getCurrentDocContentInMarkdown) { input in
      self.documentContent = input as? String
      print("[*] setting documentContent: \(self.documentContent?.count ?? 0) chars")
      group.leave()
    }

    DispatchQueue.global().asyncAfter(deadline: .now()) {
      group.wait()
      DispatchQueue.main.async {
        button.stopProgress()
        webView.resignFirstResponder()
        self.openIntelligentsSheet()
      }
    }
  }

  @discardableResult
  func openIntelligentsSheet() -> IntelligentsFocusApertureView? {
    dismissIntelligentsButton()
    view.resignFirstResponder()
    // stop scroll on webview
    if let contentOffset = webView?.scrollView.contentOffset {
      webView?.scrollView.contentOffset = contentOffset
    }
    let focus = IntelligentsFocusApertureView()
    self.focusView = focus
    focus.prepareAnimationWith(
      capturingTargetContentView: webView ?? .init(),
      coveringRootViewController: self
    )
    focus.delegate = self
    focus.executeAnimationKickIn()
    dismissIntelligentsButton()
    return focus
  }

  func openSimpleChat() {
    let targetController = IntelligentsChatController()
    presentIntoCurrentContext(withTargetController: targetController)
  }

  func focusApertureRequestAction(
    from view: IntelligentsFocusApertureView,
    actionType: IntelligentsFocusApertureViewActionType
  ) {
    switch actionType {
    case .translateTo:
      var actions: [UIAction] = []
      for lang in IntelligentsEphemeralActionController.EphemeralAction.Language.allCases {
        actions.append(.init(title: lang.rawValue) { [weak self] _ in
          guard let self else { return }
          let controller = IntelligentsEphemeralActionController(
            action: .translate(to: lang)
          )
          controller.workspaceID = workspaceID ?? ""
          controller.documentID = documentID ?? ""
          controller.documentContent = documentContent ?? ""
          controller.configure(previewImage: view.capturedImage ?? .init())
          presentIntoCurrentContext(withTargetController: controller)
        })
      }
      view.present(menu: .init(children: actions)) { controller in
        controller.overrideUserInterfaceStyle = .dark
      } controllerDidPresent: { _ in }
    case .summary:
      let controller = IntelligentsEphemeralActionController(
        action: .summarize
      )
      controller.configure(previewImage: view.capturedImage ?? .init())
      controller.workspaceID = workspaceID ?? ""
      controller.documentID = documentID ?? ""
      controller.documentContent = documentContent ?? ""
      presentIntoCurrentContext(withTargetController: controller)
    case .chatWithAI:
      let controller = IntelligentsChatController()
      controller.metadata[.documentID] = documentID
      controller.metadata[.workspaceID] = workspaceID
      controller.metadata[.content] = documentContent
      presentIntoCurrentContext(withTargetController: controller)
    case .dismiss:
      presentIntelligentsButton()
    }
  }
}
