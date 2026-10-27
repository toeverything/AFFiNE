use super::*;

fn origins() -> Vec<String> {
  vec!["https://app.affine.local".to_string()]
}

#[test]
fn callback_url_is_canonical_and_appends_escaped_ordered_pairs() {
  assert_eq!(
    build_safe_callback_url_canonical(
      "/magic-link?existing=1&token=old",
      "https://app.affine.local",
      &origins(),
      &[
        UrlQueryPair {
          name: "redirect_uri".to_string(),
          value: "/path?a=1".to_string(),
        },
        UrlQueryPair {
          name: "token".to_string(),
          value: "a b".to_string(),
        },
      ],
    )
    .unwrap(),
    "https://app.affine.local/magic-link?existing=1&redirect_uri=%2Fpath%3Fa%3D1&token=a+b"
  );
}

#[test]
fn callback_url_closes_special_and_cross_origin_inputs() {
  for input in [
    "/\\\\evil.example/path",
    "\\\\evil.example/path",
    "https://user@app.affine.local/path",
    "javascript:alert(1)",
    "https://evil.example/path",
  ] {
    assert!(
      build_safe_callback_url_canonical(input, "https://app.affine.local", &origins(), &[]).is_err(),
      "{input}"
    );
  }

  assert_eq!(
    build_safe_callback_url_canonical("/%5Cevil", "https://app.affine.local", &origins(), &[]).unwrap(),
    "https://app.affine.local/%5Cevil"
  );
}

#[test]
fn redirect_uri_checks_origins_and_trusted_domain_boundaries() {
  let trusted = vec!["github.com".to_string()];
  for input in [
    "/redirect-proxy",
    "https://app.affine.local:443/path",
    "https://github.com:8443/path",
    "https://sub.github.com/path",
    "https://github.com./path",
  ] {
    assert!(
      evaluate_redirect_uri_canonical(input, "https://app.affine.local", &origins(), &trusted, &[]).is_ok(),
      "{input}"
    );
  }
  for input in [
    "https://app.affine.local:444/path",
    "https://evilgithub.com/path",
    "https://github.com.evil.example/path",
    "ftp://github.com/path",
  ] {
    assert!(
      evaluate_redirect_uri_canonical(input, "https://app.affine.local", &origins(), &trusted, &[]).is_err(),
      "{input}"
    );
  }
  assert_eq!(
    evaluate_redirect_uri_canonical(
      "https://github.com/path?existing=1&error=untrusted",
      "https://app.affine.local",
      &origins(),
      &trusted,
      &[UrlQueryPair {
        name: "error".to_string(),
        value: "a b".to_string(),
      }],
    )
    .unwrap(),
    "https://github.com/path?existing=1&error=a+b"
  );
}

#[test]
fn local_redirect_enforces_origin_and_base_path_boundary() {
  let allowed = vec!["https://app.affine.local/base".to_string()];
  for input in [
    "https://app.affine.local/base",
    "https://app.affine.local/base/child?x=1",
  ] {
    assert!(
      evaluate_local_redirect_canonical(input, "https://app.affine.local/base", &allowed).is_ok(),
      "{input}"
    );
  }
  for input in [
    "https://app.affine.local/base-sibling",
    "https://app.affine.local/other",
    "https://other.example/base",
    "/\\\\other.example/base",
  ] {
    assert!(
      evaluate_local_redirect_canonical(input, "https://app.affine.local/base", &allowed).is_err(),
      "{input}"
    );
  }
}
