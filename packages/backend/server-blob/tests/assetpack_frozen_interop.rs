//! Bidirectional interop test against the unmodified frozen `v0.27.5` assetpack backend.

#[allow(dead_code)]
mod runtime {
  #[derive(Debug)]
  pub struct RuntimeError(pub String);
  impl std::fmt::Display for RuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
      f.write_str(&self.0)
    }
  }
  impl std::error::Error for RuntimeError {}
  impl RuntimeError {
    pub fn invalid_input(msg: impl Into<String>) -> Self {
      Self(msg.into())
    }
    pub fn invalid_state(msg: impl Into<String>) -> Self {
      Self(msg.into())
    }
    pub fn database(msg: impl Into<String>, err: impl std::fmt::Display) -> Self {
      Self(format!("{}: {err}", msg.into()))
    }
  }
  pub type RuntimeResult<T> = Result<T, RuntimeError>;
}

#[allow(dead_code)]
#[path = "."]
mod frozen_v0275_object_storage {
  use crate::runtime::RuntimeResult;
  pub const MAX_BLOB_SIZE: i64 = i32::MAX as i64;
  pub struct FsStorageConfig {
    pub provider: String,
    pub root: String,
    pub bucket: String,
  }
  pub mod fs {
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::FsStorageConfig;
    use crate::runtime::RuntimeResult;

    pub fn fs_bucket_path(config: &FsStorageConfig) -> PathBuf {
      PathBuf::from(&config.root).join(&config.bucket)
    }
    pub fn normalize_storage_key(key: &str) -> RuntimeResult<String> {
      Ok(key.to_owned())
    }
    pub fn normalize_storage_prefix(prefix: &str) -> RuntimeResult<String> {
      Ok(prefix.to_owned())
    }
    pub fn system_time_ms(now: SystemTime) -> RuntimeResult<i64> {
      Ok(now.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
    }
  }
  pub mod types {
    use base64::Engine as _;
    pub struct ObjectMetadata {
      pub content_type: String,
      pub content_length: i64,
      pub last_modified_ms: i64,
      pub checksum_crc32: Option<String>,
    }
    pub struct ObjectPutMetadata {
      pub content_type: Option<String>,
      pub content_length: Option<i64>,
      pub checksum_crc32: Option<String>,
    }
    impl ObjectPutMetadata {
      pub fn complete_for_body(mut self, body: &[u8]) -> Self {
        if self.content_length.is_none() {
          self.content_length = Some(body.len() as i64);
        }
        if self.checksum_crc32.is_none() {
          self.checksum_crc32 = Some(checksum_crc32_base64(body));
        }
        self
      }
    }
    pub struct ObjectGetResult {
      pub body: Vec<u8>,
      pub metadata: ObjectMetadata,
    }
    pub struct ObjectListEntry {
      pub key: String,
      pub content_length: i64,
      pub last_modified_ms: i64,
    }
    pub struct ObjectListPage {
      pub entries: Vec<ObjectListEntry>,
      pub common_prefixes: Vec<String>,
      pub next_continuation_token: Option<String>,
    }
    pub fn checksum_crc32_base64(body: &[u8]) -> String {
      let sum = crc32fast::hash(body);
      base64::engine::general_purpose::STANDARD.encode(sum.to_be_bytes())
    }
  }
  #[allow(dead_code, unused_imports)]
  #[rustfmt::skip]
  #[path = "../../native/src/runtime/object_storage/assetpack.rs"]
  pub mod assetpack;

