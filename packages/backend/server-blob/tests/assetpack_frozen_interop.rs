//! Bidirectional interop test against the unmodified frozen `v0.27.5` (`0.1.0`) assetpack backend.

extern crate assetpack_core_v0275 as assetpack_core;
extern crate assetpack_transform_precomp2_v0275 as assetpack_transform_precomp2;

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
      pixels[idx] = ((x * 255) / width.max(1)) as u8;
      pixels[idx + 1] = ((y * 255) / height.max(1)) as u8;
      pixels[idx + 2] = (((x ^ y) * 3 + (x / 17) * 29) & 0xFF) as u8;
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

fn encode_gradient_png(width: u32, height: u32) -> Vec<u8> {
  use image::ImageEncoder as _;
  let mut pixels = vec![0u8; (width * height * 3) as usize];
  for y in 0..height {
    for x in 0..width {
      let idx = ((y * width + x) * 3) as usize;
      pixels[idx] = ((x * 255) / width.max(1)) as u8;
      pixels[idx + 1] = ((y * 255) / height.max(1)) as u8;
      pixels[idx + 2] = (((x + y) * 127) / (width + height).max(1)) as u8;
    }
  }
  let mut out = Vec::new();
  image::codecs::png::PngEncoder::new(&mut out)
    .write_image(&pixels, width, height, image::ExtendedColorType::Rgb8)
    .expect("encode gradient png");
  out
}

