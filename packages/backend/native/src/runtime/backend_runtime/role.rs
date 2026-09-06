#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum ServerRole {
  Frontend,
  Api,
  Worker,
  AllInOne,
}

impl ServerRole {
  pub(super) fn from_environment() -> Result<(Self, bool), String> {
    let script_mode = matches!(std::env::var("SERVER_FLAVOR").as_deref(), Ok("script"));
    if let Ok(value) = std::env::var("AFFINE_SERVER_ROLE") {
      return Self::parse(&value).map(|role| (role, script_mode));
    }

    match std::env::var("SERVER_FLAVOR") {
      Err(std::env::VarError::NotPresent) => Ok((Self::AllInOne, false)),
      Ok(value) => Self::from_flavor(&value),
      Err(std::env::VarError::NotUnicode(_)) => Err("backend runtime role source is not valid unicode".to_string()),
    }
  }

  fn from_flavor(value: &str) -> Result<(Self, bool), String> {
    match value {
      "allinone" => Ok((Self::AllInOne, false)),
      "front" => Ok((Self::Frontend, false)),
      "graphql" => Ok((Self::Api, false)),
      "worker" => Ok((Self::Worker, false)),
      "sync" | "renderer" => Ok((Self::Frontend, false)),
      // The CLI uses the BackendRuntime only for database/object-storage work.
      // It is not one of the four server roles and must not initialize search.
      "script" => Ok((Self::Frontend, true)),
      value => Err(format!("unsupported backend runtime role source value: {value}")),
    }
  }

  fn parse(value: &str) -> Result<Self, String> {
    match value {
      "frontend" => Ok(Self::Frontend),
      "api" => Ok(Self::Api),
      "worker" => Ok(Self::Worker),
      "allinone" => Ok(Self::AllInOne),
      _ => Err(format!(
        "unsupported backend runtime role: {value}; expected frontend, api, worker, or allinone"
      )),
    }
  }

  pub(super) fn owns_background(self) -> bool {
    matches!(self, Self::Worker | Self::AllInOne)
  }

  pub(super) fn allows_embedded_search(self) -> bool {
    matches!(self, Self::AllInOne)
  }

  pub(super) fn as_str(self) -> &'static str {
    match self {
      Self::Frontend => "frontend",
      Self::Api => "api",
      Self::Worker => "worker",
      Self::AllInOne => "allinone",
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn role_parser_is_closed() {
    assert_eq!(ServerRole::parse("frontend"), Ok(ServerRole::Frontend));
    assert_eq!(ServerRole::parse("api"), Ok(ServerRole::Api));
    assert_eq!(ServerRole::parse("worker"), Ok(ServerRole::Worker));
    assert_eq!(ServerRole::parse("allinone"), Ok(ServerRole::AllInOne));
    assert!(ServerRole::parse("graphql").is_err());
    assert!(ServerRole::from_flavor("doc").is_err());
    assert_eq!(ServerRole::from_flavor("script"), Ok((ServerRole::Frontend, true)));
    assert_eq!(ServerRole::from_flavor("worker"), Ok((ServerRole::Worker, false)));
  }

  #[test]
  fn only_all_in_one_allows_embedded_search() {
    assert!(!ServerRole::Frontend.allows_embedded_search());
    assert!(!ServerRole::Api.allows_embedded_search());
    assert!(!ServerRole::Worker.allows_embedded_search());
    assert!(ServerRole::AllInOne.allows_embedded_search());
  }

  #[test]
  fn only_worker_compositions_own_background() {
    assert!(!ServerRole::Frontend.owns_background());
    assert!(!ServerRole::Api.owns_background());
    assert!(ServerRole::Worker.owns_background());
    assert!(ServerRole::AllInOne.owns_background());
  }
}
