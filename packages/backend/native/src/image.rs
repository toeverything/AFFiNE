use std::io::Cursor;

use anyhow::{Context, Result as AnyResult, bail};
use image::{
  AnimationDecoder, DynamicImage, ImageDecoder, ImageFormat, ImageReader,
  codecs::{gif::GifDecoder, png::PngDecoder, webp::WebPDecoder},
  imageops::FilterType,
  metadata::Orientation,
};
use libwebp_sys::{
  WEBP_MUX_ABI_VERSION, WebPData, WebPDataClear, WebPDataInit, WebPEncodeRGBA, WebPFree, WebPMuxAssemble,
  WebPMuxCreateInternal, WebPMuxDelete, WebPMuxError, WebPMuxSetChunk,
};
use little_exif::{exif_tag::ExifTag, filetype::FileExtension, metadata::Metadata};
use napi::{
  Env, Error, Result, Status, Task,
  bindgen_prelude::{AsyncTask, Buffer},
};
use napi_derive::napi;

const WEBP_QUALITY: f32 = 80.0;
const MAX_IMAGE_DIMENSION: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 40_000_000;

pub struct AsyncProcessImageTask {
  input: Vec<u8>,
  max_edge: u32,
  keep_exif: bool,
}

#[napi]
impl Task for AsyncProcessImageTask {
  type Output = Vec<u8>;
  type JsValue = Buffer;

  fn compute(&mut self) -> Result<Self::Output> {
    process_image_inner(&self.input, self.max_edge, self.keep_exif)
  }

  fn resolve(&mut self, _: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output.into())
  }
}

#[napi]
pub fn process_image(input: Buffer, max_edge: u32, keep_exif: bool) -> AsyncTask<AsyncProcessImageTask> {
  AsyncTask::new(AsyncProcessImageTask {
    input: input.to_vec(),
    max_edge,
    keep_exif,
  })
}

fn process_image_inner(input: &[u8], max_edge: u32, keep_exif: bool) -> Result<Vec<u8>> {
  if max_edge == 0 {
    return Err(Error::new(Status::InvalidArg, "max_edge must be greater than 0"));
  }

  let invalid_input = |error: anyhow::Error| Error::new(Status::InvalidArg, error.to_string());
  let format = image::guess_format(input)
    .context("unsupported image format")
    .map_err(invalid_input)?;
  let (width, height) = read_dimensions(input, format).map_err(invalid_input)?;
  validate_dimensions(width, height).map_err(invalid_input)?;
  let mut image = decode_image(input, format).map_err(invalid_input)?;
  let orientation = read_orientation(input, format).map_err(invalid_input)?;
  image.apply_orientation(orientation);

  if image.width().max(image.height()) > max_edge {
    image = image.resize(max_edge, max_edge, FilterType::Lanczos3);
  }

  let mut output =
    encode_webp_lossy(&image.into_rgba8()).map_err(|error| Error::new(Status::GenericFailure, error.to_string()))?;

  if keep_exif {
    preserve_exif(input, format, &mut output).map_err(|error| Error::new(Status::GenericFailure, error.to_string()))?;
  }

  Ok(output)
}

fn read_dimensions(input: &[u8], format: ImageFormat) -> AnyResult<(u32, u32)> {
  ImageReader::with_format(Cursor::new(input), format)
    .into_dimensions()
    .context("failed to decode image")
}

fn validate_dimensions(width: u32, height: u32) -> AnyResult<()> {
  if width == 0 || height == 0 {
    bail!("failed to decode image");
  }

  if width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION {
    bail!("image dimensions exceed limit");
  }

  if u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
    bail!("image pixel count exceeds limit");
  }

  Ok(())
}

