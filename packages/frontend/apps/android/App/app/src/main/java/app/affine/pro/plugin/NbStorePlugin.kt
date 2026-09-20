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
import uniffi.affine_mobile_native.DocIndexedClock
import uniffi.affine_mobile_native.IndexHit
import uniffi.affine_mobile_native.SetBlob
import uniffi.affine_mobile_native.newDocStoragePool

private const val ANDROID_INDEXER_VERSION_OFFSET = 1u

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
              .put("content", block.content?.let(::JSArray))
              .put("blob", block.blob?.let(::JSArray))
              .put("refDocId", block.refDocId?.let(::JSArray))
              .put("refInfo", block.refInfo?.let(::JSArray))
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
  fun getDocIndexedClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val clock = docStoragePool.getDocIndexedClock(
          call.getStringEnsure("id"),
          call.getStringEnsure("docId")
        )
        call.resolve(clock?.let(::indexedClockJson))
      } catch (e: Exception) {
        call.reject("Failed to get indexed clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun setDocIndexedClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val clock = DocIndexedClock(
          call.getStringEnsure("docId"),
          call.getLong("indexedClock") ?: throw IllegalArgumentException("indexedClock is required"),
          call.getLong("indexerVersion") ?: throw IllegalArgumentException("indexerVersion is required")
        )
        docStoragePool.setDocIndexedClock(call.getStringEnsure("id"), clock)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to set indexed clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun setDocIndexedClocks(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val values = call.getArray("clocks") ?: throw IllegalArgumentException("clocks is required")
        val clocks = (0 until values.length()).map { index ->
          val value = values.getJSONObject(index)
          DocIndexedClock(
            value.getString("docId"),
            value.getLong("timestamp"),
            value.getLong("indexerVersion")
          )
        }
        docStoragePool.setDocIndexedClocks(call.getStringEnsure("id"), clocks)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to commit indexed clocks: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun clearDocIndexedClock(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        docStoragePool.clearDocIndexedClock(call.getStringEnsure("id"), call.getStringEnsure("docId"))
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to clear indexed clock: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun indexUpsert(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val table = call.getStringEnsure("table")
        val document = call.getObject("document")
          ?: throw IllegalArgumentException("document is required")
        docStoragePool.indexUpsert(id, table, document.toString())
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to upsert index document: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun indexDelete(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val table = call.getStringEnsure("table")
        val docId = call.getStringEnsure("docId")
        docStoragePool.indexDelete(id, table, docId)
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to delete index document: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun indexSearch(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val table = call.getStringEnsure("table")
        val query = call.getObject("query") ?: throw IllegalArgumentException("query is required")
        val options = call.getObject("options") ?: throw IllegalArgumentException("options is required")
        val result = docStoragePool.indexSearch(id, table, query.toString(), options.toString())
        call.resolve(
          JSObject()
            .put("total", result.total.toInt())
            .put("hits", JSArray(result.hits.map(::indexHitJson)))
        )
      } catch (e: Exception) {
        call.reject("Failed to search index: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun indexAggregate(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val table = call.getStringEnsure("table")
        val query = call.getObject("query") ?: throw IllegalArgumentException("query is required")
        val hits = call.getObject("hits")?.toString()
        val result = docStoragePool.indexAggregate(
          id,
          table,
          query.toString(),
          call.getStringEnsure("field"),
          call.getIntEnsure("limit").toUInt(),
          call.getIntEnsure("offset").toUInt(),
          hits
        )
        val buckets = result.buckets.map {
          JSObject()
            .put("key", it.key)
            .put("count", it.count.toInt())
            .put("score", it.score)
            .put("hits", JSArray(it.hits.map(::indexHitJson)))
        }
        call.resolve(JSObject().put("total", result.total.toInt()).put("buckets", JSArray(buckets)))
      } catch (e: Exception) {
        call.reject("Failed to aggregate index: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun indexDeleteByQuery(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val id = call.getStringEnsure("id")
        val table = call.getStringEnsure("table")
        val query = call.getObject("query") ?: throw IllegalArgumentException("query is required")
        val deleted = docStoragePool.indexDeleteByQuery(id, table, query.toString())
        call.resolve(JSObject().put("deleted", deleted.toInt()))
      } catch (e: Exception) {
        call.reject("Failed to delete index documents: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun indexFlush(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        docStoragePool.indexFlush(call.getStringEnsure("id"))
        call.resolve()
      } catch (e: Exception) {
        call.reject("Failed to flush index: ${e.message}", null, e)
      }
    }
  }

  @PluginMethod
  fun indexVersion(call: PluginCall) {
    launch(Dispatchers.IO) {
      try {
        val version = docStoragePool.indexVersion() + ANDROID_INDEXER_VERSION_OFFSET
        call.resolve(JSObject().put("indexVersion", version))
      } catch (e: Exception) {
        call.reject("Failed to get index version: ${e.message}", null, e)
      }
    }
  }
}

private fun indexHitJson(hit: IndexHit): JSObject {
  val fields = hit.fields.map { JSObject().put("field", it.field).put("values", JSArray(it.values)) }
  val highlights = hit.highlights.map { highlight ->
    val values = highlight.values.map { value ->
      val spans = value.spans.map { JSObject().put("start", it.start.toInt()).put("end", it.end.toInt()) }
      JSObject().put("valueIndex", value.valueIndex.toInt()).put("spans", JSArray(spans))
    }
    JSObject().put("field", highlight.field).put("values", JSArray(values))
  }
  return JSObject()
    .put("id", hit.id)
    .put("score", hit.score)
    .put("fields", JSArray(fields))
    .put("highlights", JSArray(highlights))
}

private fun indexedClockJson(clock: DocIndexedClock): JSObject = JSObject()
  .put("docId", clock.docId)
  .put("timestamp", clock.timestamp)
  .put("indexerVersion", clock.indexerVersion)
