// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateWorkspaceByokLocalLeaseMutation: GraphQLMutation {
  public static let operationName: String = "createWorkspaceByokLocalLease"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createWorkspaceByokLocalLease($input: CreateWorkspaceByokLocalLeaseInput!) { createWorkspaceByokLocalLease(input: $input) { __typename leaseId expiresAt } }"#
    ))

  public var input: CreateWorkspaceByokLocalLeaseInput

  public init(input: CreateWorkspaceByokLocalLeaseInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createWorkspaceByokLocalLease", CreateWorkspaceByokLocalLease.self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CreateWorkspaceByokLocalLeaseMutation.Data.self
    ] }

    public var createWorkspaceByokLocalLease: CreateWorkspaceByokLocalLease { __data["createWorkspaceByokLocalLease"] }

    /// CreateWorkspaceByokLocalLease
    ///
    /// Parent Type: `CreateWorkspaceByokLocalLeaseResultType`
    public struct CreateWorkspaceByokLocalLease: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CreateWorkspaceByokLocalLeaseResultType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("leaseId", String.self),
        .field("expiresAt", AffineGraphQL.DateTime.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        CreateWorkspaceByokLocalLeaseMutation.Data.CreateWorkspaceByokLocalLease.self
      ] }

      public var leaseId: String { __data["leaseId"] }
      public var expiresAt: AffineGraphQL.DateTime { __data["expiresAt"] }
    }
  }
}
