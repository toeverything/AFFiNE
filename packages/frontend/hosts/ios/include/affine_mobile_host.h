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
  /* Absolute docked keyboard overlap height from the window bottom edge in logical points
   * (0 for floating, split, hardware, or hidden keyboards). Do not subtract safe_bottom;
   * Rust ui::WindowInsets::effective() computes safe_area.bottom.max(ime.bottom). */
  float ime_bottom;
} AffineWindowInsets;

typedef struct AffineUtf16Range {
  uint32_t location;
  uint32_t length;
} AffineUtf16Range;

typedef struct AffinePoint {
  float x;
  float y;
} AffinePoint;

typedef struct AffineRect {
  float x;
  float y;
  float width;
  float height;
} AffineRect;

typedef struct AffineTeardropHandleLayout {
  bool visible;
  bool drop_above;
  float stem_x;
  float stem_top_y;
  float stem_bottom_y;
  float stem_width;
  float drop_center_x;
  float drop_center_y;
  float drop_radius;
  float drop_offset_x;
} AffineTeardropHandleLayout;

typedef struct AffineLoupeLayout {
  bool visible;
  float center_x;
  float center_y;
  float focus_x;
  float focus_y;
  float diameter;
  float zoom_scale;
} AffineLoupeLayout;

typedef struct AffineSelectionOverlayState {
  bool has_selection;
  bool is_collapsed;
  bool is_rtl;
  uint8_t active_drag_handle;
  bool show_floating_menu;
  AffineUtf16Range range;
  AffinePoint drag_probe_point;
  AffineTeardropHandleLayout start_handle;
  AffineTeardropHandleLayout end_handle;
  AffineLoupeLayout loupe;
  AffineRect menu_anchor_rect;
} AffineSelectionOverlayState;

typedef struct AffineKeyboardAvoidanceMetrics {
  float raw_overlap_pt;
  float ime_bottom_pt;
  float ime_above_safe_bottom_pt;
  float effective_bottom_pt;
  bool is_floating_or_split;
  bool is_hardware_or_hidden;
} AffineKeyboardAvoidanceMetrics;

typedef struct AffinePdfPageSize {
  float width_pt;
  float height_pt;
} AffinePdfPageSize;

typedef struct AffinePdfRenderPlan {
  uint32_t target_width_px;
  uint32_t target_height_px;
  size_t byte_len;
  uint32_t error;
} AffinePdfRenderPlan;

typedef void (*AffineHapticsCallback)(uint8_t pattern, void *user_data);

typedef uint64_t (*AffinePdfOpenDocFn)(
    const uint8_t *pdf_ptr,
    size_t pdf_len,
    void *user_data);

typedef void (*AffinePdfCloseDocFn)(
    uint64_t doc_id,
    void *user_data);

typedef uint32_t (*AffinePdfDocPageCountFn)(
    uint64_t doc_id,
    void *user_data);

typedef bool (*AffinePdfDocPageSizeFn)(
    uint64_t doc_id,
    uint32_t page_index,
    AffinePdfPageSize *out_size,
    void *user_data);

typedef bool (*AffinePdfDocRenderRgba8Fn)(
    uint64_t doc_id,
    uint32_t page_index,
    uint32_t target_width_px,
    uint32_t target_height_px,
    uint8_t *out_rgba_ptr,
    size_t out_rgba_len,
    void *user_data);

typedef struct AffinePdfProvider {
  AffinePdfOpenDocFn open_doc;
  AffinePdfCloseDocFn close_doc;
  AffinePdfDocPageCountFn doc_page_count;
  AffinePdfDocPageSizeFn doc_page_size;
  AffinePdfDocRenderRgba8Fn doc_render_rgba8;
  void *user_data;
} AffinePdfProvider;

typedef struct AffineSelectionRect {
  AffineRect rect;
  bool contains_start;
  bool contains_end;
} AffineSelectionRect;

typedef AffineRect (*AffineTextCaretRectFn)(
    const uint16_t *utf16_ptr,
    size_t utf16_len,
    uint32_t utf16_offset,
    float viewport_w,
    AffineWindowInsets insets,
    void *user_data);

typedef uint32_t (*AffineTextClosestOffsetFn)(
    const uint16_t *utf16_ptr,
    size_t utf16_len,
    AffinePoint point,
    uint32_t preferred_offset,
    float viewport_w,
    AffineWindowInsets insets,
    void *user_data);

