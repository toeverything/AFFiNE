// @generated
// This file was automatically generated and can be edited to
// implement advanced custom scalar functionality.
//
// Any changes to this file will not be overwritten by future
// code generation execution.

import ApolloAPI

public typealias JSONObject = CustomJSON

public enum CustomJSON: CustomScalarType, Hashable {
  case dictionary([String: AnyHashable])
  case array([AnyHashable])

  public init(_jsonValue value: JSONValue) throws {
    if let dict = value as? [String: AnyHashable] {
      self = .dictionary(dict)
    } else if let array = value as? [AnyHashable] {
      self = .array(array)
    } else {
      throw JSONDecodingError.couldNotConvert(value: value, to: CustomJSON.self)
    }
  }

  public var _jsonValue: JSONValue {
    switch self {
    case let .dictionary(json as AnyHashable),
         let .array(json as AnyHashable):
      json
    }
  }

  public static func == (lhs: CustomJSON, rhs: CustomJSON) -> Bool {
    lhs._jsonValue == rhs._jsonValue
  }

  public func hash(into hasher: inout Hasher) {
    hasher.combine(_jsonValue)
  }
}
