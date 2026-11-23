//
//  ChatManager.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import AffineGraphQL
import Apollo
import ApolloAPI
import Combine
import Foundation
import OrderedCollections

public class ChatManager: ObservableObject, @unchecked Sendable {
  public static let shared = ChatManager()

  public typealias SessionID = String
  public typealias MessageID = UUID // ChatCellViewModel ID
  @Published public private(set) var viewModels: OrderedDictionary<
    SessionID,
    OrderedDictionary<MessageID, any ChatCellViewModel>
  > = [:]
  public let scrollToBottomPublisher = PassthroughSubject<SessionID, Never>()

  var closable: [Closable] = []

  private init() {}

  public func closeAll() {
    print("[+] terminating all closables...")
    closable.forEach { $0.close() }
    closable.removeAll()
  }

  public func clearAll() {
    assert(Thread.isMainThread)
    closeAll()
    viewModels.removeAll()
  }

  public func with(sessionId: String, _ action: (inout OrderedDictionary<MessageID, any ChatCellViewModel>) -> Void) {
    if Thread.isMainThread {
      if var sessionViewModels = viewModels[sessionId] {
        action(&sessionViewModels)
        viewModels[sessionId] = sessionViewModels
      } else {
        var sessionViewModels = OrderedDictionary<MessageID, any ChatCellViewModel>()
        action(&sessionViewModels)
        viewModels[sessionId] = sessionViewModels
      }
    } else {
      DispatchQueue.main.asyncAndWait {
        self.with(sessionId: sessionId, action)
      }
    }
  }

  public func with<T>(sessionId: String, vmId: UUID, _ action: (inout T) -> Void) {
    with(sessionId: sessionId) { sessionViewModels in
      if let read = sessionViewModels[vmId], var convert = read as? T {
        action(&convert)
        guard let vm = convert as? any ChatCellViewModel else {
          assertionFailure()
          return
        }
        sessionViewModels[vmId] = vm
      }
    }
  }

  public func delete(sessionId: String, vmId: UUID) {
    with(sessionId: sessionId) { $0.removeValue(forKey: vmId) }
  }

  @discardableResult
  public func append(sessionId: String, _ viewModel: any ChatCellViewModel) -> UUID {
    with(sessionId: sessionId) { $0.updateValue(viewModel, forKey: viewModel.id) }
    return viewModel.id
  }

  @discardableResult
  public func report(_ sessionID: String, _ error: Error) -> UUID {
    let model = ErrorCellViewModel(
      id: .init(),
      errorMessage: error.localizedDescription,
      timestamp: .init()
    )
    append(sessionId: sessionID, model)
    return model.id
  }
}
