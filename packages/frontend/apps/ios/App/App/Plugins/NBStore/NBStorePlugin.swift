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
    CAPPluginMethod(name: "ftsAddDocument", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "ftsDeleteDocument", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "ftsSearch", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "ftsGetDocument", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "ftsGetMatches", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "ftsFlushIndex", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "ftsIndexVersion", returnType: CAPPluginReturnPromise),
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

  @objc func ftsAddDocument(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let indexName = try call.getStringEnsure("indexName")
        let docId = try call.getStringEnsure("docId")
        let text = try call.getStringEnsure("text")
        guard let index = call.getBool("index") else {
          call.reject("index is required", nil, nil)
          return
        }
        try await docStoragePool.ftsAddDocument(
          universalId: id,
          indexName: indexName,
          docId: docId,
          text: text,
          index: index
        )
        call.resolve()
      } catch {
        call.reject("Failed to add document to fts, \(error)", nil, error)
      }
    }
  }

  @objc func ftsDeleteDocument(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let indexName = try call.getStringEnsure("indexName")
        let docId = try call.getStringEnsure("docId")
        try await docStoragePool.ftsDeleteDocument(
          universalId: id,
          indexName: indexName,
          docId: docId
        )
        call.resolve()
      } catch {
        call.reject("Failed to delete document from fts, \(error)", nil, error)
      }
    }
  }

  @objc func ftsSearch(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let indexName = try call.getStringEnsure("indexName")
        let query = try call.getStringEnsure("query")
        let results = try await docStoragePool.ftsSearch(
          universalId: id,
          indexName: indexName,
          query: query
        )
        let mapped = results.map {
          [
            "id": $0.id,
            "score": $0.score,
            "terms": $0.terms,
          ] as [String: Any]
        }
        call.resolve(["results": mapped])
      } catch {
        call.reject("Failed to search fts, \(error)", nil, error)
      }
    }
  }

  @objc func ftsGetDocument(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let indexName = try call.getStringEnsure("indexName")
        let docId = try call.getStringEnsure("docId")
        let text = try await docStoragePool.ftsGetDocument(
          universalId: id,
          indexName: indexName,
          docId: docId
        )
        call.resolve(["text": text as Any])
      } catch {
        call.reject("Failed to get fts document, \(error)", nil, error)
      }
    }
  }

  @objc func ftsGetMatches(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        let indexName = try call.getStringEnsure("indexName")
        let docId = try call.getStringEnsure("docId")
        let query = try call.getStringEnsure("query")
        let matches = try await docStoragePool.ftsGetMatches(
          universalId: id,
          indexName: indexName,
          docId: docId,
          query: query
        )
        let mapped = matches.map {
          [
            "start": $0.start,
            "end": $0.end,
          ]
        }
        call.resolve(["matches": mapped])
      } catch {
        call.reject("Failed to get fts matches, \(error)", nil, error)
      }
    }
  }

  @objc func ftsFlushIndex(_ call: CAPPluginCall) {
    Task {
      do {
        let id = try call.getStringEnsure("id")
        try await docStoragePool.ftsFlushIndex(universalId: id)
        call.resolve()
      } catch {
        call.reject("Failed to flush fts index, \(error)", nil, error)
      }
    }
  }

  @objc func ftsIndexVersion(_ call: CAPPluginCall) {
    Task {
      do {
        let version = try await docStoragePool.ftsIndexVersion()
        call.resolve(["indexVersion": version])
      } catch {
        call.reject("Failed to get fts index version, \(error)", nil, error)
      }
    }
  }
}
