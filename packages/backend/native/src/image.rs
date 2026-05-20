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
      .map_err(|error| Error::new(Status::InvalidArg, error.to_string()))
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

fn process_image_inner(input: &[u8], max_edge: u32, keep_exif: bool) -> AnyResult<Vec<u8>> {
  if max_edge == 0 {
    bail!("max_edge must be greater than 0");
  }

  let format = image::guess_format(input).context("unsupported image format")?;
  let (width, height) = read_dimensions(input, format)?;
  validate_dimensions(width, height)?;
  let mut image = decode_image(input, format)?;
  let orientation = read_orientation(input, format)?;
  image.apply_orientation(orientation);

  if image.width().max(image.height()) > max_edge {
    image = image.resize(max_edge, max_edge, FilterType::Lanczos3);
  }

  let mut output = encode_webp_lossy(&image.into_rgba8())?;

  if keep_exif {
    preserve_exif(input, format, &mut output)?;
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
      let frame = decoder
        .into_frames()
        .next()
        .transpose()
        .context("failed to decode image")?
        .context("image does not contain any frames")?;
      DynamicImage::ImageRgba8(frame.into_buffer())
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
  use image::{ExtendedColorType, GenericImageView, ImageEncoder, codecs::png::PngEncoder};

  use super::*;

  fn encode_png(width: u32, height: u32) -> Vec<u8> {
    let image = image::RgbaImage::from_pixel(width, height, image::Rgba([255, 0, 0, 255]));
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
  fn process_image_keeps_small_dimensions() {
    let png = encode_png(8, 6);
    let output = process_image_inner(&png, 512, false).unwrap();

    let format = image::guess_format(&output).unwrap();
    assert_eq!(format, ImageFormat::WebP);

    let decoded = image::load_from_memory(&output).unwrap();
    assert_eq!(decoded.dimensions(), (8, 6));
  }

  #[test]
  fn process_image_scales_down_large_dimensions() {
    let png = encode_png(1024, 256);
    let output = process_image_inner(&png, 512, false).unwrap();
    let decoded = image::load_from_memory(&output).unwrap();

    assert_eq!(decoded.dimensions(), (512, 128));
  }

  #[test]
  fn process_image_preserves_exif_without_orientation() {
    let png = encode_png(8, 8);
    let mut png_with_exif = png.clone();
    let mut metadata = Metadata::new();
    metadata.set_tag(ExifTag::ImageDescription("copilot".to_string()));
    metadata.set_tag(ExifTag::Orientation(vec![6]));
    metadata
      .write_to_vec(&mut png_with_exif, FileExtension::PNG { as_zTXt_chunk: true })
      .unwrap();

    let output = process_image_inner(&png_with_exif, 512, true).unwrap();
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

  #[test]
  fn process_image_rejects_invalid_input() {
    let error = process_image_inner(b"not-an-image", 512, false).unwrap_err();
    assert_eq!(error.to_string(), "unsupported image format");
  }

  #[test]
  fn process_image_rejects_images_over_dimension_limit_before_decode() {
    let bmp = encode_bmp_header(MAX_IMAGE_DIMENSION + 1, 1);
    let error = process_image_inner(&bmp, 512, false).unwrap_err();

    assert_eq!(error.to_string(), "image dimensions exceed limit");
  }
}
