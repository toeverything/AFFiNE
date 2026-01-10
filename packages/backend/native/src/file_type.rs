use mp4parse::{TrackType, read_mp4};
use napi_derive::napi;

#[napi]
pub fn get_mime(input: &[u8]) -> String {
  let mimetype = if let Some(kind) = infer::get(&input[..4096.min(input.len())]) {
    kind.mime_type().to_string()
  } else {
    file_format::FileFormat::from_bytes(input).media_type().to_string()
  };
  if mimetype == "video/mp4" {
    detect_mp4_flavor(input)
  } else {
    mimetype
  }
}

fn detect_mp4_flavor(input: &[u8]) -> String {
  let mut cursor = std::io::Cursor::new(input);
  match read_mp4(&mut cursor) {
    Ok(ctx) => {
      let mut has_video = false;
      let mut has_audio = false;
      for track in ctx.tracks.iter() {
        match track.track_type {
          TrackType::Video | TrackType::AuxiliaryVideo | TrackType::Picture => has_video = true,
          TrackType::Audio => has_audio = true,
          _ => {}
        }
      }
      if !has_video && has_audio {
        "audio/m4a".to_string()
      } else {
        "video/mp4".to_string()
      }
    }
    Err(_) => "video/mp4".to_string(),
  }
}
