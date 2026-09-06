import Capacitor
import Foundation

@objc(NbStorePlugin)
public class NbStorePlugin: CAPPlugin, CAPBridgedPlugin {
  private let docStoragePool: DocStoragePool = newDocStoragePool()

  public let identifier = "NbStorePlugin"
  public let jsName = "NbStoreDocStorage"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setSpaceId", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "pushUpdate", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getDocSnapshot", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setDocSnapshot", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getDocUpdates", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "markUpdatesMerged", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "deleteDoc", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getDocClocks", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getDocClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getBlob", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setBlob", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "deleteBlob", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "releaseBlobs", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "listBlobs", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getPeerRemoteClocks", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getPeerRemoteClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setPeerRemoteClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getPeerPulledRemoteClocks", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getPeerPulledRemoteClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setPeerPulledRemoteClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getPeerPushedClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getPeerPushedClocks", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setPeerPushedClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearClocks", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getBlobUploadedAt", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setBlobUploadedAt", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "crawlDocData", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getDocIndexedClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setDocIndexedClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setDocIndexedClocks", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearDocIndexedClock", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "indexUpsert", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "indexDelete", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "indexSearch", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "indexAggregate", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "indexDeleteByQuery", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "indexFlush", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "indexVersion", returnType: CAPPluginReturnPromise),
  ]

  @objc func connect(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let spaceId = try call.getStringEnsure("spaceId")
        let spaceType = try call.getStringEnsure("spaceType")
        let peer = try call.getStringEnsure("peer")
        guard let documentDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
          call.reject("Failed to get document file urls")
          return
        }
        let peerDir = documentDir.appending(path: "workspaces")
          .appending(path: spaceType)
          .appending(path:
            peer
              .replacing(#/[\/!@#$%^&*()+~`"':;,?<>|]/#, with: "_")
              .replacing(/_+/, with: "_")
              .replacing(/_+$/, with: ""))
        try FileManager.default.createDirectory(atPath: peerDir.path(), withIntermediateDirectories: true)
        let db = peerDir.appending(path: spaceId + ".db")
        try await docStoragePool.connect(universalId: id, path: db.path())
        call.resolve()
      } catch {
        call.reject("Failed to connect storage, \(error)", nil, error)
      }
    }
  }

  @objc func disconnect(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        try await docStoragePool.disconnect(universalId: id)
        call.resolve()
      } catch {
        call.reject("Failed to disconnect, \(error)", nil, error)
      }
    }
  }

  @objc func setSpaceId(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let spaceId = try call.getStringEnsure("spaceId")
        try await docStoragePool.setSpaceId(universalId: id, spaceId: spaceId)
        call.resolve()
      } catch {
        call.reject("Failed to set space id, \(error)", nil, error)
      }
    }
  }

  @objc func pushUpdate(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let docId = try call.getStringEnsure("docId")
        let data = try call.getStringEnsure("data")
        let timestamp = try await docStoragePool.pushUpdate(universalId: id, docId: docId, update: data)
        call.resolve(["timestamp": timestamp])
      } catch {
        call.reject("Failed to push update, \(error)", nil, error)
      }
    }
  }

  @objc func getDocSnapshot(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let docId = try call.getStringEnsure("docId")

        if let record = try await docStoragePool.getDocSnapshot(universalId: id, docId: docId) {
          call.resolve([
            "docId": record.docId,
            "bin": record.bin,
            "timestamp": record.timestamp,
          ])
        } else {
          call.resolve()
        }
      } catch {
        call.reject("Failed to get doc snapshot, \(error)", nil, error)
      }
    }
  }

  @objc func setDocSnapshot(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let docId = try call.getStringEnsure("docId")
        let bin = try call.getStringEnsure("bin")
        let timestamp = try call.getIntEnsure("timestamp")
        let success = try await docStoragePool.setDocSnapshot(
          universalId: id,
          snapshot: DocRecord(docId: docId, bin: bin, timestamp: Int64(timestamp))
        )
        call.resolve(["success": success])
      } catch {
        call.reject("Failed to set doc snapshot, \(error)", nil, error)
      }
    }
  }

  @objc func getDocUpdates(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let docId = try call.getStringEnsure("docId")
        let updates = try await docStoragePool.getDocUpdates(universalId: id, docId: docId)
        let mapped = updates.map { [
          "docId": $0.docId,
          "timestamp": $0.timestamp,
          "bin": $0.bin,
        ] }
        call.resolve(["updates": mapped])
      } catch {
        call.reject("Failed to get doc updates, \(error)", nil, error)
      }
    }
  }

  @objc func markUpdatesMerged(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let docId = try call.getStringEnsure("docId")
        let times = try call.getArrayEnsure("timestamps", Int64.self)

        let count = try await docStoragePool.markUpdatesMerged(universalId: id, docId: docId, updates: times)
        call.resolve(["count": count])
      } catch {
        call.reject("Failed to mark updates merged, \(error)", nil, error)
      }
    }
  }

  @objc func deleteDoc(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let docId = try call.getStringEnsure("docId")

        try await docStoragePool.deleteDoc(universalId: id, docId: docId)
        call.resolve()
      } catch {
        call.reject("Failed to delete doc, \(error)", nil, error)
      }
    }
  }

  @objc func getDocClocks(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let after = call.getInt("after")

        let docClocks = try await docStoragePool.getDocClocks(
          universalId: id,
          after: after != nil ? Int64(after!) : nil
        )
        let mapped = docClocks.map { [
          "docId": $0.docId,
          "timestamp": $0.timestamp,
        ] }
        call.resolve(["clocks": mapped])
      } catch {
        call.reject("Failed to get doc clocks, \(error)", nil, error)
      }
    }
  }

  @objc func getDocClock(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let docId = try call.getStringEnsure("docId")
        if let docClock = try await docStoragePool.getDocClock(universalId: id, docId: docId) {
          call.resolve([
            "docId": docClock.docId,
            "timestamp": docClock.timestamp,
          ])
        } else {
          call.resolve()
        }
      } catch {
        call.reject("Failed to get doc clock, \(error)", nil, error)
      }
    }
  }

  @objc func getBlob(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let key = try call.getStringEnsure("key")
        if let blob = try await docStoragePool.getBlob(universalId: id, key: key) {
          call.resolve([
            "key": blob.key,
            "data": blob.data,
            "mime": blob.mime,
            "size": blob.size,
            "createdAt": blob.createdAt,
          ])
        } else {
          call.resolve()
        }
      } catch {
        call.reject("Failed to get blob, \(error)", nil, error)
      }
    }
  }

  @objc func setBlob(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let key = try call.getStringEnsure("key")
        let data = try call.getStringEnsure("data")
        let mime = try call.getStringEnsure("mime")
        try await docStoragePool.setBlob(universalId: id, blob: SetBlob(key: key, data: data, mime: mime))
        call.resolve()
      } catch {
        call.reject("Failed to set blob, \(error)", nil, error)
      }
    }
  }

  @objc func deleteBlob(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let key = try call.getStringEnsure("key")
        let permanently = call.getBool("permanently") ?? false
        try await docStoragePool.deleteBlob(universalId: id, key: key, permanently: permanently)
        call.resolve()
      } catch {
        call.reject("Failed to delete blob, \(error)", nil, error)
      }
    }
  }

  @objc func releaseBlobs(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        try await docStoragePool.releaseBlobs(universalId: id)
        call.resolve()
      } catch {
        call.reject("Failed to release blobs, \(error)", nil, error)
      }
    }
  }

  @objc func listBlobs(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let blobs = try await docStoragePool.listBlobs(universalId: id)
        let mapped = blobs.map { [
          "key": $0.key,
          "size": $0.size,
          "mime": $0.mime,
          "createdAt": $0.createdAt,
        ] }
        call.resolve(["blobs": mapped])
      } catch {
        call.reject("Failed to list blobs, \(error)", nil, error)
      }
    }
  }

  @objc func getPeerRemoteClocks(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")

        let clocks = try await docStoragePool.getPeerRemoteClocks(universalId: id, peer: peer)
        let mapped = clocks.map { [
          "docId": $0.docId,
          "timestamp": $0.timestamp,
        ] }
        call.resolve(["clocks": mapped])
      } catch {
        call.reject("Failed to get peer remote clocks, \(error)", nil, error)
      }
    }
  }

  @objc func getPeerRemoteClock(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let docId = try call.getStringEnsure("docId")

        if let clock = try await docStoragePool.getPeerRemoteClock(universalId: id, peer: peer, docId: docId) {
          call.resolve([
            "docId": clock.docId,
            "timestamp": clock.timestamp,
          ])
        } else {
          call.resolve()
        }

      } catch {
        call.reject("Failed to get peer remote clock, \(error)", nil, error)
      }
    }
  }

  @objc func setPeerRemoteClock(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let docId = try call.getStringEnsure("docId")
        let timestamp = try call.getIntEnsure("timestamp")
        try await docStoragePool.setPeerRemoteClock(
          universalId: id,
          peer: peer,
          docId: docId,
          clock: Int64(timestamp)
        )
        call.resolve()
      } catch {
        call.reject("Failed to set peer remote clock, \(error)", nil, error)
      }
    }
  }

  @objc func getPeerPulledRemoteClocks(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")

        let clocks = try await docStoragePool.getPeerPulledRemoteClocks(universalId: id, peer: peer)
        let mapped = clocks.map { [
          "docId": $0.docId,
          "timestamp": $0.timestamp,
        ] }
        call.resolve(["clocks": mapped])
      } catch {
        call.reject("Failed to get peer pulled remote clocks, \(error)", nil, error)
      }
    }
  }

  @objc func getPeerPulledRemoteClock(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let docId = try call.getStringEnsure("docId")

        if let clock = try await docStoragePool.getPeerPulledRemoteClock(universalId: id, peer: peer, docId: docId) {
          call.resolve([
            "docId": clock.docId,
            "timestamp": clock.timestamp,
          ])
        } else {
          call.resolve()
        }

      } catch {
        call.reject("Failed to get peer pulled remote clock, \(error)", nil, error)
      }
    }
  }

  @objc func setPeerPulledRemoteClock(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let docId = try call.getStringEnsure("docId")
        let timestamp = try call.getIntEnsure("timestamp")

        try await docStoragePool.setPeerPulledRemoteClock(
          universalId: id,
          peer: peer,
          docId: docId,
          clock: Int64(timestamp)
        )
        call.resolve()
      } catch {
        call.reject("Failed to set peer pulled remote clock, \(error)", nil, error)
      }
    }
  }

  @objc func getPeerPushedClock(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let docId = try call.getStringEnsure("docId")
        if let clock = try await docStoragePool.getPeerPushedClock(universalId: id, peer: peer, docId: docId) {
          call.resolve([
            "docId": clock.docId,
            "timestamp": clock.timestamp,
          ])
        } else {
          call.resolve()
        }
      } catch {
        call.reject("Failed to get peer pushed clock, \(error)", nil, error)
      }
    }
  }

  @objc func getPeerPushedClocks(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let clocks = try await docStoragePool.getPeerPushedClocks(universalId: id, peer: peer)
        let mapped = clocks.map { [
          "docId": $0.docId,
          "timestamp": $0.timestamp,
        ] }
        call.resolve(["clocks": mapped])

      } catch {
        call.reject("Failed to get peer pushed clocks, \(error)", nil, error)
      }
    }
  }

  @objc func setPeerPushedClock(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let docId = try call.getStringEnsure("docId")
        let timestamp = try call.getIntEnsure("timestamp")

        try await docStoragePool.setPeerPushedClock(
          universalId: id,
          peer: peer,
          docId: docId,
          clock: Int64(timestamp)
        )
        call.resolve()
      } catch {
        call.reject("Failed to set peer pushed clock, \(error)", nil, error)
      }
    }
  }

  @objc func getBlobUploadedAt(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let blobId = try call.getStringEnsure("blobId")

        let uploadedAt = try await docStoragePool.getBlobUploadedAt(
          universalId: id,
          peer: peer,
          blobId: blobId
        )

        call.resolve([
          "uploadedAt": uploadedAt as Any,
        ])
      } catch {
        call.reject("Failed to get blob uploaded, \(error)", nil, error)
      }
    }
  }

  @objc func setBlobUploadedAt(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let peer = try call.getStringEnsure("peer")
        let blobId = try call.getStringEnsure("blobId")
        let uploadedAt = call.getInt("uploadedAt")

        try await docStoragePool.setBlobUploadedAt(
          universalId: id,
          peer: peer,
          blobId: blobId,
          uploadedAt: uploadedAt == nil ? nil : Int64(uploadedAt!)
        )
        call.resolve()
      } catch {
        call.reject("Failed to set blob uploaded, \(error)", nil, error)
      }
    }
  }

  @objc func clearClocks(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        try await docStoragePool.clearClocks(universalId: id)
        call.resolve()
      } catch {
        call.reject("Failed to clear clocks, \(error)", nil, error)
      }
    }
  }

  @objc func crawlDocData(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let docId = try call.getStringEnsure("docId")
        let result = try await docStoragePool.crawlDocData(universalId: id, docId: docId)
        let blocks = result.blocks.map {
          [
            "blockId": $0.blockId,
            "flavour": $0.flavour,
            "content": $0.content as Any,
            "blob": $0.blob as Any,
            "refDocId": $0.refDocId as Any,
            "refInfo": $0.refInfo as Any,
            "parentFlavour": $0.parentFlavour as Any,
            "parentBlockId": $0.parentBlockId as Any,
            "additional": $0.additional as Any,
          ]
        }
        call.resolve([
          "title": result.title,
          "summary": result.summary,
          "blocks": blocks,
        ])
      } catch {
        call.reject("Failed to crawl doc data, \(error)", nil, error)
      }
    }
  }

  @objc func getDocIndexedClock(_ call: CAPPluginCall) {
    Task {
      do {
        let clock = try await docStoragePool.getDocIndexedClock(
          universalId: try call.getStringEnsure("id"),
          docId: try call.getStringEnsure("docId")
        )
        guard let clock else {
          call.resolve()
          return
        }
        call.resolve(indexedClockJson(clock))
      } catch {
        call.reject("Failed to get indexed clock, \(error)", nil, error)
      }
    }
  }

  @objc func setDocIndexedClock(_ call: CAPPluginCall) {
    Task {
      do {
        let clock = DocIndexedClock(
          docId: try call.getStringEnsure("docId"),
          timestamp: try call.getInt64Ensure("indexedClock"),
          indexerVersion: try call.getInt64Ensure("indexerVersion")
        )
        try await docStoragePool.setDocIndexedClock(universalId: try call.getStringEnsure("id"), clock: clock)
        call.resolve()
      } catch {
        call.reject("Failed to set indexed clock, \(error)", nil, error)
      }
    }
  }

  @objc func setDocIndexedClocks(_ call: CAPPluginCall) {
    Task {
      do {
        let clocks = try call.getArrayEnsure("clocks", JSObject.self).map { value in
          guard
            let docId = value["docId"] as? String,
            let timestamp = value["timestamp"] as? Double,
            let timestamp = Int64(exactly: timestamp),
            let indexerVersion = value["indexerVersion"] as? Double,
            let indexerVersion = Int64(exactly: indexerVersion)
          else {
            throw RequestParamError.request(key: "clocks")
          }
          return DocIndexedClock(
            docId: docId,
            timestamp: timestamp,
            indexerVersion: indexerVersion
          )
        }
        try await docStoragePool.setDocIndexedClocks(universalId: try call.getStringEnsure("id"), clocks: clocks)
        call.resolve()
      } catch {
        call.reject("Failed to commit indexed clocks, \(error)", nil, error)
      }
    }
  }

  @objc func clearDocIndexedClock(_ call: CAPPluginCall) {
    Task {
      do {
        try await docStoragePool.clearDocIndexedClock(
          universalId: try call.getStringEnsure("id"),
          docId: try call.getStringEnsure("docId")
        )
        call.resolve()
      } catch {
        call.reject("Failed to clear indexed clock, \(error)", nil, error)
      }
    }
  }

  @objc func indexUpsert(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let table = try call.getStringEnsure("table")
        let document = try jsonString(call, "document")
        try await docStoragePool.indexUpsert(
          universalId: id,
          table: table,
          document: document
        )
        call.resolve()
      } catch {
        call.reject("Failed to upsert index document, \(error)", nil, error)
      }
    }
  }

  @objc func indexDelete(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let table = try call.getStringEnsure("table")
        let docId = try call.getStringEnsure("docId")
        try await docStoragePool.indexDelete(
          universalId: id,
          table: table,
          docId: docId
        )
        call.resolve()
      } catch {
        call.reject("Failed to delete index document, \(error)", nil, error)
      }
    }
  }

  @objc func indexSearch(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let table = try call.getStringEnsure("table")
        let result = try await docStoragePool.indexSearch(
          universalId: id,
          table: table,
          query: try jsonString(call, "query"),
          options: try jsonString(call, "options")
        )
        call.resolve(["total": result.total, "hits": result.hits.map(indexHitJson)])
      } catch {
        call.reject("Failed to search index, \(error)", nil, error)
      }
    }
  }

  @objc func indexAggregate(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let table = try call.getStringEnsure("table")
        let result = try await docStoragePool.indexAggregate(
          universalId: id,
          table: table,
          query: try jsonString(call, "query"),
          field: try call.getStringEnsure("field"),
          limit: try call.getUInt32Ensure("limit"),
          offset: try call.getUInt32Ensure("offset"),
          hits: try optionalJsonString(call, "hits")
        )
        let buckets = result.buckets.map { bucket in
          ["key": bucket.key, "count": bucket.count, "score": bucket.score, "hits": bucket.hits.map(indexHitJson)]
        }
        call.resolve(["total": result.total, "buckets": buckets])
      } catch {
        call.reject("Failed to aggregate index, \(error)", nil, error)
      }
    }
  }

  @objc func indexDeleteByQuery(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let deleted = try await docStoragePool.indexDeleteByQuery(
          universalId: id,
          table: try call.getStringEnsure("table"),
          query: try jsonString(call, "query")
        )
        call.resolve(["deleted": deleted])
      } catch {
        call.reject("Failed to delete index documents, \(error)", nil, error)
      }
    }
  }

  @objc func indexFlush(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        try await docStoragePool.indexFlush(universalId: id)
        call.resolve()
      } catch {
        call.reject("Failed to flush index, \(error)", nil, error)
      }
    }
  }

  @objc func indexVersion(_ call: CAPPluginCall) {
    Task {
      do {
        let version = try await docStoragePool.indexVersion()
        call.resolve(["indexVersion": version])
      } catch {
        call.reject("Failed to get index version, \(error)", nil, error)
      }
    }
  }
}

private func jsonString(_ call: CAPPluginCall, _ key: String) throws -> String {
  guard let value = call.getObject(key) else { throw RequestParamError.request(key: key) }
  return String(data: try JSONSerialization.data(withJSONObject: value), encoding: .utf8)!
}

private func optionalJsonString(_ call: CAPPluginCall, _ key: String) throws -> String? {
  guard call.getObject(key) != nil else { return nil }
  return try jsonString(call, key)
}

private func indexHitJson(_ hit: IndexHit) -> [String: Any] {
  [
    "id": hit.id,
    "score": hit.score,
    "fields": hit.fields.map { ["field": $0.field, "values": $0.values] },
    "highlights": hit.highlights.map { highlight in
      [
        "field": highlight.field,
        "values": highlight.values.map { value in
          ["valueIndex": value.valueIndex, "spans": value.spans.map { ["start": $0.start, "end": $0.end] }]
        },
      ]
    },
  ]
}

private func indexedClockJson(_ clock: DocIndexedClock) -> [String: Any] {
  ["docId": clock.docId, "timestamp": clock.timestamp, "indexerVersion": clock.indexerVersion]
}
