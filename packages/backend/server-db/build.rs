use std::{
  env,
  fmt::Write as _,
  fs,
  path::PathBuf,
};

use sha2::{Digest, Sha256};

fn main() {
  let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
  let backend_dir = manifest_dir
    .parent()
    .expect("packages/backend/server-db must live directly under packages/backend");

  let migrations_dir = backend_dir.join("server/migrations");
  let runtime_sql_path = backend_dir.join("native/src/runtime/sql/runtime_migrations.sql");

  println!("cargo:rerun-if-changed={}", migrations_dir.display());
  println!("cargo:rerun-if-changed={}", runtime_sql_path.display());

  let mut entries = Vec::new();
  for entry in fs::read_dir(&migrations_dir).expect("read packages/backend/server/migrations") {
    let entry = entry.expect("read migration dir entry");
    let sql_path = entry.path().join("migration.sql");
    if !entry.file_type().expect("file_type").is_dir() || !sql_path.is_file() {
      continue;
    }
    println!("cargo:rerun-if-changed={}", sql_path.display());
    let name = entry.file_name().to_string_lossy().into_owned();
    let bytes = fs::read(&sql_path).expect("read migration.sql");
    let checksum = hex_sha256(&bytes);
    entries.push((name, checksum));
  }
  entries.sort_by(|a, b| a.0.cmp(&b.0));
  assert!(
    !entries.is_empty(),
    "expected Prisma migrations under {}",
    migrations_dir.display()
  );

  let mut generated = String::new();
  writeln!(
    generated,
    "pub(crate) struct BundledPrismaMigration {{\n  pub name: &'static str,\n  pub checksum: &'static str,\n  pub sql: &'static str,\n}}\n"
  )
  .unwrap();
  writeln!(
    generated,
    "pub(crate) const BUNDLED_RUNTIME_MIGRATIONS_SQL: &str = include_str!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/../native/src/runtime/sql/runtime_migrations.sql\"));\n"
  )
  .unwrap();
  writeln!(
    generated,
    "pub(crate) const BUNDLED_PRISMA_MIGRATIONS: &[BundledPrismaMigration] = &["
  )
  .unwrap();
  for (name, checksum) in entries {
    let rel = format!("/../server/migrations/{name}/migration.sql");
    writeln!(
      generated,
      "  BundledPrismaMigration {{\n    name: {:?},\n    checksum: {:?},\n    sql: include_str!(concat!(env!(\"CARGO_MANIFEST_DIR\"), {:?})),\n  }},",
      name, checksum, rel
    )
    .unwrap();
  }
  writeln!(generated, "];").unwrap();

  let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
  fs::write(out_dir.join("bundled_migrations.rs"), generated).expect("write bundled_migrations.rs");
}

fn hex_sha256(bytes: &[u8]) -> String {
  let digest = Sha256::digest(bytes);
  let mut out = String::with_capacity(digest.len() * 2);
  for b in digest {
    let _ = write!(out, "{b:02x}");
  }
  out
}
