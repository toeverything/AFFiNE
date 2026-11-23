// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct LinkCalendarAccountInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    provider: GraphQLEnum<CalendarProviderType>,
    redirectUri: GraphQLNullable<String> = nil
  ) {
    __data = InputDict([
      "provider": provider,
      "redirectUri": redirectUri
    ])
  }

  public var provider: GraphQLEnum<CalendarProviderType> {
    get { __data["provider"] }
    set { __data["provider"] = newValue }
  }

  public var redirectUri: GraphQLNullable<String> {
    get { __data["redirectUri"] }
    set { __data["redirectUri"] = newValue }
  }
}
