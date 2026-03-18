// @generated
// This file was automatically generated and can be edited to
// implement advanced custom scalar functionality.
//
// Any changes to this file will not be overwritten by future
// code generation execution.

import ApolloAPI

/// The `JSONObject` scalar type represents JSON objects as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).
public struct JSONObject: CustomScalarType, Hashable, ExpressibleByDictionaryLiteral {
  public let object: ApolloAPI.JSONObject

  public init(_jsonValue value: JSONValue) throws {
    object = try ApolloAPI.JSONObject(_jsonValue: value)
  }

  public init(_ object: ApolloAPI.JSONObject) {
    self.object = object
  }

  public init(dictionaryLiteral elements: (String, JSONValue)...) {
    object = ApolloAPI.JSONObject(uniqueKeysWithValues: elements)
  }

  public var _jsonValue: JSONValue {
    object
  }
}
