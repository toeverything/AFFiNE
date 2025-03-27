#ifndef CMARK_REFERENCES_H
#define CMARK_REFERENCES_H

#include <stdbool.h>

#include "map.h"

#ifdef __cplusplus
extern "C" {
#endif

struct cmark_reference {
  cmark_map_entry entry;
  bool is_attributes_reference;
  cmark_chunk url;
  cmark_chunk title;
  cmark_chunk attributes;
};

typedef struct cmark_reference cmark_reference;

void cmark_reference_create(cmark_map *map, cmark_chunk *label,
                            cmark_chunk *url, cmark_chunk *title);
void cmark_reference_create_attributes(cmark_map *map, cmark_chunk *label,
                                       cmark_chunk *attributes);
cmark_map *cmark_reference_map_new(cmark_mem *mem);

#ifdef __cplusplus
}
#endif

#endif
