// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct BlobUploadPartInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    etag: String,
    partNumber: Int
  ) {
    __data = InputDict([
      "etag": etag,
      "partNumber": partNumber
    ])
  }

  public var etag: String {
    get { __data["etag"] }
    set { __data["etag"] = newValue }
  }

  public var partNumber: Int {
    get { __data["partNumber"] }
    set { __data["partNumber"] = newValue }
  }
}