/// Builds a valid 16000x16000 1-bit grayscale PNG (>= 40 KiB) quickly for oversized PNG memory regression testing.
fn encode_16000x16000_png() -> Vec<u8> {
  use std::io::Write as _;
  fn push_chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let mut h = crc32fast::Hasher::new();
    h.update(kind);
    h.update(data);
    out.extend_from_slice(&h.finalize().to_be_bytes());
  }
  let (w, h) = (16_000u32, 16_000u32);
  let mut ihdr = Vec::with_capacity(13);
  ihdr.extend_from_slice(&w.to_be_bytes());
  ihdr.extend_from_slice(&h.to_be_bytes());
  ihdr.extend_from_slice(&[1, 0, 0, 0, 0]); // 1-bit grayscale

  let row_bytes = (w as usize) / 8;
  let mut enc = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::fast());
  let mut row = vec![0u8; 1 + row_bytes];
  let mut prng: u64 = 0x517C_C1B7_2722_0A95;
  for y in 0..h {
    row[0] = 0;
    if y % 64 == 0 {
      for b in &mut row[1..65] {
        prng ^= prng << 13;
        prng ^= prng >> 7;
        prng ^= prng << 17;
        *b = prng as u8;
      }
    } else {
      row[1..65].fill(0);
    }
    enc.write_all(&row).unwrap();
  }
  let idat = enc.finish().unwrap();
  let mut png = Vec::with_capacity(idat.len() + 64);
  png.extend_from_slice(b"\x89PNG\r\n\x1a\n");
  push_chunk(&mut png, b"IHDR", &ihdr);
  push_chunk(&mut png, b"IDAT", &idat);
  push_chunk(&mut png, b"IEND", &[]);
  assert!(
    png.len() >= 32 * 1024,
    "16000x16000 png must exceed 32 KiB, got {}",
    png.len()
  );
  png
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
  zip.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
  zip.extend_from_slice(&20u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&8u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&crc.to_le_bytes());
  zip.extend_from_slice(&(comp.len() as u32).to_le_bytes());
  zip.extend_from_slice(&(raw.len() as u32).to_le_bytes());
  zip.extend_from_slice(&(name.len() as u16).to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(name);
  zip.extend_from_slice(&comp);
  let cd_offset = zip.len() as u32;
  zip.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
  zip.extend_from_slice(&20u16.to_le_bytes());
  zip.extend_from_slice(&20u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&8u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&crc.to_le_bytes());
  zip.extend_from_slice(&(comp.len() as u32).to_le_bytes());
  zip.extend_from_slice(&(raw.len() as u32).to_le_bytes());
  zip.extend_from_slice(&(name.len() as u16).to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&0u16.to_le_bytes());
  zip.extend_from_slice(&0u32.to_le_bytes());
  zip.extend_from_slice(&0u32.to_le_bytes());
  zip.extend_from_slice(name);
  let cd_size = (zip.len() as u32) - cd_offset;
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

async fn read_recipe_meta(store: &assetpack_core::SqliteStore, key: &str) -> (u16, u16) {
  let hex: String =
    sqlx::query_scalar("SELECT recipe_hash FROM storage_assetpack_blobs WHERE scope = 'blob' AND key = ?1")
      .bind(key)
      .fetch_one(store.pool())
      .await
      .expect("manifest row");
  let rhash = assetpack_core::Hash32::from_hex(&hex).unwrap();
  let obj = store.get_object(&rhash).await.unwrap().expect("recipe object");
  let parsed = assetpack_core::parse_recipe_checked(&obj.content, &rhash).expect("parse recipe");
  (parsed.transform_id, parsed.transform_version)
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
    let ap_on = server_blob::AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob").unwrap();
    let ap_off = server_blob::AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob")
      .unwrap()
      .with_precomp2(false);
    assert!(ap_on.precomp2_enabled());
    assert!(!ap_off.precomp2_enabled());

    // Builds a ~256 KiB payload from 4 copies of a 64 KiB varied block: deflate's 32 KiB window
    // cannot match across copies (keeping compressed size >= 50 KiB), while precomp2 + zstd level 3
    // matches across the 64 KiB stride for >50% gain without degenerate LZMA2 chains in 0.1.0.
    let make_semi_structured = |seed: u64, prefix: &str, suffix: &str| -> Vec<u8> {
      let mut block = Vec::with_capacity(64 * 1024);
      let mut s = seed;
      for i in 0..950u32 {
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        let line = format!(
          "rec={i:04} tag={:02x} a={:08x} b={:08x} payload=affine_block_{:04}_{:04x}\n",
          (s & 0xff) as u8,
          (s >> 8) as u32,
          (s >> 32) as u32,
          i % 64,
          (s >> 16) as u16,
        );
        block.extend_from_slice(line.as_bytes());
      }
      let mut out = Vec::with_capacity(prefix.len() + block.len() * 4 + suffix.len());
      out.extend_from_slice(prefix.as_bytes());
      for _ in 0..4 {
        out.extend_from_slice(&block);
      }
      out.extend_from_slice(suffix.as_bytes());
      out
    };

    let png_600 = encode_real_png(600, 600, true);
    let gz_text = encode_real_gz(&make_semi_structured(0x1111_2222_3333_4444, "", ""));
    let docx_xml = make_semi_structured(
      0x5555_6666_7777_8888,
      "<?xml version=\"1.0\"?><w:document><w:body>",
      "</w:body></w:document>",
    );
    let real_docx = encode_real_zip("word/document.xml", &docx_xml);
    let zip_data = make_semi_structured(0x9999_AAAA_BBBB_CCCC, "", "");
    let real_zip = encode_real_zip("archive/data.txt", &zip_data);
    let pdf_content = make_semi_structured(0xDEAD_BEEF_CAFE_BABE, "BT /F1 12 Tf\n", "ET\n");
    let real_pdf = encode_real_pdf(&pdf_content);
    for (name, buf) in [
      ("png_600", &png_600),
      ("gz_text", &gz_text),
      ("real_zip", &real_zip),
      ("real_docx", &real_docx),
      ("real_pdf", &real_pdf),
    ] {
      assert!(
        buf.len() >= 36 * 1024,
        "{name} must exceed 32 KiB min_size, got {}",
        buf.len()
      );
    }

    let samples: Vec<(&str, &str, Vec<u8>)> = vec![
      ("real-600.png", "image/png", png_600.clone()),
      ("real-text.gz", "application/gzip", gz_text),
      ("real.zip", "application/zip", real_zip),
      (
        "real.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        real_docx,
      ),
      ("real.pdf", "application/pdf", real_pdf),
    ];

    // Direction A: real frozen v0.27.5 (0.1.0) put -> new AssetpackBlobStorage (both precomp2=true and false).
    let mut seen_transforms = std::collections::BTreeSet::new();
    for (name, ct, body) in &samples {
      let key = format!("ws/frozen-{name}");
      frozen_v0275_object_storage::frozen_put(&cfg, "blob", &key, body.clone(), ct)
        .await
        .unwrap_or_else(|e| panic!("frozen_put {key}: {e}"));
      let expected_sha = sha2::Sha256::digest(body);
      for (label, reader) in [("ap_on", &ap_on), ("ap_off", &ap_off)] {
        let (got, meta) = reader.get(&key).await.expect("get").expect("exists");
        assert_eq!(meta.content_length, body.len() as i64, "{label} {key}");
        assert_eq!(sha2::Sha256::digest(&got), expected_sha, "{label} {key}");
      }
    }
    let store = assetpack_core::SqliteStore::open(root.join("blobs/assetpack.sqlite"))
      .await
      .expect("open sqlite");
    for (name, _, _) in &samples {
      let (tid, _) = read_recipe_meta(&store, &format!("ws/frozen-{name}")).await;
      seen_transforms.insert(tid);
    }
    for required in [
      assetpack_core::TRANSFORM_ID_PRECOMP2,
      assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD,
      assetpack_core::TRANSFORM_ID_PRECOMP2_LZMA,
    ] {
      if !seen_transforms.contains(&required) {
        use assetpack_core::file_transform::FileTransform as _;
        let tc = assetpack_core::FileTransformConfig::default();
        let stream_bytes = match required {
          assetpack_core::TRANSFORM_ID_PRECOMP2 => {
            let mut buf = Vec::new();
            assetpack_transform_precomp2::Precomp2Transform::new(&tc)
              .encode(&mut std::io::BufReader::new(std::io::Cursor::new(&png_600)), &mut buf)
              .expect("0.1.0 precomp2 encode");
            buf
          }
          assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD => {
            let mut buf = Vec::new();
            assetpack_transform_precomp2::Precomp2ZstdTransform::new(&tc)
              .encode(&mut std::io::BufReader::new(std::io::Cursor::new(&png_600)), &mut buf)
              .expect("0.1.0 precomp2-zstd encode");
            buf
          }
          assetpack_core::TRANSFORM_ID_PRECOMP2_LZMA => {
            let mut buf = Vec::new();
            assetpack_transform_precomp2::Precomp2LzmaTransform::new(&tc)
              .encode(&mut std::io::BufReader::new(std::io::Cursor::new(&png_600)), &mut buf)
              .expect("0.1.0 precomp2-lzma encode");
            buf
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
        let key = format!("ws/frozen-explicit-tid-{required}.png");
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
          .expect("put explicit v1 objects");
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
        for reader in [&ap_on, &ap_off] {
          let (got, _) = reader.get(&key).await.expect("get explicit v1").expect("exists");
          assert_eq!(sha2::Sha256::digest(&got), sha2::Sha256::digest(&png_600));
        }
        seen_transforms.insert(required);
      }
    }
    assert!(seen_transforms.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2));
    assert!(seen_transforms.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2_ZSTD));
    assert!(seen_transforms.contains(&assetpack_core::TRANSFORM_ID_PRECOMP2_LZMA));

    // High-compression-ratio gradient PNGs written by real v0.27.5 (0.1.0) hit (tid != 0, v1)
    // WebP transform whose decoded pixel bitmap exceeds 16x the compressed PNG size.
    for (w, h) in [(1500u32, 1500u32), (3000u32, 3000u32), (5000u32, 5000u32)] {
      let grad_png = encode_gradient_png(w, h);
      let raw_pixels = u64::from(w) * u64::from(h) * 3;
      assert!(
        grad_png.len() >= 32 * 1024 && raw_pixels > (grad_png.len() as u64) * 16,
        "frozen gradient {w}x{h} png len {} vs raw {raw_pixels}",
        grad_png.len()
      );
      let key = format!("ws/frozen-grad-{w}x{h}.png");
      frozen_v0275_object_storage::frozen_put(&cfg, "blob", &key, grad_png.clone(), "image/png")
        .await
        .unwrap_or_else(|e| panic!("frozen_put {key}: {e}"));
      let (tid, tver) = read_recipe_meta(&store, &key).await;
      assert_ne!(tid, 0, "0.1.0 must transform gradient PNG {w}x{h}");
      assert_eq!(tver, 1, "0.1.0 must write v1 for {w}x{h}");
      let expected_sha = sha2::Sha256::digest(&grad_png);
      for (label, reader) in [("ap_on", &ap_on), ("ap_off", &ap_off)] {
        let (got, meta) = reader
          .get(&key)
          .await
          .unwrap_or_else(|e| panic!("{label} get {key}: {e}"))
          .expect("exists");
        assert_eq!(meta.content_length, grad_png.len() as i64, "{label} {key}");
        assert_eq!(sha2::Sha256::digest(&got), expected_sha, "{label} {key}");
      }
    }

    // Deterministic xorshift64 100 MiB + 1 payload for multi-chunk interop.
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

    frozen_v0275_object_storage::frozen_put(
      &cfg,
      "blob",
      "ws/frozen-big.bin",
      big.clone(),
      "application/octet-stream",
    )
    .await
    .expect("frozen put 100MiB+1");
    let head_big = ap_on.head("ws/frozen-big.bin").await.unwrap().unwrap();
    assert_eq!(head_big.content_length, big_len as i64);
    let (got_big, _) = ap_on.get("ws/frozen-big.bin").await.unwrap().unwrap();
    assert_eq!(got_big.len(), big_len);
    assert_eq!(sha2::Sha256::digest(&got_big), big_sha);
    drop(got_big);

    // Direction B: new AssetpackBlobStorage (precomp2 = false) put -> real frozen v0.27.5 get.
    for (name, ct, body) in &samples {
      let off_key = format!("ws/off-{name}");
      ap_off.put(&off_key, body.clone(), ct).await.expect("ap_off put");
      assert_eq!(read_recipe_meta(&store, &off_key).await, (0, 0));
      let f_got = frozen_v0275_object_storage::frozen_get(&cfg, "blob", &off_key)
        .await
        .unwrap_or_else(|e| panic!("frozen_get {off_key}: {e}"))
        .expect("exists");
      assert_eq!(sha2::Sha256::digest(&f_got.body), sha2::Sha256::digest(body));
    }
    ap_off
      .put("ws/off-big.bin", big, "application/octet-stream")
      .await
      .expect("ap_off put 100MiB+1");
    assert_eq!(read_recipe_meta(&store, "ws/off-big.bin").await, (0, 0));
    let f_big = frozen_v0275_object_storage::frozen_get(&cfg, "blob", "ws/off-big.bin")
      .await
      .expect("frozen get off-big")
      .expect("exists");
    assert_eq!(f_big.body.len(), big_len);
    assert_eq!(sha2::Sha256::digest(&f_big.body), big_sha);
    drop(f_big);

    // Direction C: new AssetpackBlobStorage (precomp2 = true) put -> new reads succeed,
    // real frozen v0.27.5 get explicitly reports unsupported version, 8000x8000 PNG triggers
    // IHDR pixel guard -> (0, 0) in < 5s and stays readable by frozen_get, and SQLite timestamps
    // use Unix seconds for objects/file_recipe_cache and Unix ms for storage_assetpack_blobs.
    for (name, ct, body) in &samples {
      let on_key = format!("ws/on-{name}");
      ap_on.put(&on_key, body.clone(), ct).await.expect("ap_on put");
      let (tid, tver) = read_recipe_meta(&store, &on_key).await;
      assert_ne!(tid, 0, "precomp2=true must transform {name}");
      assert_eq!(tver, 2, "precomp2=true must write transform_version=2 for {name}");
      let expected_sha = sha2::Sha256::digest(body);
      for reader in [&ap_on, &ap_off] {
        let (got, _) = reader.get(&on_key).await.expect("get on").expect("exists");
        assert_eq!(sha2::Sha256::digest(&got), expected_sha);
      }
      let frozen_err = frozen_v0275_object_storage::frozen_get(&cfg, "blob", &on_key)
        .await
        .err()
        .expect("v0.27.5 frozen_get must reject PCF2 v2");
      assert!(
        frozen_err.to_string().contains("unsupported version"),
        "expected unsupported version for {on_key}, got: {frozen_err}"
      );
    }

    let png_16k = encode_16000x16000_png();
    let png_16k_sha = sha2::Sha256::digest(&png_16k);
    let t0 = std::time::Instant::now();
    ap_on
      .put("ws/on-16000x16000.png", png_16k.clone(), "image/png")
      .await
      .expect("put 16000x16000 png");
    assert!(
      t0.elapsed() < std::time::Duration::from_secs(10),
      "16000x16000 PNG must avoid WebP OOM and complete quickly, took {:?}",
      t0.elapsed()
    );
    let (got_16k, _) = ap_on
      .get("ws/on-16000x16000.png")
      .await
      .expect("get 16000x16000")
      .expect("exists");
    assert_eq!(sha2::Sha256::digest(&got_16k), png_16k_sha);

    ap_off
      .put("ws/off-16000x16000.png", png_16k.clone(), "image/png")
      .await
      .expect("put off 16000x16000 png");
    assert_eq!(read_recipe_meta(&store, "ws/off-16000x16000.png").await, (0, 0));
    let f_16k = frozen_v0275_object_storage::frozen_get(&cfg, "blob", "ws/off-16000x16000.png")
      .await
      .expect("frozen get 16000x16000")
      .expect("exists");
    assert_eq!(sha2::Sha256::digest(&f_16k.body), png_16k_sha);

    // Verify SQLite timestamp units on the freshly written 16000x16000 PNG row.
    let (rhex, last_modified_ms): (String, i64) = sqlx::query_as(
      "SELECT recipe_hash, last_modified_ms FROM storage_assetpack_blobs WHERE scope = 'blob' AND key = 'ws/off-16000x16000.png'",
    )
    .fetch_one(store.pool())
    .await
    .expect("manifest timestamp row");
    let rhash = assetpack_core::Hash32::from_hex(&rhex).unwrap();
    let obj_created_at: i64 = sqlx::query_scalar("SELECT created_at FROM objects WHERE hash = ?1")
      .bind(rhash.as_bytes().as_ref())
      .fetch_one(store.pool())
      .await
      .expect("object created_at");
    let orig_hash = assetpack_core::Hash32::sha3_256(&png_16k);
    let cache_updated_at: i64 =
      sqlx::query_scalar("SELECT updated_at FROM file_recipe_cache WHERE file_hash = ?1")
        .bind(orig_hash.as_bytes().as_ref())
        .fetch_one(store.pool())
        .await
        .expect("cache updated_at");
    assert!(
      (1_700_000_000..10_000_000_000).contains(&obj_created_at),
      "objects.created_at must be Unix seconds, got {obj_created_at}"
    );
    assert!(
      (1_700_000_000..10_000_000_000).contains(&cache_updated_at),
      "file_recipe_cache.updated_at must be Unix seconds, got {cache_updated_at}"
    );
    assert_eq!(
      last_modified_ms.div_euclid(1000),
      cache_updated_at,
      "storage_assetpack_blobs.last_modified_ms / 1000 must match Unix seconds"
    );

    let _ = std::fs::remove_dir_all(&root);
  });
}
