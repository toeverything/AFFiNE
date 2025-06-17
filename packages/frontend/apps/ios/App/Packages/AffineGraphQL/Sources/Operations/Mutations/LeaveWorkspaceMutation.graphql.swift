// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class LeaveWorkspaceMutation: GraphQLMutation {
  public static let operationName: String = "leaveWorkspace"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation leaveWorkspace($workspaceId: String!, $sendLeaveMail: Boolean) { leaveWorkspace(workspaceId: $workspaceId, sendLeaveMail: $sendLeaveMail) }"#
    ))

  public var workspaceId: String
  public var sendLeaveMail: GraphQLNullable<Bool>

  public init(
    workspaceId: String,
    sendLeaveMail: GraphQLNullable<Bool>
  ) {
    self.workspaceId = workspaceId
    self.sendLeaveMail = sendLeaveMail
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "sendLeaveMail": sendLeaveMail
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    #warning("Argument 'sendLeaveMail' of field 'leaveWorkspace' is deprecated. Reason: 'no used anymore'")
    public static var __selections: [ApolloAPI.Selection] { [
      .field("leaveWorkspace", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "sendLeaveMail": .variable("sendLeaveMail")
      ]),
    ] }

    public var leaveWorkspace: Bool { __data["leaveWorkspace"] }
  }
}