fn decode_image(input: &[u8], format: ImageFormat) -> AnyResult<DynamicImage> {
  Ok(match format {
    ImageFormat::Gif => {
      let decoder = GifDecoder::new(Cursor::new(input)).context("failed to decode image")?;
      let frame = decoder
        .into_frames()
        .next()
        .transpose()
        .context("failed to decode image")?
        .context("image does not contain any frames")?;
      DynamicImage::ImageRgba8(frame.into_buffer())
    }
    ImageFormat::Png => {
      let decoder = PngDecoder::new(Cursor::new(input)).context("failed to decode image")?;
      if decoder.is_apng().context("failed to decode image")? {
        let frame = decoder
          .apng()
          .context("failed to decode image")?
          .into_frames()
          .next()
          .transpose()
          .context("failed to decode image")?
          .context("image does not contain any frames")?;
        DynamicImage::ImageRgba8(frame.into_buffer())
      } else {
        DynamicImage::from_decoder(decoder).context("failed to decode image")?
      }
    }
    ImageFormat::WebP => {
      let decoder = WebPDecoder::new(Cursor::new(input)).context("failed to decode image")?;
      if decoder.has_animation() {
        let frame = decoder
          .into_frames()
          .next()
          .transpose()
          .context("failed to decode image")?
          .context("image does not contain any frames")?;
        DynamicImage::ImageRgba8(frame.into_buffer())
      } else {
        DynamicImage::from_decoder(decoder).context("failed to decode image")?
      }
    }
    _ => {
      let reader = ImageReader::with_format(Cursor::new(input), format);
      let decoder = reader.into_decoder().context("failed to decode image")?;
      DynamicImage::from_decoder(decoder).context("failed to decode image")?
    }
  })
}

fn read_orientation(input: &[u8], format: ImageFormat) -> AnyResult<Orientation> {
  Ok(match format {
    ImageFormat::Gif => GifDecoder::new(Cursor::new(input))
      .context("failed to decode image")?
      .orientation()
      .context("failed to decode image")?,
    ImageFormat::Png => PngDecoder::new(Cursor::new(input))
      .context("failed to decode image")?
      .orientation()
      .context("failed to decode image")?,
    ImageFormat::WebP => WebPDecoder::new(Cursor::new(input))
      .context("failed to decode image")?
      .orientation()
      .context("failed to decode image")?,
    _ => ImageReader::with_format(Cursor::new(input), format)
      .into_decoder()
      .context("failed to decode image")?
      .orientation()
      .context("failed to decode image")?,
  })
}

fn encode_webp_lossy(image: &image::RgbaImage) -> AnyResult<Vec<u8>> {
  let width = i32::try_from(image.width()).context("image width is too large")?;
  let height = i32::try_from(image.height()).context("image height is too large")?;
  let stride = width.checked_mul(4).context("image width is too large")?;

  let mut output = std::ptr::null_mut();
  let encoded_len = unsafe { WebPEncodeRGBA(image.as_ptr(), width, height, stride, WEBP_QUALITY, &mut output) };

  if output.is_null() || encoded_len == 0 {
    bail!("failed to encode webp");
  }

  let encoded = unsafe { std::slice::from_raw_parts(output, encoded_len) }.to_vec();
  unsafe {
    WebPFree(output.cast());
  }

  Ok(encoded)
}

fn preserve_exif(input: &[u8], format: ImageFormat, output: &mut Vec<u8>) -> AnyResult<()> {
  let Some(file_type) = map_exif_file_type(format) else {
    return Ok(());
  };

  let input = input.to_vec();
  let Ok(mut metadata) = Metadata::new_from_vec(&input, file_type) else {
    return Ok(());
  };

  metadata.remove_tag(ExifTag::Orientation(vec![1]));

  if !metadata.get_ifds().iter().any(|ifd| !ifd.get_tags().is_empty()) {
    return Ok(());
  }

  let encoded_metadata = metadata.encode().context("failed to preserve exif metadata")?;
  let source = WebPData {
    bytes: output.as_ptr(),
    size: output.len(),
  };
  let exif = WebPData {
    bytes: encoded_metadata.as_ptr(),
    size: encoded_metadata.len(),
  };
  let mut assembled = WebPData::default();
  let mux = unsafe { WebPMuxCreateInternal(&source, 1, WEBP_MUX_ABI_VERSION as _) };
  if mux.is_null() {
    bail!("failed to preserve exif metadata");
  }

  let encoded = (|| -> AnyResult<Vec<u8>> {
    if unsafe { WebPMuxSetChunk(mux, c"EXIF".as_ptr(), &exif, 1) } != WebPMuxError::WEBP_MUX_OK {
      bail!("failed to preserve exif metadata");
    }

    WebPDataInit(&mut assembled);

    if unsafe { WebPMuxAssemble(mux, &mut assembled) } != WebPMuxError::WEBP_MUX_OK {
      bail!("failed to preserve exif metadata");
    }

    Ok(unsafe { std::slice::from_raw_parts(assembled.bytes, assembled.size) }.to_vec())
  })();

  unsafe {
    WebPDataClear(&mut assembled);
    WebPMuxDelete(mux);
  }

  *output = encoded?;

  Ok(())
}

