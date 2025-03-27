#ifndef CMARK_REGISTRY_H
#define CMARK_REGISTRY_H

#include "cmark-gfm.h"
#include "cmark-gfm-extension_api.h"

#ifdef __cplusplus
extern "C" {
#endif

CMARK_GFM_EXPORT
void cmark_register_plugin(cmark_plugin_init_func reg_fn);

CMARK_GFM_EXPORT
void cmark_release_plugins(void);

CMARK_GFM_EXPORT
cmark_llist *cmark_list_syntax_extensions(cmark_mem *mem);

#ifdef __cplusplus
}
#endif

#endif
