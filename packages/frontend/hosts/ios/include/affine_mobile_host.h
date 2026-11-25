#ifndef AFFINE_MOBILE_HOST_H
#define AFFINE_MOBILE_HOST_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct AffineIosHost AffineIosHost;
typedef struct AffineIosWorkspace AffineIosWorkspace;

typedef struct AffineIosByteBuffer {
  uint8_t *ptr;
  size_t len;
} AffineIosByteBuffer;

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

void affine_ios_string_free(char *ptr);

void affine_ios_bytes_free(AffineIosByteBuffer buf);

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

bool affine_ios_host_is_dirty(const AffineIosHost *host);

void affine_ios_host_request_frame(AffineIosHost *host);

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

char *affine_ios_auth_canonical_endpoint(const char *endpoint);

char *affine_ios_auth_parse_keychain_json(
    const char *json,
    double now_unix_secs,
    double min_validity_secs,
    bool *out_is_valid,
    double *out_access_expires_unix_secs);

char *affine_ios_auth_encode_token_response_json(
    const char *response_json,
    int64_t now_unix_ms);

char *affine_ios_auth_resolve_installation_id(
    const char *existing,
    bool *out_created);

bool affine_ios_auth_error_permanently_invalidates_session(const char *error_json);

char *affine_ios_legacy_storage_parse_snapshot_json(const char *snapshot_json);

char *affine_ios_legacy_storage_plan_write_back_json(
    const char *state_json,
    const char *previous_keys_json);

bool affine_ios_legacy_storage_verify_write_back_json(
    const char *plan_json,
    const char *readback_snapshot_json);

char *affine_ios_workspace_resolve_path(
    const char *documents_dir,
    const char *space_type,
    const char *peer,
    const char *space_id);

AffineIosWorkspace *affine_ios_workspace_open(
    const char *documents_dir,
    const char *space_type,
    const char *peer,
    const char *space_id,
    const char *allowlist_json_or_null);

void affine_ios_workspace_close(AffineIosWorkspace *ws);

AffineIosByteBuffer affine_ios_workspace_read_doc(
    const AffineIosWorkspace *ws,
    const char *doc_id);

char *affine_ios_workspace_read_page_snapshot_json(
    const AffineIosWorkspace *ws,
    const char *doc_id,
    uint64_t client_id);

AffineIosByteBuffer affine_ios_workspace_edit_paragraph_text(
    const AffineIosWorkspace *ws,
    const char *doc_id,
    const char *block_id,
    uint64_t utf16_index,
    uint64_t delete_len,
    const char *insert_text,
    uint64_t client_id,
    int64_t now_ms);

AffineIosByteBuffer affine_ios_workspace_export_doc_diff(
    const AffineIosWorkspace *ws,
    const char *doc_id,
    const uint8_t *remote_sv_ptr,
    size_t remote_sv_len);

AffineIosByteBuffer affine_ios_workspace_apply_remote_update(
    const AffineIosWorkspace *ws,
    const char *doc_id,
    const uint8_t *update_ptr,
    size_t update_len,
    const char *peer,
    int64_t remote_clock_ms,
    int64_t local_now_ms);

bool affine_ios_workspace_checkpoint_passive(const AffineIosWorkspace *ws);

bool affine_ios_workspace_checkpoint(const AffineIosWorkspace *ws);

#ifdef __cplusplus
}
#endif

#endif
