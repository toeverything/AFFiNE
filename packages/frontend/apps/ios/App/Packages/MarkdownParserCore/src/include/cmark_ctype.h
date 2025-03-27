#ifndef CMARK_CMARK_CTYPE_H
#define CMARK_CMARK_CTYPE_H

#include "export.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Locale-independent versions of functions from ctype.h.
 * We want cmark to behave the same no matter what the system locale.
 */

CMARK_GFM_EXPORT
int cmark_isspace(char c);

CMARK_GFM_EXPORT
int cmark_ispunct(char c);

CMARK_GFM_EXPORT
int cmark_isalnum(char c);

CMARK_GFM_EXPORT
int cmark_isdigit(char c);

CMARK_GFM_EXPORT
int cmark_isalpha(char c);

#ifdef __cplusplus
}
#endif

#endif