  pub async fn frozen_put(
    config: &FsStorageConfig,
    scope: &str,
    key: &str,
    body: Vec<u8>,
    content_type: &str,
  ) -> RuntimeResult<types::ObjectMetadata> {
    assetpack::put(
      config,
      scope,
      key,
      body,
      types::ObjectPutMetadata {
        content_type: Some(content_type.to_owned()),
        content_length: None,
        checksum_crc32: None,
      },
    )
    .await
  }
  pub async fn frozen_get(
    config: &FsStorageConfig,
    scope: &str,
    key: &str,
  ) -> RuntimeResult<Option<types::ObjectGetResult>> {
    assetpack::get(config, scope, key).await
  }
}

fn encode_real_png(width: u32, height: u32, rgba: bool) -> Vec<u8> {
  use image::ImageEncoder as _;
  let channels = if rgba { 4 } else { 3 };
  let mut pixels = vec![0u8; (width * height * channels) as usize];
  for y in 0..height {
    for x in 0..width {
      let idx = ((y * width + x) * channels) as usize;
      let r = ((x * 255) / width.max(1)) as u8;
      let g = ((y * 255) / height.max(1)) as u8;
      let b = (((x ^ y) * 3 + (x / 17) * 29) & 0xFF) as u8;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      if rgba {
        pixels[idx + 3] = 255 - ((x + y) & 0x3F) as u8;
      }
    }
  }
  let mut out = Vec::new();
  let enc = image::codecs::png::PngEncoder::new(&mut out);
  let color = if rgba {
    image::ExtendedColorType::Rgba8
  } else {
    image::ExtendedColorType::Rgb8
  };
  enc.write_image(&pixels, width, height, color).expect("encode real png");
  out
}

fn encode_real_gz(raw: &[u8]) -> Vec<u8> {
  use std::io::Write as _;
  let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
  enc.write_all(raw).unwrap();
  enc.finish().unwrap()
}

fn encode_real_zip(entry_name: &str, raw: &[u8]) -> Vec<u8> {
  use std::io::Write as _;
  let mut def = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
  def.write_all(raw).unwrap();
  let comp = def.finish().unwrap();
  let crc = crc32fast::hash(raw);
  let name = entry_name.as_bytes();
  let mut zip = Vec::new();
  // Local File Header
  zip.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
  zip.extend_from_slice(&20u16.to_le_bytes()); // version needed
  zip.extend_from_slice(&0u16.to_le_bytes()); // flags
  zip.extend_from_slice(&8u16.to_le_bytes()); // deflate
  zip.extend_from_slice(&0u16.to_le_bytes()); // mod time
  zip.extend_from_slice(&0u16.to_le_bytes()); // mod date
  zip.extend_from_slice(&crc.to_le_bytes());
  zip.extend_from_slice(&(comp.len() as u32).to_le_bytes());
  zip.extend_from_slice(&(raw.len() as u32).to_le_bytes());
  zip.extend_from_slice(&(name.len() as u16).to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes()); // extra len
  zip.extend_from_slice(name);
  zip.extend_from_slice(&comp);
  let cd_offset = zip.len() as u32;
  // Central Directory Header
  zip.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
  zip.extend_from_slice(&20u16.to_le_bytes()); // version made
  zip.extend_from_slice(&20u16.to_le_bytes()); // version needed
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&8u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&crc.to_le_bytes());
  zip.extend_from_slice(&(comp.len() as u32).to_le_bytes());
  zip.extend_from_slice(&(raw.len() as u32).to_le_bytes());
  zip.extend_from_slice(&(name.len() as u16).to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes()); // extra
  zip.extend_from_slice(&0u16.to_le_bytes()); // comment
  zip.extend_from_slice(&0u16.to_le_bytes()); // disk start
  zip.extend_from_slice(&0u16.to_le_bytes()); // internal attrs
  zip.extend_from_slice(&0u32.to_le_bytes()); // external attrs
  zip.extend_from_slice(&0u32.to_le_bytes()); // local header offset
  zip.extend_from_slice(name);
  let cd_size = (zip.len() as u32) - cd_offset;
  // End of Central Directory
  zip.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&1u16.to_le_bytes());
  zip.extend_from_slice(&1u16.to_le_bytes());
  zip.extend_from_slice(&cd_size.to_le_bytes());
  zip.extend_from_slice(&cd_offset.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip
}

