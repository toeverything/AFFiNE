package app.affine.pro.plugin

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.Dispatchers
import timber.log.Timber
import uniffi.affine_mobile_native.DocRecord
import uniffi.affine_mobile_native.SetBlob
import uniffi.affine_mobile_native.newDocStoragePool

@CapacitorPlugin(name = "NbStoreDocStorage")
class NbStorePlugin : Plugin() {

  private val docStoragePool by lazy {
    newDocStoragePool()
  }

  @PluginMethod
  fun connect(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val spaceId = call.getStringEnsure("spaceId")
        val spaceType = call.getStringEnsure("spaceType")
        val peer = call.getStringEnsure("peer")
        val appStoragePath = activity?.filesDir ?: run {
          Timber.w("Failed to connect storage, cannot access device file system.")
          call.reject("Failed to connect storage, cannot access device file system.")
          return@launch
        }
        val peerDir = appStoragePath.resolve("workspaces")
          .resolve(spaceType)
          .resolve(
            peer.replace(Regex("[/!@#$%^&*()+~`\"':;,?<>|]"), "_")
              .replace(Regex("_+"), "_")
              .replace(Regex("_+$"), "")
          )
        Timber.i("NbStore connecting... peerDir[$peerDir].")
        peerDir.mkdirs()
        val db = peerDir.resolve("$spaceId.db")
        docStoragePool.connect(id, db.path)
        Timber.i("NbStore connected [ id = $id ].")
        call.resolve()
      } catch (e: Exception) {
        Timber.e(e, "Failed to connect NbStore.")
        call.reject("Failed to connect NbStore.", e)
      }
    }
  }

  @PluginMethod
  fun disconnect(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        docStoragePool.disconnect(universalId = id)
        Timber.i("NbStore disconnected [ id = $id ].")
        call.resolve()
      } catch (e: Exception) {
        Timber.e(e, "Failed to disconnect NbStore")
        call.reject("Failed to disconnect NbStore", null, e)
      }
    }
  }

  @PluginMethod
  fun setSpaceId(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val spaceId = call.getStringEnsure("spaceId")
        docStoragePool.setSpaceId(universalId = id, spaceId = spaceId)
        Timber.i("Set space id: [ id = $id, spaceId = $spaceId ].")
        call.resolve()
      } catch (e: Exception) {
        Timber.e(e, "Failed to set space id.")
        call.reject("Failed to set space id, ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun pushUpdate(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val docId = call.getStringEnsure("docId")
        val data = call.getStringEnsure("data")
        val timestamp = docStoragePool.pushUpdate(
          universalId = id,
          docId = docId,
          update = data
        )
        call.resolve(JSObject().put("timestamp", timestamp))
      } catch (e: Exception) {
        call.reject("Failed to push update, ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getDocSnapshot(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val docId = call.getStringEnsure("docId")
        val record = docStoragePool.getDocSnapshot(universalId = id, docId = docId)
        record?.let {
          call.resolve(
            JSObject()
              .put("docId", it.docId)
              .put("bin", it.bin)
              .put("timestamp", it.timestamp)
          )
        } ?: call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to get doc snapshot, ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun setDocSnapshot(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val docId = call.getStringEnsure("docId")
        val bin = call.getStringEnsure("bin")
        val timestamp = call.getLongEnsure("timestamp")
        val success = docStoragePool.setDocSnapshot(
          universalId = id,
          snapshot = DocRecord(docId, bin, timestamp)
        )
        call.resolve(JSObject().put("success", success))
      } catch (e: Exception) {
        call.reject("Failed to set doc snapshot, ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getDocUpdates(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val docId = call.getStringEnsure("docId")
        val updates = docStoragePool.getDocUpdates(universalId = id, docId = docId)
        val mapped = JSArray(updates.map {
          JSObject()
            .put("docId", it.docId)
            .put("timestamp", it.timestamp)
            .put("bin", it.bin)
        })
        call.resolve(JSObject().put("updates", mapped))
      } catch (e: Exception) {
        call.reject("Failed to get doc updates, ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun markUpdatesMerged(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val docId = call.getStringEnsure("docId")
        val times = call.getListEnsure<Long>("timestamps")
        val count = docStoragePool.markUpdatesMerged(
          universalId = id,
          docId = docId,
          updates = times
        )
        call.resolve(JSObject().put("count", count))
      } catch (e: Exception) {
        call.reject("Failed to mark updates merged, ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun deleteDoc(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val docId = call.getStringEnsure("docId")
        docStoragePool.deleteDoc(universalId = id, docId = docId)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to delete doc: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getDocClocks(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val after = call.getLong("after")
        val docClocks = docStoragePool.getDocClocks(
          universalId = id,
          after = after,
        )
        val mapped = JSArray(docClocks.map {
          JSObject()
            .put("docId", it.docId)
            .put("timestamp", it.timestamp)
        })
        call.resolve(JSObject().put("clocks", mapped))
      } catch (e: Exception) {
        call.reject("Failed to get doc clocks: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getDocClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val docId = call.getStringEnsure("docId")
        val docClock = docStoragePool.getDocClock(universalId = id, docId = docId)
        docClock?.let {
          call.resolve(
            JSObject()
              .put("docId", it.docId)
              .put("timestamp", it.timestamp)
          )
        } ?: call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to get doc clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getBlob(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val key = call.getStringEnsure("key")
        val blob = docStoragePool.getBlob(universalId = id, key = key)
        blob?.let {
          call.resolve(
            JSObject()
              .put("key", it.key)
              .put("data", it.data)
              .put("mime", it.mime)
              .put("size", it.size)
              .put("createdAt", it.createdAt)
          )
        } ?: call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to get blob: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun setBlob(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val key = call.getStringEnsure("key")
        val data = call.getStringEnsure("data")
        val mime = call.getStringEnsure("mime")
        docStoragePool.setBlob(universalId = id, blob = SetBlob(key, data, mime))
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to set blob: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun deleteBlob(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val key = call.getStringEnsure("key")
        val permanently = call.getBoolean("permanently") ?: false
        docStoragePool.deleteBlob(universalId = id, key = key, permanently = permanently)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to delete blob: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun releaseBlobs(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        docStoragePool.releaseBlobs(universalId = id)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to release blobs: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun listBlobs(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val blobs = docStoragePool.listBlobs(universalId = id)
        val mapped = JSArray(blobs.map {
          JSObject()
            .put("key", it.key)
            .put("size", it.size)
            .put("mime", it.mime)
            .put("createdAt", it.createdAt)
        })
        call.resolve(JSObject().put("blobs", mapped))
      } catch (e: Exception) {
        call.reject("Failed to list blobs: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getPeerRemoteClocks(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val clocks = docStoragePool.getPeerRemoteClocks(
          universalId = id,
          peer = peer,
        )
        val mapped = JSArray(clocks.map {
          JSObject()
            .put("docId", it.docId)
            .put("timestamp", it.timestamp)
        })
        call.resolve(JSObject().put("clocks", mapped))
      } catch (e: Exception) {
        call.reject("Failed to get peer remote clocks: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getPeerRemoteClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val docId = call.getStringEnsure("docId")
        val clock = docStoragePool.getPeerRemoteClock(
          universalId = id,
          peer = peer,
          docId = docId,
        )
        clock?.let {
          call.resolve(
            JSObject()
              .put("docId", it.docId)
              .put("timestamp", it.timestamp)
          )
        } ?: call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to get peer remote clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun setPeerRemoteClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val docId = call.getStringEnsure("docId")
        val timestamp = call.getLongEnsure("timestamp")
        docStoragePool.setPeerRemoteClock(
          universalId = id,
          peer = peer,
          docId = docId,
          clock = timestamp,
        )
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to set peer remote clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getPeerPulledRemoteClocks(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val clocks = docStoragePool.getPeerPulledRemoteClocks(
          universalId = id,
          peer = peer,
        )
        val mapped = JSArray(clocks.map {
          JSObject()
            .put("docId", it.docId)
            .put("timestamp", it.timestamp)
        })
        call.resolve(JSObject().put("clocks", mapped))
      } catch (e: Exception) {
        call.reject("Failed to get peer pulled remote clocks: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getPeerPulledRemoteClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val docId = call.getStringEnsure("docId")
        val clock = docStoragePool.getPeerPulledRemoteClock(
          universalId = id,
          peer = peer,
          docId = docId,
        )
        clock?.let {
          call.resolve(
            JSObject()
              .put("docId", it.docId)
              .put("timestamp", it.timestamp)
          )
        } ?: call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to get peer pulled remote clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun setPeerPulledRemoteClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val docId = call.getStringEnsure("docId")
        val timestamp = call.getLongEnsure("timestamp")
        docStoragePool.setPeerPulledRemoteClock(
          universalId = id,
          peer = peer,
          docId = docId,
          clock = timestamp,
        )
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to set peer pulled remote clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getPeerPushedClocks(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val clocks = docStoragePool.getPeerPushedClocks(
          universalId = id,
          peer = peer,
        )
        val mapped = JSArray(clocks.map {
          JSObject()
            .put("docId", it.docId)
            .put("timestamp", it.timestamp)
        })
        call.resolve(JSObject().put("clocks", mapped))
      } catch (e: Exception) {
        call.reject("Failed to get peer pushed clocks: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getPeerPushedClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val docId = call.getStringEnsure("docId")
        val clock = docStoragePool.getPeerPushedClock(
          universalId = id,
          peer = peer,
          docId = docId,
        )
        clock?.let {
          call.resolve(
            JSObject()
              .put("docId", it.docId)
              .put("timestamp", it.timestamp)
          )
        } ?: call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to get peer pushed clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun setPeerPushedClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val docId = call.getStringEnsure("docId")
        val timestamp = call.getLongEnsure("timestamp")
        docStoragePool.setPeerPushedClock(
          universalId = id,
          peer = peer,
          docId = docId,
          clock = timestamp,
        )
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to set peer pushed clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun getBlobUploadedAt(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val blobId = call.getStringEnsure("blobId")
        val uploadedAt = docStoragePool.getBlobUploadedAt(
          universalId = id,
          peer = peer,
          blobId = blobId,
        )
        uploadedAt?.let {
          call.resolve(JSObject().put("uploadedAt", it))
        } ?: call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to get blob uploaded: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun setBlobUploadedAt(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val peer = call.getStringEnsure("peer")
        val blobId = call.getStringEnsure("blobId")
        val uploadedAt = call.getLong("uploadedAt")
        docStoragePool.setBlobUploadedAt(
          universalId = id,
          peer = peer,
          blobId = blobId,
          uploadedAt = uploadedAt,
        )
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to set blob uploaded: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun clearClocks(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        docStoragePool.clearClocks(universalId = id)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to clear clocks: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun crawlDocData(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val docId = call.getStringEnsure("docId")
        val result = docStoragePool.crawlDocData(
          universalId = id,
          docId = docId,
        )
        val blocks = JSArray(
          result.blocks.map { block ->
            JSObject()
              .put("blockId", block.blockId)
              .put("flavour", block.flavour)
              .put("content", block.content)
              .put("blob", block.blob)
              .put("refDocId", block.refDocId)
              .put("refInfo", block.refInfo)
              .put("parentFlavour", block.parentFlavour)
              .put("parentBlockId", block.parentBlockId)
              .put("additional", block.additional)
          }
        )
        call.resolve(
          JSObject()
            .put("title", result.title)
            .put("blocks", blocks)
            .put("summary", result.summary)
        )
      } catch (e: Exception) {
        call.reject("Failed to crawl doc data: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun ftsAddDocument(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val indexName = call.getStringEnsure("indexName")
        val docId = call.getStringEnsure("docId")
        val text = call.getStringEnsure("text")
        val index = call.getBoolean("index")
          ?: throw IllegalArgumentException("index is required")
        docStoragePool.ftsAddDocument(id, indexName, docId, text, index)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to add document to fts: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun ftsDeleteDocument(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val indexName = call.getStringEnsure("indexName")
        val docId = call.getStringEnsure("docId")
        docStoragePool.ftsDeleteDocument(id, indexName, docId)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to delete document from fts: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun ftsSearch(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val indexName = call.getStringEnsure("indexName")
        val query = call.getStringEnsure("query")
        val results = docStoragePool.ftsSearch(id, indexName, query)
        val mapped = results.map {
          JSObject()
            .put("id", it.id)
            .put("score", it.score)
            .put("terms", JSArray(it.terms))
        }
        call.resolve(
          JSObject().put("results", JSArray(mapped))
        )
      } catch (e: Exception) {
        call.reject("Failed to search fts: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun ftsGetDocument(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val indexName = call.getStringEnsure("indexName")
        val docId = call.getStringEnsure("docId")
        val text = docStoragePool.ftsGetDocument(id, indexName, docId)
        call.resolve(JSObject().put("text", text))
      } catch (e: Exception) {
        call.reject("Failed to get fts document: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun ftsGetMatches(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val indexName = call.getStringEnsure("indexName")
        val docId = call.getStringEnsure("docId")
        val query = call.getStringEnsure("query")
        val matches = docStoragePool.ftsGetMatches(id, indexName, docId, query)
        val mapped = matches.map {
          JSObject()
            .put("start", it.start.toInt())
            .put("end", it.end.toInt())
        }
        call.resolve(JSObject().put("matches", JSArray(mapped)))
      } catch (e: Exception) {
        call.reject("Failed to get fts matches: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun ftsFlushIndex(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        docStoragePool.ftsFlushIndex(id)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to flush fts index: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun ftsIndexVersion(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val version = docStoragePool.ftsIndexVersion()
        call.resolve(JSObject().put("indexVersion", version))
      } catch (e: Exception) {
        call.reject("Failed to get fts index version: ${e.message}", null, e)
      }
    }
  }
}
