use rustls::{ClientConfig, RootCertStore};

pub(in crate::runtime) fn webpki_tls_config() -> Result<ClientConfig, rustls::Error> {
  let roots = RootCertStore {
    roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
  };
  Ok(
    ClientConfig::builder_with_provider(rustls::crypto::aws_lc_rs::default_provider().into())
      .with_safe_default_protocol_versions()?
      .with_root_certificates(roots)
      .with_no_client_auth(),
  )
}
