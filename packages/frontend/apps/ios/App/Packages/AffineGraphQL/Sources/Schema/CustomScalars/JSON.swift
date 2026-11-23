// @generated
// This file was automatically generated and can be edited to
// implement advanced custom scalar functionality.
//
// Any changes to this file will not be overwritten by future
// code generation execution.

import ApolloAPI

/// The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).
public struct JSON: CustomScalarType, Hashable, ExpressibleByDictionaryLiteral {
  public let value: JSONValue

  public init(_jsonValue value: JSONValue) throws {
    self.value = value
  }

  public init(dictionaryLiteral elements: (String, JSONValue)...) {
    value = ApolloAPI.JSONObject(uniqueKeysWithValues: elements) as JSONValue
  }

  public var _jsonValue: JSONValue {
    value
  }
}
