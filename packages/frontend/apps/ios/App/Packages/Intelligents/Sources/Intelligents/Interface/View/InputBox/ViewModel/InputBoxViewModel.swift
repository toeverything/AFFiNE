//
//  InputBoxViewModel.swift
//  Intelligents
//
//  Created by AI Assistant on 6/17/25.
//

import Combine
import Foundation

// MARK: - Data Models

public struct InputBoxData {
  public var text: String
  public var imageAttachments: [ImageAttachment]
  public var fileAttachments: [FileAttachment] = []
  public var documentAttachments: [DocumentAttachment] = []
  public var isToolEnabled: Bool
  public var isSearchEnabled: Bool
  public var isDeepThinkingEnabled: Bool

  public init(text: String, imageAttachments: [ImageAttachment], fileAttachments: [FileAttachment], documentAttachments: [DocumentAttachment], isToolEnabled: Bool, isSearchEnabled: Bool, isDeepThinkingEnabled: Bool) {
    self.text = text
    self.imageAttachments = imageAttachments
    self.fileAttachments = fileAttachments
    self.documentAttachments = documentAttachments
    self.isToolEnabled = isToolEnabled
    self.isSearchEnabled = isSearchEnabled
    self.isDeepThinkingEnabled = isDeepThinkingEnabled
  }
}

// MARK: - View Model

public class InputBoxViewModel: ObservableObject {
  // MARK: - Published Properties

  @Published public var inputText: String = ""
  @Published public var isToolEnabled: Bool = false
  @Published public var isSearchEnabled: Bool = false
  @Published public var isDeepThinkingEnabled: Bool = false
  @Published public var imageAttachments: [ImageAttachment] = []
  @Published public var fileAttachments: [FileAttachment] = []
  @Published public var documentAttachments: [DocumentAttachment] = []
  @Published public var canSend: Bool = false

  // MARK: - Private Properties

  private var cancellables = Set<AnyCancellable>()

  // MARK: - Initialization

  public init() {
    setupBindings()
  }

  // MARK: - Private Methods

  private func setupBindings() {
    Publishers.CombineLatest4($inputText, $imageAttachments, $fileAttachments, $documentAttachments)
      .map { text, images, files, docs in
        let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasAnyAttachments = !images.isEmpty || !files.isEmpty || !docs.isEmpty
        return hasText || hasAnyAttachments
      }
      .assign(to: \.canSend, on: self)
      .store(in: &cancellables)
  }

  public func clearAllAttachments() {
    imageAttachments.removeAll()
    fileAttachments.removeAll()
    documentAttachments.removeAll()
  }
}

// MARK: - Text Management

public extension InputBoxViewModel {
  func updateText(_ text: String) {
    inputText = text
  }
}

// MARK: - Feature Toggles

public extension InputBoxViewModel {
  func toggleTool() {
    isToolEnabled.toggle()
  }

  func toggleNetwork() {
    isSearchEnabled.toggle()
  }

  func toggleDeepThinking() {
    isDeepThinkingEnabled.toggle()
  }
}

// MARK: - Attachment Management

public extension InputBoxViewModel {
  func addImageAttachment(_ attachment: ImageAttachment) {
    imageAttachments.append(attachment)
  }

  func removeImageAttachment(withId id: UUID) {
    imageAttachments.removeAll { $0.id == id }
  }

  func clearImageAttachments() {
    imageAttachments.removeAll()
  }

  func addFileAttachment(_ attachment: FileAttachment) {
    fileAttachments.append(attachment)
  }

  func removeFileAttachment(withId id: UUID) {
    fileAttachments.removeAll { $0.id == id }
  }

  func clearFileAttachments() {
    fileAttachments.removeAll()
  }

  func addDocumentAttachment(_ attachment: DocumentAttachment) {
    documentAttachments.append(attachment)
  }

  func removeDocumentAttachment(withId id: UUID) {
    documentAttachments.removeAll { $0.id == id }
  }

  func clearDocumentAttachments() {
    documentAttachments.removeAll()
  }
}

// MARK: - Send Management

public extension InputBoxViewModel {
  func prepareSendData() -> InputBoxData {
    InputBoxData(
      text: inputText.trimmingCharacters(in: .whitespacesAndNewlines),
      imageAttachments: imageAttachments,
      fileAttachments: fileAttachments,
      documentAttachments: documentAttachments,
      isToolEnabled: isToolEnabled,
      isSearchEnabled: isSearchEnabled,
      isDeepThinkingEnabled: isDeepThinkingEnabled
    )
  }

  func resetInput() {
    inputText = ""
    imageAttachments.removeAll()
    fileAttachments.removeAll()
    documentAttachments.removeAll()
    isToolEnabled = false
    isSearchEnabled = false
    isDeepThinkingEnabled = false
  }
}
