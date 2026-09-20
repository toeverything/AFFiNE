import AffineGraphQL
import Apollo
import Foundation

public final class QLService {
  public static let shared = QLService()
  private var endpointURL: URL
  private var urlSessionClient: URLSessionCookieClient
  public var client: ApolloClient

  private init() {
    let store = ApolloStore()
    endpointURL = URL(string: "https://app.affine.pro/graphql")!
    urlSessionClient = URLSessionCookieClient()
    let networkTransport = RequestChainNetworkTransport(
      interceptorProvider: DefaultInterceptorProvider(client: urlSessionClient, store: store),
      endpointURL: endpointURL
    )
    client = ApolloClient(networkTransport: networkTransport, store: store)
  }

  public func setEndpoint(base: URL) {
    var url: URL = base
    if url.lastPathComponent != "graphql" {
      url = url.appendingPathComponent("graphql")
    }
    print("[*] setting endpoint for qlservice: \(url.absoluteString)")

    let store = ApolloStore()
    endpointURL = url
    urlSessionClient = URLSessionCookieClient()
    let networkTransport = RequestChainNetworkTransport(
      interceptorProvider: DefaultInterceptorProvider(client: urlSessionClient, store: store),
      endpointURL: url
    )
    client = ApolloClient(networkTransport: networkTransport, store: store)
  }

  var serverBaseURL: URL {
    if endpointURL.lastPathComponent == "graphql" {
      return endpointURL.deletingLastPathComponent()
    }
    return endpointURL
  }

  func sendAuthenticatedRequest(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    try await withCheckedThrowingContinuation { continuation in
      urlSessionClient.sendRequest(request) { result in
        continuation.resume(with: result)
      }
    }
  }

  func perform<Mutation: GraphQLMutation>(mutation: Mutation) async throws -> Mutation.Data {
    try await withCheckedThrowingContinuation { continuation in
      client.perform(mutation: mutation) { result in
        switch result {
        case let .success(graphQLResult):
          if let data = graphQLResult.data {
            continuation.resume(returning: data)
          } else if let error = graphQLResult.errors?.first {
            continuation.resume(throwing: error)
          } else {
            continuation.resume(throwing: NSError(
              domain: "QLService",
              code: -1,
              userInfo: [NSLocalizedDescriptionKey: "Missing GraphQL data"]
            ))
          }
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func fetch<Query: GraphQLQuery>(query: Query) async throws -> Query.Data {
    try await withCheckedThrowingContinuation { continuation in
      client.fetch(query: query) { result in
        switch result {
        case let .success(graphQLResult):
          if let data = graphQLResult.data {
            continuation.resume(returning: data)
          } else if let error = graphQLResult.errors?.first {
            continuation.resume(throwing: error)
          } else {
            continuation.resume(throwing: NSError(
              domain: "QLService",
              code: -1,
              userInfo: [NSLocalizedDescriptionKey: "Missing GraphQL data"]
            ))
          }
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  public func fetchCurrentUser(completion: @escaping (GetCurrentUserQuery.Data.CurrentUser?) -> Void) {
    client.fetch(query: GetCurrentUserQuery()) { result in
      switch result {
      case let .success(graphQLResult):
        completion(graphQLResult.data?.currentUser)
      case .failure:
        completion(nil)
      }
    }
  }

  public func fetchUserSettings(completion: @escaping (GetUserSettingsQuery.Data.CurrentUser.Settings?) -> Void) {
    client.fetch(query: GetUserSettingsQuery()) { result in
      switch result {
      case let .success(graphQLResult):
        completion(graphQLResult.data?.currentUser?.settings)
      case .failure:
        completion(nil)
      }
    }
  }

  public func fetchWorkspaces(completion: @escaping ([GetWorkspacesQuery.Data.Workspace]) -> Void) {
    client.fetch(query: GetWorkspacesQuery()) { result in
      switch result {
      case let .success(graphQLResult):
        completion(graphQLResult.data?.workspaces ?? [])
      case .failure:
        completion([])
      }
    }
  }

  public func fetchSubscription(completion: @escaping (SubscriptionQuery.Data.CurrentUser.Subscription?) -> Void) {
    client.fetch(query: SubscriptionQuery()) { result in
      switch result {
      case let .success(graphQLResult):
        completion(graphQLResult.data?.currentUser?.subscriptions.first)
      case .failure:
        completion(nil)
      }
    }
  }

  public func fetchQuota(completion: @escaping (QuotaQuery.Data.CurrentUser.Quota?) -> Void) {
    client.fetch(query: QuotaQuery()) { result in
      switch result {
      case let .success(graphQLResult):
        completion(graphQLResult.data?.currentUser?.quota)
      case .failure:
        completion(nil)
      }
    }
  }

  public func searchDocuments(
    workspaceId: String,
    keyword: String,
    limit: Int = 20,
    completion: @escaping ([IndexerSearchDocsQuery.Data.Workspace.SearchDoc]) -> Void
  ) {
    let input = SearchDocsInput(keyword: keyword, limit: .some(limit))
    client.fetch(query: IndexerSearchDocsQuery(id: workspaceId, input: input)) { result in
      switch result {
      case let .success(graphQLResult):
        completion(graphQLResult.data?.workspace.searchDocs ?? [])
      case .failure:
        completion([])
      }
    }
  }

  public func fetchRecentlyUpdatedDocs(
    workspaceId: String,
    first: Int = 20,
    completion: @escaping ([GetRecentlyUpdatedDocsQuery.Data.Workspace.RecentlyUpdatedDocs.Edge.Node]) -> Void
  ) {
    let pagination = PaginationInput(first: .some(first))
    client.fetch(query: GetRecentlyUpdatedDocsQuery(workspaceId: workspaceId, pagination: pagination)) { result in
      switch result {
      case let .success(graphQLResult):
        let docs = graphQLResult.data?.workspace.recentlyUpdatedDocs.edges.map(\.node) ?? []
        completion(docs)
      case .failure:
        completion([])
      }
    }
  }
}
