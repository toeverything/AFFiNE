#ifndef CMARK_MUTEX_H
#define CMARK_MUTEX_H

#include <stdbool.h>

#ifdef CMARK_THREADING

#if defined(__unix__) || (defined(__APPLE__) && defined(__MACH__))
#include <unistd.h>
#endif

#if defined (_POSIX_THREADS)

#include <pthread.h>

#define CMARK_DEFINE_ONCE(NAME) static pthread_once_t NAME##_once = PTHREAD_ONCE_INIT;

#define CMARK_RUN_ONCE(NAME, FUNC) pthread_once(&NAME##_once, FUNC)

#define CMARK_DEFINE_LOCK(NAME) \
static pthread_mutex_t NAME##_lock; \
CMARK_DEFINE_ONCE(NAME); \
static void initialize_##NAME() { pthread_mutex_init(&NAME##_lock, NULL); }

#define CMARK_INITIALIZE_AND_LOCK(NAME) \
CMARK_RUN_ONCE(NAME, initialize_##NAME); \
pthread_mutex_lock(&NAME##_lock);

#define CMARK_UNLOCK(NAME) pthread_mutex_unlock(&NAME##_lock);

#elif defined(_WIN32) // building for windows

#define _WIN32_WINNT 0x0600 // minimum target of Windows Vista
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#define CMARK_DEFINE_ONCE(NAME) static INIT_ONCE NAME##_once = INIT_ONCE_STATIC_INIT;

#define CMARK_RUN_ONCE(NAME, FUNC) do { \
  BOOL fStatus; BOOL fPending; \
  fStatus = InitOnceBeginInitialize(&NAME##_once, 0, &fPending, NULL); \
  if (!fStatus || !fPending) break; \
  FUNC(); \
  InitOnceComplete(&NAME##_once, 0, NULL); \
} while (0);

#define CMARK_DEFINE_LOCK(NAME) static SRWLOCK NAME##_lock = SRWLOCK_INIT;

#define CMARK_INITIALIZE_AND_LOCK(NAME) AcquireSRWLockExclusive(&NAME##_lock);

#define CMARK_UNLOCK(NAME) ReleaseSRWLockExclusive(&NAME##_lock);

#endif

#else // no threading support

static inline bool check_latch(int *latch) {
  if (!*latch) {
    *latch = 1;
    return true;
  } else {
    return false;
  }
}

#define CMARK_DEFINE_LOCK(NAME)
#define CMARK_INITIALIZE_AND_LOCK(NAME)
#define CMARK_UNLOCK(NAME)

#define CMARK_DEFINE_ONCE(NAME) static int NAME = 0;

#define CMARK_RUN_ONCE(NAME, FUNC) if (check_latch(&NAME)) FUNC();

#endif // CMARK_THREADING

#endif // CMARK_MUTEX_H
