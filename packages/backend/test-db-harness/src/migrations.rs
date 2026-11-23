//! Prisma-layout migration sets (`<dir>/<name>/migration.sql`) and their
//! content digest.

use std::path::Path;

use sha2::{Digest, Sha256};

use crate::{Error, Result};

/// Bumped whenever the way a template is built changes, so templates built by
/// an older harness are never reused.
const TEMPLATE_BUILD_VERSION: &str = "affine-test-env/template-v1";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Migration {
  pub name: String,
  pub sql: String,
  /// Lowercase hex SHA-256 of `migration.sql`, the checksum Prisma records.
  pub checksum: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationSet {
  pub migrations: Vec<Migration>,
  /// Lowercase hex SHA-256 over the ordered names and checksums.
  pub digest: String,
}

impl MigrationSet {
  /// Reads every `<dir>/<name>/migration.sql`, ordered by `name`.
  pub fn load(dir: &Path) -> Result<Self> {
    let entries =
      std::fs::read_dir(dir).map_err(|e| Error::new(format!("cannot read migrations dir {}: {e}", dir.display())))?;
    let mut migrations = Vec::new();
    for entry in entries {
      let entry = entry?;
      let sql_path = entry.path().join("migration.sql");
      if !entry.file_type()?.is_dir() || !sql_path.is_file() {
        continue;
      }
      let sql = std::fs::read_to_string(&sql_path)?;
      migrations.push(Migration {
        name: entry.file_name().to_string_lossy().into_owned(),
        checksum: hex_sha256(sql.as_bytes()),
        sql,
      });
    }
    if migrations.is_empty() {
      return Err(Error::new(format!(
        "no <name>/migration.sql found under {}",
        dir.display()
      )));
    }
    Ok(Self::from_migrations(migrations))
  }

  /// Orders `migrations` by name and computes the set digest.
  pub fn from_migrations(mut migrations: Vec<Migration>) -> Self {
    migrations.sort_by(|a, b| a.name.cmp(&b.name));
    let mut hasher = Sha256::new();
    hasher.update(TEMPLATE_BUILD_VERSION.as_bytes());
    for m in &migrations {
      hasher.update(b"\n");
      hasher.update(m.name.as_bytes());
      hasher.update(b"\0");
      hasher.update(m.checksum.as_bytes());
    }
    let digest = hex(&hasher.finalize());
    Self { migrations, digest }
  }

  /// Name of the template database built from this set.
  pub fn template_name(&self) -> String {
    format!("affine_tpl_{}", &self.digest[..16])
  }
}

/// A migration from in-memory SQL, for callers that generate their schema.
pub fn migration(name: &str, sql: &str) -> Migration {
  Migration {
    name: name.to_owned(),
    sql: sql.to_owned(),
    checksum: hex_sha256(sql.as_bytes()),
  }
}

fn hex_sha256(bytes: &[u8]) -> String {
  hex(&Sha256::digest(bytes))
}

fn hex(bytes: &[u8]) -> String {
  use std::fmt::Write;
  bytes.iter().fold(String::with_capacity(bytes.len() * 2), |mut s, b| {
    let _ = write!(s, "{b:02x}");
    s
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn digest_ignores_input_order_and_tracks_every_name_and_byte() {
    let base = MigrationSet::from_migrations(vec![migration("002_b", "B"), migration("001_a", "A")]);
    assert_eq!(base.migrations[0].name, "001_a", "sorted by name");
    assert_eq!(
      base.migrations[0].checksum,
      "559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd"
    );

    let cases = [
      (
        "same set, other order",
        vec![migration("001_a", "A"), migration("002_b", "B")],
        true,
      ),
      (
        "sql byte changed",
        vec![migration("001_a", "A"), migration("002_b", "B ")],
        false,
      ),
      ("renamed", vec![migration("001_a", "A"), migration("003_b", "B")], false),
      (
        "added",
        vec![
          migration("001_a", "A"),
          migration("002_b", "B"),
          migration("003_c", "C"),
        ],
        false,
      ),
    ];
    for (label, set, same) in cases {
      let other = MigrationSet::from_migrations(set);
      assert_eq!(other.digest == base.digest, same, "{label}");
    }
    let name = base.template_name();
    assert!(name.starts_with("affine_tpl_") && name.len() == "affine_tpl_".len() + 16);
  }

  #[test]
  fn load_reads_prisma_layout_and_skips_other_entries() {
    let dir = std::env::temp_dir().join(format!("tdh-migrations-{}", crate::process_run_id()));
    let _ = std::fs::remove_dir_all(&dir);
    for (name, sql) in [("20240102_b", "SELECT 2;"), ("20240101_a", "SELECT 1;")] {
      std::fs::create_dir_all(dir.join(name)).unwrap();
      std::fs::write(dir.join(name).join("migration.sql"), sql).unwrap();
    }
    std::fs::create_dir_all(dir.join("no_sql_here")).unwrap();
    std::fs::write(dir.join("migration_lock.toml"), "provider = \"postgresql\"").unwrap();

    let set = MigrationSet::load(&dir).unwrap();
    let names: Vec<_> = set.migrations.iter().map(|m| m.name.as_str()).collect();
    assert_eq!(names, ["20240101_a", "20240102_b"]);
    assert_eq!(
      set,
      MigrationSet::from_migrations(vec![
        migration("20240101_a", "SELECT 1;"),
        migration("20240102_b", "SELECT 2;")
      ])
    );
    std::fs::remove_dir_all(&dir).unwrap();

    assert!(MigrationSet::load(&dir).is_err(), "missing dir is an error");
  }
}
