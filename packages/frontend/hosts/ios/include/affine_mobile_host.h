#ifndef AFFINE_MOBILE_HOST_H
#define AFFINE_MOBILE_HOST_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct AffineIosHost AffineIosHost;

typedef struct AffineWindowInsets {
  float safe_top;
  float safe_right;
  float safe_bottom;
  float safe_left;
  /* Absolute keyboard overlap height from the window bottom edge in logical points.
   * Do not subtract safe_bottom; Rust ui::WindowInsets::effective() computes
   * safe_area.bottom.max(ime.bottom). */
  float ime_bottom;
} AffineWindowInsets;

typedef struct AffineUtf16Range {
  uint32_t location;
  uint32_t length;
} AffineUtf16Range;

AffineIosHost *affine_ios_host_create(
    void *metal_layer,
    float width_pt,
    float height_pt,
    float scale_factor);

void affine_ios_host_destroy(AffineIosHost *host);

void affine_ios_host_resize(
    AffineIosHost *host,
    float width_pt,
    float height_pt,
    float scale_factor);

void affine_ios_host_set_insets(
    AffineIosHost *host,
    AffineWindowInsets insets);

uint32_t affine_ios_host_render_frame(
    AffineIosHost *host,
    double frame_timestamp_sec);

void affine_ios_host_insert_text(
    AffineIosHost *host,
    const uint16_t *utf16_ptr,
    size_t utf16_len);

void affine_ios_host_delete_backward(AffineIosHost *host);

void affine_ios_host_delete_range(
    AffineIosHost *host,
    AffineUtf16Range range);

void affine_ios_host_set_selected_range(
    AffineIosHost *host,
    AffineUtf16Range range);

void affine_ios_host_replace_range(
    AffineIosHost *host,
    AffineUtf16Range range,
    const uint16_t *utf16_ptr,
    size_t utf16_len);

void affine_ios_host_set_marked_text(
    AffineIosHost *host,
    const uint16_t *utf16_ptr,
    size_t utf16_len,
    AffineUtf16Range selected_range);

void affine_ios_host_unmark_text(AffineIosHost *host);

AffineUtf16Range affine_ios_host_selected_range(const AffineIosHost *host);

AffineUtf16Range affine_ios_host_marked_range(const AffineIosHost *host);

#ifdef __cplusplus
}
#endif

#endif
