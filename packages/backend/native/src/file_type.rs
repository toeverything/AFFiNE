use matroska::Matroska;
use mp4parse::{TrackType, read_mp4};
use napi_derive::napi;

#[napi]
pub fn get_mime(input: &[u8]) -> String {
  let mimetype = if let Some(kind) = infer::get(&input[..4096.min(input.len())]) {
    kind.mime_type().to_string()
  } else {
    file_format::FileFormat::from_bytes(input).media_type().to_string()
  };
  if let Some(container) = matroska_container_kind(input).or(match mimetype.as_str() {
    "video/webm" | "application/webm" => Some(ContainerKind::WebM),
    "video/x-matroska" | "application/x-matroska" => Some(ContainerKind::Matroska),
    _ => None,
  }) {
    detect_matroska_flavor(input, container, &mimetype)
  } else if mimetype == "video/mp4" {
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

#[derive(Clone, Copy)]
enum ContainerKind {
  WebM,
  Matroska,
}

impl ContainerKind {
  fn audio_mime(&self) -> &'static str {
    match self {
      ContainerKind::WebM => "audio/webm",
      ContainerKind::Matroska => "audio/x-matroska",
    }
  }
}

fn detect_matroska_flavor(input: &[u8], container: ContainerKind, fallback: &str) -> String {
  match Matroska::open(std::io::Cursor::new(input)) {
    Ok(file) => {
      let has_video = file.video_tracks().next().is_some();
      let has_audio = file.audio_tracks().next().is_some();
      if !has_video && has_audio {
        container.audio_mime().to_string()
      } else {
        fallback.to_string()
      }
    }
    Err(_) => fallback.to_string(),
  }
}

fn matroska_container_kind(input: &[u8]) -> Option<ContainerKind> {
  let header = &input[..1024.min(input.len())];
  if header.windows(4).any(|window| window.eq_ignore_ascii_case(b"webm")) {
    Some(ContainerKind::WebM)
  } else if header.windows(8).any(|window| window.eq_ignore_ascii_case(b"matroska")) {
    Some(ContainerKind::Matroska)
  } else {
    None
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const AUDIO_ONLY_WEBM: &[u8] = include_bytes!("../fixtures/audio-only.webm");
  const AUDIO_VIDEO_WEBM: &[u8] = include_bytes!("../fixtures/audio-video.webm");
  const AUDIO_ONLY_MATROSKA: &[u8] = include_bytes!("../fixtures/audio-only.mka");

  #[test]
  fn detects_audio_only_webm_as_audio() {
    assert_eq!(get_mime(AUDIO_ONLY_WEBM), "audio/webm");
  }

  #[test]
  fn preserves_video_webm() {
    assert_eq!(get_mime(AUDIO_VIDEO_WEBM), "video/webm");
  }

  #[test]
  fn detects_audio_only_matroska_as_audio() {
    assert_eq!(get_mime(AUDIO_ONLY_MATROSKA), "audio/x-matroska");
  }
}