fn map_exif_file_type(format: ImageFormat) -> Option<FileExtension> {
  match format {
    ImageFormat::Jpeg => Some(FileExtension::JPEG),
    ImageFormat::Png => Some(FileExtension::PNG { as_zTXt_chunk: true }),
    ImageFormat::Tiff => Some(FileExtension::TIFF),
    ImageFormat::WebP => Some(FileExtension::WEBP),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use image::{
    ExtendedColorType, GenericImageView, ImageEncoder,
    codecs::{png::PngEncoder, webp::WebPEncoder},
  };

  use super::*;

  fn encode_png(width: u32, height: u32, alpha: u8) -> Vec<u8> {
    let image = image::RgbaImage::from_pixel(width, height, image::Rgba([255, 0, 0, alpha]));
    let mut encoded = Vec::new();
    PngEncoder::new(&mut encoded)
      .write_image(image.as_raw(), width, height, ExtendedColorType::Rgba8)
      .unwrap();
    encoded
  }

  fn encode_bmp_header(width: u32, height: u32) -> Vec<u8> {
    let mut encoded = Vec::with_capacity(54);
    encoded.extend_from_slice(b"BM");
    encoded.extend_from_slice(&(54u32).to_le_bytes());
    encoded.extend_from_slice(&0u16.to_le_bytes());
    encoded.extend_from_slice(&0u16.to_le_bytes());
    encoded.extend_from_slice(&(54u32).to_le_bytes());
    encoded.extend_from_slice(&(40u32).to_le_bytes());
    encoded.extend_from_slice(&(width as i32).to_le_bytes());
    encoded.extend_from_slice(&(height as i32).to_le_bytes());
    encoded.extend_from_slice(&1u16.to_le_bytes());
    encoded.extend_from_slice(&24u16.to_le_bytes());
    encoded.extend_from_slice(&0u32.to_le_bytes());
    encoded.extend_from_slice(&0u32.to_le_bytes());
    encoded.extend_from_slice(&0u32.to_le_bytes());
    encoded.extend_from_slice(&0u32.to_le_bytes());
    encoded.extend_from_slice(&0u32.to_le_bytes());
    encoded.extend_from_slice(&0u32.to_le_bytes());
    encoded
  }

  #[test]
  fn process_image_decodes_and_resizes_images() {
    // Two lossless 2x2 frames (red, blue), generated locally with img2webp.
    let animated_webp = vec![
      0x52, 0x49, 0x46, 0x46, 0x84, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x41, 0x4e, 0x49, 0x4d, 0x06, 0x00, 0x00, 0x00,
      0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x41, 0x4e, 0x4d, 0x46, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x64, 0x00, 0x00, 0x02, 0x56, 0x50, 0x38, 0x4c, 0x0f, 0x00, 0x00, 0x00,
      0x2f, 0x01, 0x40, 0x00, 0x00, 0x07, 0x10, 0xfd, 0x8f, 0xfe, 0x07, 0x22, 0xa2, 0xff, 0x01, 0x00, 0x41, 0x4e, 0x4d,
      0x46, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x64, 0x00,
      0x00, 0x00, 0x56, 0x50, 0x38, 0x4c, 0x0f, 0x00, 0x00, 0x00, 0x2f, 0x01, 0x40, 0x00, 0x00, 0x07, 0x10, 0xd1, 0xff,
      0xfe, 0x07, 0x22, 0xa2, 0xff, 0x01, 0x00,
    ];
    assert!(WebPDecoder::new(Cursor::new(&animated_webp)).unwrap().has_animation());
    let mut inputs = vec![("animated WebP", animated_webp, (2, 2), 255)];
    for (width, height) in [(8, 6), (32, 8)] {
      for alpha in [255, 96] {
        let png = encode_png(width, height, alpha);
        let rgba = image::load_from_memory(&png).unwrap().into_rgba8();
        let mut lossless = Vec::new();
        WebPEncoder::new_lossless(&mut lossless)
          .write_image(rgba.as_raw(), width, height, ExtendedColorType::Rgba8)
          .unwrap();
        let lossy = process_image_inner(&png, 1536, true).unwrap();
        for (name, input) in [("PNG", png), ("lossless WebP", lossless), ("lossy WebP", lossy)] {
          inputs.push((name, input, (width, height), alpha));
        }
      }
    }

    for (name, input, (width, height), alpha) in inputs {
      let resized = if width > 4 {
        (4, 4 * height / width)
      } else {
        (width, height)
      };
      for (max_edge, dimensions) in [(512, (width, height)), (4, resized)] {
        for keep_exif in [false, true] {
          let mut output = input.clone();
          for _ in 0..2 {
            output = process_image_inner(&output, max_edge, keep_exif)
              .unwrap_or_else(|error| panic!("{name}, max_edge={max_edge}, keep_exif={keep_exif}: {error}"));
            assert_eq!(image::guess_format(&output).unwrap(), ImageFormat::WebP);
            let decoded = image::load_from_memory(&output).unwrap();
            assert_eq!(decoded.dimensions(), dimensions);
            let pixel = decoded.to_rgba8()[(0, 0)];
            assert_eq!(pixel[3], alpha);
            assert!(pixel[0] > pixel[2], "expected the red first frame");
          }
        }
      }
    }
  }

  #[test]
  fn process_image_preserves_exif_without_orientation() {
    let png = encode_png(8, 8, 255);
    let webp = process_image_inner(&encode_png(8, 6, 96), 512, false).unwrap();
    for (mut output, format, dimensions) in [
      (png, FileExtension::PNG { as_zTXt_chunk: true }, (8, 8)),
      (webp, FileExtension::WEBP, (6, 8)),
    ] {
      let mut metadata = Metadata::new();
      metadata.set_tag(ExifTag::ImageDescription("copilot".to_string()));
      metadata.set_tag(ExifTag::Orientation(vec![6]));
      metadata.write_to_vec(&mut output, format).unwrap();

      for _ in 0..2 {
        output = process_image_inner(&output, 512, true).unwrap();
        assert_eq!(image::load_from_memory(&output).unwrap().dimensions(), dimensions);
        let decoded_metadata = Metadata::new_from_vec(&output, FileExtension::WEBP).unwrap();

        assert!(
          decoded_metadata
            .get_tag(&ExifTag::ImageDescription(String::new()))
            .next()
            .is_some()
        );
        assert!(
          decoded_metadata
            .get_tag(&ExifTag::Orientation(vec![1]))
            .next()
            .is_none()
        );
      }
    }
  }

  #[test]
  fn process_image_rejects_invalid_input() {
    let png = encode_png(8, 6, 255);
    for (input, max_edge, message) in [
      (b"not-an-image".to_vec(), 512, "unsupported image format"),
      (png.clone(), 0, "max_edge must be greater than 0"),
      (png[..40].to_vec(), 512, "failed to decode image"),
      (
        encode_bmp_header(MAX_IMAGE_DIMENSION + 1, 1),
        512,
        "image dimensions exceed limit",
      ),
      (encode_bmp_header(10_000, 4_001), 512, "image pixel count exceeds limit"),
    ] {
      let error = process_image_inner(&input, max_edge, false).unwrap_err();
      assert_eq!(error.status, Status::InvalidArg);
      assert_eq!(error.reason, message);
    }
    assert!(validate_dimensions(MAX_IMAGE_DIMENSION, 1).is_ok());
    assert!(validate_dimensions(8_000, 5_000).is_ok());
  }
}
