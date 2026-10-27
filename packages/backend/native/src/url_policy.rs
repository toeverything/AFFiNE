use napi_derive::napi;
use url::Url;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum UrlPolicyError {
  Denied,
}

type UrlPolicyResult<T> = Result<T, UrlPolicyError>;

#[napi(object)]
pub struct UrlQueryPair {
  pub name: String,
  pub value: String,
}

fn napi_error(_: UrlPolicyError) -> napi::Error {
  napi::Error::from_reason("URL is not allowed")
}

fn parse_http_url(input: &str, base_url: &str) -> UrlPolicyResult<Url> {
  if input.is_empty() {
    return Err(UrlPolicyError::Denied);
  }

  let base = Url::parse(base_url).map_err(|_| UrlPolicyError::Denied)?;
  let url = base.join(input).map_err(|_| UrlPolicyError::Denied)?;
  if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
    return Err(UrlPolicyError::Denied);
  }
  Ok(url)
}

fn has_allowed_origin(url: &Url, allowed_origins: &[String]) -> bool {
  allowed_origins.iter().any(|origin| {
    Url::parse(origin)
      .ok()
      .is_some_and(|allowed| matches!(allowed.scheme(), "http" | "https") && url.origin() == allowed.origin())
  })
}

fn matches_trusted_domain(url: &Url, trusted_domains: &[String]) -> bool {
  let Some(hostname) = url.host_str() else {
    return false;
  };
  let hostname = hostname.trim_end_matches('.');
  trusted_domains.iter().any(|domain| {
    let domain = domain.trim_end_matches('.');
    !domain.is_empty() && (hostname.eq_ignore_ascii_case(domain) || hostname.ends_with(&format!(".{domain}")))
  })
}

fn path_is_within(path: &str, base_path: &str) -> bool {
  base_path == "/"
    || path == base_path
    || path
      .strip_prefix(base_path)
      .is_some_and(|suffix| suffix.starts_with('/'))
}

#[napi]
pub fn build_safe_callback_url(
  input: String,
  base_url: String,
  allowed_origins: Vec<String>,
  query_pairs: Vec<UrlQueryPair>,
) -> napi::Result<String> {
  build_safe_callback_url_canonical(&input, &base_url, &allowed_origins, &query_pairs).map_err(napi_error)
}

fn build_safe_callback_url_canonical(
  input: &str,
  base_url: &str,
  allowed_origins: &[String],
  query_pairs: &[UrlQueryPair],
) -> UrlPolicyResult<String> {
  let mut url = parse_http_url(input, base_url)?;
  if !has_allowed_origin(&url, allowed_origins) {
    return Err(UrlPolicyError::Denied);
  }
  if !query_pairs.is_empty() {
    let existing = url
      .query_pairs()
      .filter(|(name, _)| !query_pairs.iter().any(|pair| pair.name.as_str() == name.as_ref()))
      .map(|(name, value)| (name.into_owned(), value.into_owned()))
      .collect::<Vec<_>>();
    url
      .query_pairs_mut()
      .clear()
      .extend_pairs(existing)
      .extend_pairs(query_pairs.iter().map(|pair| (&pair.name, &pair.value)));
  }
  Ok(url.into())
}

#[napi]
pub fn evaluate_redirect_uri(
  input: String,
  base_url: String,
  allowed_origins: Vec<String>,
  trusted_domains: Vec<String>,
  query_pairs: Vec<UrlQueryPair>,
) -> napi::Result<String> {
  evaluate_redirect_uri_canonical(&input, &base_url, &allowed_origins, &trusted_domains, &query_pairs)
    .map_err(napi_error)
}

fn evaluate_redirect_uri_canonical(
  input: &str,
  base_url: &str,
  allowed_origins: &[String],
  trusted_domains: &[String],
  query_pairs: &[UrlQueryPair],
) -> UrlPolicyResult<String> {
  let mut url = parse_http_url(input, base_url)?;
  if !has_allowed_origin(&url, allowed_origins) && !matches_trusted_domain(&url, trusted_domains) {
    return Err(UrlPolicyError::Denied);
  }
  if !query_pairs.is_empty() {
    let existing = url
      .query_pairs()
      .filter(|(name, _)| !query_pairs.iter().any(|pair| pair.name.as_str() == name.as_ref()))
      .map(|(name, value)| (name.into_owned(), value.into_owned()))
      .collect::<Vec<_>>();
    url
      .query_pairs_mut()
      .clear()
      .extend_pairs(existing)
      .extend_pairs(query_pairs.iter().map(|pair| (&pair.name, &pair.value)));
  }
  Ok(url.into())
}

pub(crate) fn evaluate_redirect_uri_internal(
  input: &str,
  base_url: &str,
  allowed_origins: &[String],
  trusted_domains: &[String],
) -> Option<String> {
  evaluate_redirect_uri_canonical(input, base_url, allowed_origins, trusted_domains, &[]).ok()
}

#[napi]
pub fn evaluate_local_redirect(input: String, base_url: String, allowed_bases: Vec<String>) -> napi::Result<String> {
  evaluate_local_redirect_canonical(&input, &base_url, &allowed_bases).map_err(napi_error)
}

fn evaluate_local_redirect_canonical(input: &str, base_url: &str, allowed_bases: &[String]) -> UrlPolicyResult<String> {
  let url = parse_http_url(input, base_url)?;
  let allowed = allowed_bases.iter().any(|allowed_base| {
    Url::parse(allowed_base).ok().is_some_and(|base| {
      matches!(base.scheme(), "http" | "https")
        && url.origin() == base.origin()
        && path_is_within(url.path(), base.path().trim_end_matches('/'))
    })
  });
  if !allowed {
    return Err(UrlPolicyError::Denied);
  }
  Ok(url.into())
}

#[cfg(test)]
#[path = "tests/url_policy/tests.rs"]
mod tests;
