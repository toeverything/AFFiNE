// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class WorkspaceInvoicesQuery: GraphQLQuery {
  public static let operationName: String = "workspaceInvoices"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query workspaceInvoices($take: Int!, $skip: Int!, $workspaceId: String!) { workspace(id: $workspaceId) { __typename invoiceCount invoices(take: $take, skip: $skip) { __typename id status currency amount reason lastPaymentError link createdAt } } }"#
    ))

  public var take: Int
  public var skip: Int
  public var workspaceId: String

  public init(
    take: Int,
    skip: Int,
    workspaceId: String
  ) {
    self.take = take
    self.skip = skip
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { [
    "take": take,
    "skip": skip,
    "workspaceId": workspaceId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      WorkspaceInvoicesQuery.Data.self
    ] }

    /// Get workspace by id
    public var workspace: Workspace { __data["workspace"] }

    /// Workspace
    ///
    /// Parent Type: `WorkspaceType`
    public struct Workspace: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("invoiceCount", Int.self),
        .field("invoices", [Invoice].self, arguments: [
          "take": .variable("take"),
          "skip": .variable("skip")
        ]),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        WorkspaceInvoicesQuery.Data.Workspace.self
      ] }

      /// Get user invoice count
      public var invoiceCount: Int { __data["invoiceCount"] }
      public var invoices: [Invoice] { __data["invoices"] }

      /// Workspace.Invoice
      ///
      /// Parent Type: `InvoiceType`
      public struct Invoice: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.InvoiceType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("id", String?.self),
          .field("status", GraphQLEnum<AffineGraphQL.InvoiceStatus>.self),
          .field("currency", String.self),
          .field("amount", Int.self),
          .field("reason", String.self),
          .field("lastPaymentError", String?.self),
          .field("link", String?.self),
          .field("createdAt", AffineGraphQL.DateTime.self),
        ] }
        public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
          WorkspaceInvoicesQuery.Data.Workspace.Invoice.self
        ] }

        @available(*, deprecated, message: "removed")
        public var id: String? { __data["id"] }
        public var status: GraphQLEnum<AffineGraphQL.InvoiceStatus> { __data["status"] }
        public var currency: String { __data["currency"] }
        public var amount: Int { __data["amount"] }
        public var reason: String { __data["reason"] }
        public var lastPaymentError: String? { __data["lastPaymentError"] }
        public var link: String? { __data["link"] }
        public var createdAt: AffineGraphQL.DateTime { __data["createdAt"] }
      }
    }
  }
}
