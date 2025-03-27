// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AddContextCategoryInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    categoryId: String,
    contextId: String,
    docs: GraphQLNullable<[String]> = nil,
    type: GraphQLEnum<ContextCategories>
  ) {
    __data = InputDict([
      "categoryId": categoryId,
      "contextId": contextId,
      "docs": docs,
      "type": type
    ])
  }

  public var categoryId: String {
    get { __data["categoryId"] }
    set { __data["categoryId"] = newValue }
  }

  public var contextId: String {
    get { __data["contextId"] }
    set { __data["contextId"] = newValue }
  }

  public var docs: GraphQLNullable<[String]> {
    get { __data["docs"] }
    set { __data["docs"] = newValue }
  }

  public var type: GraphQLEnum<ContextCategories> {
    get { __data["type"] }
    set { __data["type"] = newValue }
  }
}
