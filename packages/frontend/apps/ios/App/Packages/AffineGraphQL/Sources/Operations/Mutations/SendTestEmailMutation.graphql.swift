// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class SendTestEmailMutation: GraphQLMutation {
  public static let operationName: String = "sendTestEmail"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation sendTestEmail($name: String!, $host: String!, $port: Int!, $sender: String!, $username: String!, $password: String!, $ignoreTLS: Boolean!) { sendTestEmail( config: { name: $name host: $host port: $port sender: $sender username: $username password: $password ignoreTLS: $ignoreTLS } ) }"#
    ))

  public var name: String
  public var host: String
  public var port: Int
  public var sender: String
  public var username: String
  public var password: String
  public var ignoreTLS: Bool

  public init(
    name: String,
    host: String,
    port: Int,
    sender: String,
    username: String,
    password: String,
    ignoreTLS: Bool
  ) {
    self.name = name
    self.host = host
    self.port = port
    self.sender = sender
    self.username = username
    self.password = password
    self.ignoreTLS = ignoreTLS
  }

  public var __variables: Variables? { [
    "name": name,
    "host": host,
    "port": port,
    "sender": sender,
    "username": username,
    "password": password,
    "ignoreTLS": ignoreTLS
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("sendTestEmail", Bool.self, arguments: ["config": [
        "name": .variable("name"),
        "host": .variable("host"),
        "port": .variable("port"),
        "sender": .variable("sender"),
        "username": .variable("username"),
        "password": .variable("password"),
        "ignoreTLS": .variable("ignoreTLS")
      ]]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      SendTestEmailMutation.Data.self
    ] }

    public var sendTestEmail: Bool { __data["sendTestEmail"] }
  }
}
