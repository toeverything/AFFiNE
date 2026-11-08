package app.affine.pro

internal class AndroidImeState {
    @Volatile
    var clearRequestGeneration: Long = 0L

    @Volatile
    var editorFocused: Boolean = false

    @Volatile
    var lastDeleteIntentAtMs: Long = 0L

    @Volatile
    var restartInputGeneration: Int = 0

    @Synchronized
    fun nextRestartGeneration(): Int {
        restartInputGeneration += 1
        return restartInputGeneration
    }

    @Synchronized
    fun nextClearRequestGeneration(): Long {
        clearRequestGeneration += 1
        return clearRequestGeneration
    }
}