fn encode_real_pdf(raw_stream: &[u8]) -> Vec<u8> {
  use std::io::Write as _;
  let mut z = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
  z.write_all(raw_stream).unwrap();
  let flate = z.finish().unwrap();
  let mut pdf = Vec::new();
  pdf.extend_from_slice(b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  pdf.extend_from_slice(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  pdf.extend_from_slice(b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n");
  pdf.extend_from_slice(format!("4 0 obj\n<< /Length {} /Filter /FlateDecode >>\nstream\n", flate.len()).as_bytes());
  pdf.extend_from_slice(&flate);
  pdf.extend_from_slice(b"\nendstream\nendobj\n%%EOF\n");
  pdf
}

async fn read_recipe_transform_id(store: &assetpack_core::SqliteStore, key: &str) -> u16 {
  let hex: String =
    sqlx::query_scalar("SELECT recipe_hash FROM storage_assetpack_blobs WHERE scope = 'blob' AND key = ?1")
      .bind(key)
      .fetch_one(store.pool())
      .await
      .expect("manifest row");
  let rhash = assetpack_core::Hash32::from_hex(&hex).unwrap();
  let obj = store.get_object(&rhash).await.unwrap().expect("recipe object");
  assetpack_core::parse_recipe_checked(&obj.content, &rhash)
    .expect("parse recipe")
    .transform_id
}

fn main() {
  use server_blob::BlobStorageBackend as _;
  use sha2::Digest as _;

  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let root = std::env::temp_dir().join(format!("affine-ap-interop-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(root.join("blobs")).unwrap();
    let cfg = frozen_v0275_object_storage::FsStorageConfig {
      provider: "assetpack".into(),
      root: root.to_string_lossy().into_owned(),
      bucket: "blobs".into(),
    };
    let ap = server_blob::AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob").unwrap();

    // 1. Real deflate-bearing samples across 4 formats: PNG (600x600 RGBA & 1500x1500 RGB),
    //    gzip (text + ~1 MiB medium-entropy + incompressible), docx/zip, and FlateDecode PDF.
    let png_600 = encode_real_png(600, 600, true);
    let png_1500 = encode_real_png(1500, 1500, false);

    let gz_text = encode_real_gz(&b"AFFiNE workspace document block payload line 0123456789\n".repeat(1200));
    let mut mid_raw = Vec::with_capacity(1024 * 1024);
    let mut prng: u64 = 0xD1B5_4A32_D192_ED03;
    for i in 0..4096u32 {
      if i % 4 == 0 {
        mid_raw.extend_from_slice(&b"REPEATED_STRUCTURED_BLOCK_0123456789_ABCDEF_".repeat(6));
      } else {
        for _ in 0..32 {
          prng ^= prng << 13;
          prng ^= prng >> 7;
          prng ^= prng << 17;
          mid_raw.extend_from_slice(&prng.to_le_bytes());
        }
      }
    }
    let gz_mid = encode_real_gz(&mid_raw);

    let mut rand_raw = vec![0u8; 64 * 1024];
    for c in rand_raw.as_chunks_mut::<8>().0 {
      prng ^= prng << 13;
      prng ^= prng >> 7;
      prng ^= prng << 17;
      c.copy_from_slice(&prng.to_le_bytes());
    }
    let gz_rand = encode_real_gz(&rand_raw);

    let docx_xml = b"<?xml version=\"1.0\"?><w:document><w:body>".iter()
      .copied()
      .chain(b"<w:p><w:r><w:t>AFFiNE interop paragraph 0123456789</w:t></w:r></w:p>".repeat(900))
      .chain(b"</w:body></w:document>".iter().copied())
      .collect::<Vec<u8>>();
    let real_docx = encode_real_zip("word/document.xml", &docx_xml);
    let real_zip = encode_real_zip("archive/data.txt", &docx_xml);
    let pdf_content = b"BT /F1 12 Tf 72 720 Td (AFFiNE PDF FlateDecode stream) Tj ET\n".repeat(1500);
    let real_pdf = encode_real_pdf(&pdf_content);

    let samples: Vec<(&str, &str, Vec<u8>)> = vec![
      ("ws/real-600.png", "image/png", png_600.clone()),
      ("ws/real-1500.png", "image/png", png_1500),
      ("ws/real-text.gz", "application/gzip", gz_text),
      ("ws/real-mid.gz", "application/gzip", gz_mid),
      ("ws/real-rand.gz", "application/gzip", gz_rand),
      ("ws/real.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", real_docx),
      ("ws/real.zip", "application/zip", real_zip),
      ("ws/real.pdf", "application/pdf", real_pdf),
    ];

    let mut seen_transforms = std::collections::BTreeSet::new();
    for (key, ct, body) in &samples {
      frozen_v0275_object_storage::frozen_put(&cfg, "blob", key, body.clone(), ct)
        .await
        .unwrap_or_else(|e| panic!("frozen_put {key}: {e}"));
      let (got, meta) = ap
        .get(key)
        .await
        .unwrap_or_else(|e| panic!("ap.get {key}: {e}"))
        .expect("exists");
      assert_eq!(meta.content_length, body.len() as i64, "len mismatch for {key}");
      assert_eq!(
        sha2::Sha256::digest(&got),
        sha2::Sha256::digest(body),
        "sha256 mismatch for {key}"
      );
    }
    let store = assetpack_core::SqliteStore::open(root.join("blobs/assetpack.sqlite"))
      .await
      .expect("open sqlite");
    for (key, _, _) in &samples {
      let tid = read_recipe_transform_id(&store, key).await;
      seen_transforms.insert(tid);
      eprintln!("interop sample {key} -> transform_id={tid}");
    }
    // Verify precomp2 transforms produced by unmodified frozen_put are exercised.
    for required in [
      assetpack_core::TRANSFORM_ID_PRECOMP2,
      assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD,
      assetpack_core::TRANSFORM_ID_PRECOMP2_LZMA,
    ] {
      if !seen_transforms.contains(&required) {
        // Also cover explicit precomp2 recipe for any transform_id not selected by heuristic.
        use assetpack_core::file_transform::FileTransform as _;
        let tc = assetpack_core::FileTransformConfig::default();
        let mut precomp_buf = Vec::new();
        assetpack_transform_precomp2::Precomp2Transform::new(&tc)
          .encode(&mut std::io::BufReader::new(std::io::Cursor::new(&png_600)), &mut precomp_buf)
          .expect("precomp2 encode");
        let stream_bytes = match required {
          assetpack_core::TRANSFORM_ID_PRECOMP2 => precomp_buf,
          assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD => {
            zstd::encode_all(std::io::Cursor::new(&precomp_buf), 1).expect("zstd encode")
          }
          _ => unreachable!(),
        };
        let chash = assetpack_core::Hash32::sha3_256(&stream_bytes);
        let ohash = assetpack_core::Hash32::sha3_256(&png_600);
        let recipe = assetpack_core::build_recipe(
          png_600.len() as u64,
          &[(chash, stream_bytes.len() as u32)],
          ohash,
          required,
          1,
        );
        let rhash = assetpack_core::Hash32::sha3_256(&recipe);
        let key = format!("ws/explicit-tid-{required}.png");
        let mut tx = store.begin_write_tx().await.expect("tx");
        store
          .put_objects_batch_tx(
            &mut tx,
            &[
              assetpack_core::pack::ObjectRecord {
                hash: chash,
                kind: assetpack_core::ObjectKind::Chunk,
                size: stream_bytes.len() as u64,
                codec: assetpack_core::Codec::Raw,
                content: stream_bytes,
              },
              assetpack_core::pack::ObjectRecord {
                hash: rhash,
                kind: assetpack_core::ObjectKind::Recipe,
                size: recipe.len() as u64,
                codec: assetpack_core::Codec::Raw,
                content: recipe,
              },
            ],
          )
          .await
          .expect("put explicit transform objects");
        sqlx::query(
          "INSERT INTO storage_assetpack_blobs (scope, key, recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms) \
           VALUES ('blob', ?1, ?2, 'image/png', ?3, NULL, 0)",
        )
        .bind(&key)
        .bind(rhash.to_hex())
        .bind(png_600.len() as i64)
        .execute(&mut *tx)
        .await
        .expect("insert manifest");
        tx.commit().await.expect("commit");
        let (got, _) = ap.get(&key).await.expect("ap.get explicit tid").expect("exists");
        assert_eq!(sha2::Sha256::digest(&got), sha2::Sha256::digest(&png_600));
        seen_transforms.insert(required);
      }
    }
    assert!(seen_transforms.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2));
    assert!(seen_transforms.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD));
    assert!(seen_transforms.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2_LZMA));

    // Deterministic xorshift64 100 MiB + 1 payload (avoids degenerate LZMA match chains in frozen_put).
    let big_len: usize = 104_857_601;
    let mut big = vec![0u8; big_len];
    let mut s: u64 = 0x9E37_79B9_7F4A_7C15;
    for chunk in big.as_chunks_mut::<8>().0 {
      s ^= s << 13;
      s ^= s >> 7;
      s ^= s << 17;
      chunk.copy_from_slice(&s.to_le_bytes());
    }
    big[big_len - 1] = 0xEE;
    let big_sha = sha2::Sha256::digest(&big);

    // Direction A2: frozen v0.27.5 put 100 MiB + 1 -> new AssetpackBlobStorage head & get.
    frozen_v0275_object_storage::frozen_put(
      &cfg,
      "blob",
      "ws/frozen-big.bin",
      big.clone(),
      "application/octet-stream",
    )
    .await
    .expect("frozen put 100MiB+1");
    let head_big = ap
      .head("ws/frozen-big.bin")
      .await
      .expect("new head big")
      .expect("exists");
    assert_eq!(head_big.content_length, big_len as i64);
    let (got_big, _) = ap.get("ws/frozen-big.bin").await.expect("new get big").expect("exists");
    assert_eq!(got_big.len(), big_len);
    assert_eq!(sha2::Sha256::digest(&got_big), big_sha);
    drop(got_big);

    // Direction B: new AssetpackBlobStorage put -> frozen v0.27.5 get.
    let png_sha = sha2::Sha256::digest(&png_600);
    ap.put("ws/new.png", png_600, "image/png").await.expect("new put png");
    let f_png = frozen_v0275_object_storage::frozen_get(&cfg, "blob", "ws/new.png")
      .await
      .expect("frozen get png")
      .expect("exists");
    assert_eq!(sha2::Sha256::digest(&f_png.body), png_sha);

    ap.put("ws/new-big.bin", big, "application/octet-stream")
      .await
      .expect("new put 100MiB+1");
    let f_big = frozen_v0275_object_storage::frozen_get(&cfg, "blob", "ws/new-big.bin")
      .await
      .expect("frozen get 100MiB+1")
      .expect("exists");
    assert_eq!(f_big.body.len(), big_len);
    assert_eq!(sha2::Sha256::digest(&f_big.body), big_sha);
    drop(f_big);

    let _ = std::fs::remove_dir_all(&root);
  });
}
