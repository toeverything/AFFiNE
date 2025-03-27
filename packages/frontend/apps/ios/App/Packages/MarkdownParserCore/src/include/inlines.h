#ifndef CMARK_INLINES_H
#define CMARK_INLINES_H

#include <stdbool.h>
#include <stdlib.h>

#include "references.h"

#ifdef __cplusplus
extern "C" {
#endif

cmark_chunk cmark_clean_url(cmark_mem *mem, cmark_chunk *url);
cmark_chunk cmark_clean_title(cmark_mem *mem, cmark_chunk *title);
cmark_chunk cmark_clean_attributes(cmark_mem *mem, cmark_chunk *attributes);

CMARK_GFM_EXPORT
void cmark_parse_inlines(cmark_parser *parser,
                         cmark_node *parent,
                         cmark_map *refmap,
                         int options);

bufsize_t cmark_parse_reference_inline(cmark_mem *mem, cmark_chunk *input,
                                       cmark_map *refmap);

bufsize_t cmark_parse_reference_attributes_inline(cmark_mem *mem, cmark_chunk *input,
                                                  cmark_map *refmap);

void cmark_inlines_add_special_character(cmark_parser *parser, unsigned char c, bool emphasis);
void cmark_inlines_remove_special_character(cmark_parser *parser, unsigned char c, bool emphasis);

void cmark_set_default_skip_chars(int8_t **skip_chars, bool use_memcpy);
void cmark_set_default_special_chars(int8_t **special_chars, bool use_memcpy);

#ifdef __cplusplus
}
#endif

#endif
