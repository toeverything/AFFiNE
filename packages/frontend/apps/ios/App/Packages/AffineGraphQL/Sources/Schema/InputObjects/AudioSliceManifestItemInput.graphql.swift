// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AudioSliceManifestItemInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    byteSize: GraphQLNullable<Int> = nil,
    durationSec: Double,
    fileName: String,
    index: Int,
    mimeType: String,
    startSec: Double
  ) {
    __data = InputDict([
      "byteSize": byteSize,
      "durationSec": durationSec,
      "fileName": fileName,
      "index": index,
      "mimeType": mimeType,
      "startSec": startSec
    ])
  }

  public var byteSize: GraphQLNullable<Int> {
    get { __data["byteSize"] }
    set { __data["byteSize"] = newValue }
  }

  public var durationSec: Double {
    get { __data["durationSec"] }
    set { __data["durationSec"] = newValue }
  }

  public var fileName: String {
    get { __data["fileName"] }
    set { __data["fileName"] = newValue }
  }

  public var index: Int {
    get { __data["index"] }
    set { __data["index"] = newValue }
  }

  public var mimeType: String {
    get { __data["mimeType"] }
    set { __data["mimeType"] = newValue }
  }

  public var startSec: Double {
    get { __data["startSec"] }
    set { __data["startSec"] = newValue }
  }
}