typedef size_t (*AffineTextSelectionRectsFn)(
    const uint16_t *utf16_ptr,
    size_t utf16_len,
    AffineUtf16Range range,
    float viewport_w,
    AffineWindowInsets insets,
    AffineSelectionRect *out_rects,
    size_t capacity,
    void *user_data);

typedef bool (*AffineTextSelectionEndpointCaretsFn)(
    const uint16_t *utf16_ptr,
    size_t utf16_len,
    AffineUtf16Range range,
    float viewport_w,
    AffineWindowInsets insets,
    AffineRect *out_start,
    AffineRect *out_end,
    void *user_data);

typedef bool (*AffineTextRenderLoupeRgba8Fn)(
    const uint16_t *utf16_ptr,
    size_t utf16_len,
    AffineUtf16Range selected_range,
    float viewport_w,
    AffineWindowInsets insets,
    float focus_x,
    float focus_y,
    uint32_t diameter_px,
    float zoom_scale,
    uint8_t *out_rgba_ptr,
    size_t out_rgba_len,
    void *user_data);

typedef struct AffineTextProvider {
  AffineTextCaretRectFn caret_rect;
  AffineTextClosestOffsetFn closest_offset;
  AffineTextSelectionRectsFn selection_rects;
  AffineTextSelectionEndpointCaretsFn selection_endpoint_carets;
  AffineTextRenderLoupeRgba8Fn render_loupe_rgba8;
  void *user_data;
} AffineTextProvider;

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

typedef void (*AffineTextInputChangedCallback)(uint8_t change_kind, void *user_data);

void *affine_ios_host_metal_layer(const AffineIosHost *host);

size_t affine_ios_host_utf16_len(const AffineIosHost *host);

size_t affine_ios_host_copy_utf16(
    const AffineIosHost *host,
    uint16_t *out_ptr,
    size_t capacity);

void affine_ios_host_touch_event(
    AffineIosHost *host,
    uint64_t touch_id,
    uint8_t phase,
    float x,
    float y);

void affine_ios_host_key_down(
    AffineIosHost *host,
    const char *key,
    const char *key_char,
    bool shift,
    bool cmd,
    bool ctrl,
    bool alt);

void affine_ios_host_set_form_factor(
    AffineIosHost *host,
    uint8_t form_factor);

bool affine_ios_host_edgeless_readonly(const AffineIosHost *host);

bool affine_ios_host_database_readonly(const AffineIosHost *host);

bool affine_ios_host_wants_software_keyboard(const AffineIosHost *host);

void affine_ios_host_set_mode(
    AffineIosHost *host,
    uint8_t mode);

void affine_ios_host_set_text_input_callback(
    AffineIosHost *host,
    AffineTextInputChangedCallback cb,
    void *user_data);

uint64_t affine_ios_host_text_input_change_seq(const AffineIosHost *host);

void affine_ios_host_reset_empty_doc(AffineIosHost *host);

void affine_ios_host_load_showcase_doc(AffineIosHost *host);

char *affine_ios_auth_canonical_endpoint(const char *endpoint);

char *affine_ios_auth_legacy_storage_endpoint_key(const char *endpoint);

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

bool affine_ios_legacy_is_permitted_key(const char *key);
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

AffineWindowInsets affine_ios_host_insets(const AffineIosHost *host);

float affine_ios_host_ime_above_safe_bottom(const AffineIosHost *host);

AffineKeyboardAvoidanceMetrics affine_ios_keyboard_compute_avoidance(
    AffineRect window_bounds,
    AffineRect keyboard_frame_in_window,
    float safe_bottom,
    bool is_hidden);

void affine_ios_host_begin_keyboard_transition(
    AffineIosHost *host,
    float target_ime_bottom_pt,
    double start_timestamp_sec,
    double duration_sec);

AffineWindowInsets affine_ios_host_sample_keyboard_frame(
    AffineIosHost *host,
    float safe_top,
    float safe_right,
    float safe_bottom,
    float safe_left,
    double frame_timestamp_sec);

AffineSelectionOverlayState affine_ios_host_selection_set(
    AffineIosHost *host,
    AffineRect start_caret,
    AffineRect end_caret,
    AffineUtf16Range range,
    uint8_t writing_direction);

void affine_ios_host_selection_clear(AffineIosHost *host);

AffineSelectionOverlayState affine_ios_host_selection_state(
    const AffineIosHost *host);

