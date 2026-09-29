use std::time::Duration;

use affine_core::auth::{LoginMethodFacts, login_methods};
use hickory_resolver::{TokioResolver, net::NetError};
use serde::Serialize;
use sqlx::{PgPool, Row};

use super::{RuntimeError, RuntimeResult, login::canonical_email, oauth};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LoginPreflight {
  registered: bool,
  methods: LoginMethods,
}

#[derive(Serialize)]
struct LoginMethods {
  password: Availability,
  #[serde(rename = "magicLink")]
  magic_link: Availability,
  oauth: OAuthAvailability,
  passkey: PasskeyAvailability,
}

#[derive(Serialize)]
struct Availability {
  available: bool,
}

#[derive(Serialize)]
struct OAuthAvailability {
  available: bool,
  providers: Vec<String>,
}

#[derive(Serialize)]
struct PasskeyAvailability {
  available: bool,
  discoverable: bool,
}

#[derive(Serialize)]
pub(super) struct BoundMethods {
  password: Bound,
  oauth: OAuthBound,
  passkey: PasskeyBound,
}

#[derive(Serialize)]
struct Bound {
  bound: bool,
}

#[derive(Serialize)]
struct OAuthBound {
  bound: bool,
  providers: Vec<String>,
}

#[derive(Serialize)]
struct PasskeyBound {
  bound: bool,
  count: u32,
}

pub(super) async fn login_preflight(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  email: &str,
) -> RuntimeResult<LoginPreflight> {
  let email = canonical_email(email)?;
  let rows = sqlx::query(
    "SELECT registered,disabled,password IS NOT NULL AS has_password FROM users WHERE lower(email)=lower($1) ORDER BY \
     id",
  )
  .bind(&email)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load login methods", error))?;
  let providers = oauth::available_providers(config).await?;
  let email_domain_allowed = if rows.is_empty() && config.auth.require_email_domain_verification {
    verify_email_domain_records(&email).await?
  } else {
    true
  };
  let user = rows.first();
  let decision = login_methods(LoginMethodFacts {
    identity_count: rows.len(),
    registered: user.is_some_and(|row| row.get("registered")),
    disabled: user.is_some_and(|row| row.get("disabled")),
    has_password: user.is_some_and(|row| row.get("has_password")),
    allow_signup: config.auth.allow_signup,
    allow_signup_for_oauth: config.auth.allow_signup_for_oauth,
    email_domain_allowed,
    oauth_available: !providers.is_empty(),
  });
  Ok(LoginPreflight {
    registered: decision.registered,
    methods: LoginMethods {
      password: Availability {
        available: decision.password,
      },
      magic_link: Availability {
        available: decision.magic_link,
      },
      oauth: OAuthAvailability {
        available: decision.oauth,
        providers,
      },
      passkey: PasskeyAvailability {
        available: false,
        discoverable: false,
      },
    },
  })
}

pub(super) async fn bound_methods(pool: &PgPool, user_id: &str) -> RuntimeResult<BoundMethods> {
  let password = sqlx::query_scalar::<_, bool>("SELECT password IS NOT NULL FROM users WHERE id=$1 AND disabled=false")
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("load bound password", error))?
    .unwrap_or(false);
  let providers = sqlx::query_scalar::<_, String>(
    "SELECT DISTINCT provider FROM user_connected_accounts WHERE user_id=$1 ORDER BY provider",
  )
  .bind(user_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load bound OAuth accounts", error))?;
  Ok(BoundMethods {
    password: Bound { bound: password },
    oauth: OAuthBound {
      bound: !providers.is_empty(),
      providers,
    },
    passkey: PasskeyBound { bound: false, count: 0 },
  })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DnsRecordStatus {
  Present,
  Missing,
  Unavailable,
}

struct EmailDomainRecords {
  mx: DnsRecordStatus,
  spf: DnsRecordStatus,
  dmarc: DnsRecordStatus,
}

impl EmailDomainRecords {
  fn allowed(&self) -> RuntimeResult<bool> {
    if matches!(self.mx, DnsRecordStatus::Unavailable)
      || matches!(self.spf, DnsRecordStatus::Unavailable)
      || matches!(self.dmarc, DnsRecordStatus::Unavailable)
    {
      return Err(RuntimeError::InvalidState(
        "email_domain_verification_unavailable".to_string(),
      ));
    }
    Ok(
      matches!(self.mx, DnsRecordStatus::Present)
        && matches!(self.spf, DnsRecordStatus::Present)
        && matches!(self.dmarc, DnsRecordStatus::Present),
    )
  }
}

fn failed_lookup(error: &NetError) -> DnsRecordStatus {
  if error.is_nx_domain() || error.is_no_records_found() {
    DnsRecordStatus::Missing
  } else {
    DnsRecordStatus::Unavailable
  }
}

pub(super) async fn verify_email_domain_records(email: &str) -> RuntimeResult<bool> {
  let Some((name, domain)) = email.split_once('@') else {
    return Ok(false);
  };
  if name.contains('+') || domain.contains('@') {
    return Ok(false);
  }
  let resolver = TokioResolver::builder_tokio()
    .and_then(|builder| builder.build())
    .map_err(|_| RuntimeError::invalid_state("email_domain_verification_unavailable"))?;
  let timeout = Duration::from_secs(2);
  let (mx, spf, dmarc) = tokio::join!(
    tokio::time::timeout(timeout, resolver.mx_lookup(domain)),
    tokio::time::timeout(timeout, resolver.txt_lookup(domain)),
    tokio::time::timeout(timeout, resolver.txt_lookup(format!("_dmarc.{domain}"))),
  );
  EmailDomainRecords {
    mx: match mx {
      Ok(Ok(records)) if !records.answers().is_empty() => DnsRecordStatus::Present,
      Ok(Ok(_)) => DnsRecordStatus::Missing,
      Ok(Err(error)) => failed_lookup(&error),
      Err(_) => DnsRecordStatus::Unavailable,
    },
    spf: match spf {
      Ok(Ok(records))
        if records
          .answers()
          .iter()
          .any(|record| record.to_string().contains("v=spf1")) =>
      {
        DnsRecordStatus::Present
      }
      Ok(Ok(_)) => DnsRecordStatus::Missing,
      Ok(Err(error)) => failed_lookup(&error),
      Err(_) => DnsRecordStatus::Unavailable,
    },
    dmarc: match dmarc {
      Ok(Ok(records))
        if records
          .answers()
          .iter()
          .any(|record| record.to_string().contains("v=DMARC1")) =>
      {
        DnsRecordStatus::Present
      }
      Ok(Ok(_)) => DnsRecordStatus::Missing,
      Ok(Err(error)) => failed_lookup(&error),
      Err(_) => DnsRecordStatus::Unavailable,
    },
  }
  .allowed()
}
