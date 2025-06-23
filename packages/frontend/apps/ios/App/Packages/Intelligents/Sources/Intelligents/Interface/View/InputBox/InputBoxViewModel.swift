//
//  InputBoxViewModel.swift
//  Intelligents
//
//  Created by AI Assistant on 6/17/25.
//

import Combine
import Foundation

// MARK: - Data Models

public struct InputAttachment: Identifiable, Equatable, Hashable, Codable {
  public var id: UUID = .init()
  public var type: AttachmentType
  public var data: Data?
  public var url: URL?
  public var name: String
  public var size: Int64

  public enum AttachmentType: String, Equatable, Hashable, Codable {
    case image
    case document
    case file
  }

  public init(
    type: AttachmentType,
    data: Data? = nil,
    url: URL? = nil,
    name: String,
    size: Int64 = 0
  ) {
    self.type = type
    self.data = data
    self.url = url
    self.name = name
    self.size = size
  }
}

public struct InputBoxData {
  public var text: String
  public var attachments: [InputAttachment]
  public var isToolEnabled: Bool
  public var isNetworkEnabled: Bool
  public var isDeepThinkingEnabled: Bool

  public init(
    text: String,
    attachments: [InputAttachment],
    isToolEnabled: Bool,
    isNetworkEnabled: Bool,
    isDeepThinkingEnabled: Bool
  ) {
    self.text = text
    self.attachments = attachments
    self.isToolEnabled = isToolEnabled
    self.isNetworkEnabled = isNetworkEnabled
    self.isDeepThinkingEnabled = isDeepThinkingEnabled
  }
}

// MARK: - View Model

public class InputBoxViewModel: ObservableObject {
  // MARK: - Published Properties

  @Published public var inputText: String = ""
  @Published public var isToolEnabled: Bool = false
  @Published public var isNetworkEnabled: Bool = false
  @Published public var isDeepThinkingEnabled: Bool = false
  @Published public var hasAttachments: Bool = false
  @Published public var attachments: [InputAttachment] = []
  @Published public var canSend: Bool = false

  // MARK: - Private Properties

  private var cancellables = Set<AnyCancellable>()

  // MARK: - Initialization

  public init() {
    setupBindings()
  }

  // MARK: - Private Methods

  private func setupBindings() {
    // 监听文本变化，自动更新发送按钮状态
    $inputText
      .map { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .assign(to: \.canSend, on: self)
      .store(in: &cancellables)

    // 监听附件变化
    $attachments
      .map { !$0.isEmpty }
      .assign(to: \.hasAttachments, on: self)
      .store(in: &cancellables)
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
    isNetworkEnabled.toggle()
  }

  func toggleDeepThinking() {
    isDeepThinkingEnabled.toggle()
  }
}

// MARK: - Attachment Management

public extension InputBoxViewModel {
  func addAttachment(_ attachment: InputAttachment) {
    attachments.append(attachment)
  }

  func removeAttachment(withId id: UUID) {
    attachments.removeAll { $0.id == id }
  }

  func clearAttachments() {
    attachments.removeAll()
  }
}

// MARK: - Send Management

public extension InputBoxViewModel {
  func prepareSendData() -> InputBoxData {
    InputBoxData(
      text: inputText.trimmingCharacters(in: .whitespacesAndNewlines),
      attachments: attachments,
      isToolEnabled: isToolEnabled,
      isNetworkEnabled: isNetworkEnabled,
      isDeepThinkingEnabled: isDeepThinkingEnabled
    )
  }

  func resetInput() {
    inputText = ""
    attachments.removeAll()
    isToolEnabled = false
    isNetworkEnabled = false
    isDeepThinkingEnabled = false
  }
}