uint8_t affine_ios_host_selection_hit_test(
    const AffineIosHost *host,
    AffinePoint point,
    float hit_radius_pt);

bool affine_ios_host_selection_begin_drag(
    AffineIosHost *host,
    uint8_t handle_kind,
    AffinePoint touch_point);

AffinePoint affine_ios_host_selection_drag_probe(
    const AffineIosHost *host,
    AffinePoint touch_point);

uint32_t affine_ios_host_selection_drag_anchor(
    const AffineIosHost *host);

AffineSelectionOverlayState affine_ios_host_selection_apply_drag_endpoints(
    AffineIosHost *host,
    AffinePoint touch_point,
    uint32_t target_offset,
    AffineRect start_caret,
    AffineRect end_caret);

AffineSelectionOverlayState affine_ios_host_selection_end_drag(
    AffineIosHost *host);

void affine_ios_host_set_text_provider(
    AffineIosHost *host,
    AffineTextProvider provider);

uint8_t affine_ios_host_text_writing_direction(
    const AffineIosHost *host);

AffineRect affine_ios_host_text_caret_rect(
    const AffineIosHost *host,
    uint32_t utf16_offset);

size_t affine_ios_host_text_selection_rects(
    const AffineIosHost *host,
    AffineUtf16Range range,
    AffineSelectionRect *out_rects,
    size_t capacity);

bool affine_ios_host_text_selection_endpoint_carets(
    const AffineIosHost *host,
    AffineUtf16Range range,
    AffineRect *out_start,
    AffineRect *out_end);

uint32_t affine_ios_host_text_closest_offset(
    const AffineIosHost *host,
    AffinePoint point);

uint32_t affine_ios_host_text_closest_offset_preferred(
    const AffineIosHost *host,
    AffinePoint point,
    uint32_t preferred_offset);

AffineIosByteBuffer affine_ios_host_render_loupe_rgba8(
    const AffineIosHost *host,
    float focus_x,
    float focus_y,
    uint32_t diameter_px,
    float zoom_scale);

uint32_t affine_ios_pdf_validate_bytes(
    const uint8_t *pdf_ptr,
    size_t pdf_len);

AffinePdfRenderPlan affine_ios_pdf_plan_render(
    uint32_t page_index,
    uint32_t page_count,
    uint32_t target_width_px,
    uint32_t target_height_px);

void affine_ios_host_set_pdf_provider(
    AffineIosHost *host,
    AffinePdfProvider provider);

uint64_t affine_ios_host_pdf_open(
    const AffineIosHost *host,
    const uint8_t *pdf_ptr,
    size_t pdf_len,
    uint32_t *out_error);

void affine_ios_host_pdf_close(
    const AffineIosHost *host,
    uint64_t doc_id);

uint32_t affine_ios_host_pdf_doc_page_count(
    const AffineIosHost *host,
    uint64_t doc_id,
    uint32_t *out_error);

bool affine_ios_host_pdf_doc_page_size(
    const AffineIosHost *host,
    uint64_t doc_id,
    uint32_t page_index,
    AffinePdfPageSize *out_size,
    uint32_t *out_error);

AffineIosByteBuffer affine_ios_host_pdf_doc_render_page_rgba8(
    const AffineIosHost *host,
    uint64_t doc_id,
    uint32_t page_index,
    uint32_t target_width_px,
    uint32_t target_height_px,
    uint32_t *out_error);

/* Stateless convenience wrappers; production callers should prefer affine_ios_host_pdf_open/close handles. */
uint32_t affine_ios_host_pdf_page_count(
    const AffineIosHost *host,
    const uint8_t *pdf_ptr,
    size_t pdf_len,
    uint32_t *out_error);

AffineIosByteBuffer affine_ios_host_pdf_render_page_rgba8(
    const AffineIosHost *host,
    const uint8_t *pdf_ptr,
    size_t pdf_len,
    uint32_t page_index,
    uint32_t target_width_px,
    uint32_t target_height_px,
    uint32_t *out_error);

void affine_ios_host_set_haptics_callback(
    AffineIosHost *host,
    AffineHapticsCallback callback,
    void *user_data);

bool affine_ios_host_trigger_haptic(
    AffineIosHost *host,
    uint8_t pattern);

uint64_t affine_ios_host_haptic_count(
    const AffineIosHost *host,
    uint8_t pattern);

uint64_t affine_ios_host_haptic_total_count(
    const AffineIosHost *host);

#ifdef __cplusplus
}
#endif

#endif
