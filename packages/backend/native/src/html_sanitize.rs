#[napi]
pub fn html_sanitize(input: String) -> String {
  v_htmlescape::escape(&input).to_string()
}
