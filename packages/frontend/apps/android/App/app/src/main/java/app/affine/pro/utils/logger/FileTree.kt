package app.affine.pro.utils.logger

import android.content.Context
import android.net.Uri
import android.util.Log
import app.affine.pro.BuildConfig
import app.affine.pro.service.CookieStore
import com.google.firebase.ktx.Firebase
import com.google.firebase.storage.ktx.storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import timber.log.Timber
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class FileTree(context: Context) : Timber.Tree() {

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    private val logDirectory: File = File(context.filesDir, "logs")
    private val currentLogFile: File

    init {
        if (!logDirectory.exists()) {
            logDirectory.mkdirs()
        }
        val today = dateFormat.format(Date())
        currentLogFile = File(logDirectory, "$today.log")
        if (!currentLogFile.exists()) {
            try {
                currentLogFile.createNewFile()
            } catch (e: IOException) {
                Timber.e(e, "Create log file fail.")
            }
        }
    }

    suspend fun checkAndUploadOldLogs(server: HttpUrl) {
        val today = dateFormat.format(Date())
        logDirectory.listFiles()?.forEach { file ->
            val fileName = file.name
            if (fileName.endsWith(".log") && !fileName.startsWith(today)) {
                uploadLogToFirebase(server, file)
            }
        }
    }

    private suspend fun uploadLogToFirebase(server: HttpUrl, file: File) =
        suspendCancellableCoroutine { continuation ->
            val user = CookieStore.getCookie(server, CookieStore.AFFINE_USER_ID)
                ?: return@suspendCancellableCoroutine
            val storageRef = Firebase.storage.reference
            val logFileRef = storageRef.child("android_log/$user/${file.name}")

            val uploadTask = logFileRef.putFile(Uri.fromFile(file))
            uploadTask.addOnSuccessListener {
                if (file.delete()) {
                    if (continuation.isActive) continuation.resume(true) { _, _, _ -> }
                } else {
                    if (continuation.isActive) continuation.resume(false) { _, _, _ -> }
                }
            }.addOnFailureListener { e ->
                if (continuation.isActive) continuation.resume(false) {}
            }

            continuation.invokeOnCancellation {
                if (uploadTask.isInProgress) {
                    uploadTask.cancel()
                }
            }
        }

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        if (priority < Log.INFO) {
            return
        }

        val level = when (priority) {
            Log.ASSERT -> "[assert]"
            Log.ERROR -> "[error]"
            Log.WARN -> "[warn]"
            else -> "[info]"
        }
        val log = StringBuilder(level)
            .append(tag?.let { "[$tag]" } ?: "")
            .append(" ")
            .append(message)
            .toString()

        MainScope().launch {
            try {
                val timestamp =
                    SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.getDefault()).format(Date())
                val logMessage = "[$timestamp] $log\n"
                withContext(Dispatchers.IO) {
                    FileOutputStream(currentLogFile, true).use {
                        it.write(logMessage.toByteArray())
                        t?.stackTraceToString()?.let { stacktrace ->
                            it.write(stacktrace.toByteArray())
                        }
                    }
                }
            } catch (e: IOException) {
                Timber.e(e, "Failed to write to log file")
            }
        }

    }

    companion object {
        fun get() = Timber.forest().filterIsInstance<FileTree>().firstOrNull()
    }
}