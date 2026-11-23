use matroska::Matroska;
use mp4parse::{TrackType, read_mp4};
use napi_derive::napi;
use xmlparser::{Token, Tokenizer};

const SVG_SNIFF_LIMIT: usize = 64 * 1024;

#[napi]
pub fn get_mime(input: &[u8]) -> String {
  let svg_root = has_svg_root(input);
  if svg_root == Some(true) {
    return "image/svg+xml".to_string();
  }
  let mimetype = if let Some(kind) = infer::get(&input[..4096.min(input.len())]) {
    kind.mime_type().to_string()
  } else {
    file_format::FileFormat::from_bytes(input).media_type().to_string()
  };
  if mimetype == "image/svg+xml" && svg_root == Some(false) {
    "text/xml".to_string()
  } else if let Some(container) = matroska_container_kind(input).or(match mimetype.as_str() {
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

fn has_svg_root(input: &[u8]) -> Option<bool> {
  let prefix = &input[..SVG_SNIFF_LIMIT.min(input.len())];
  let prefix = match std::str::from_utf8(prefix) {
    Ok(prefix) => prefix,
    Err(error) => std::str::from_utf8(&prefix[..error.valid_up_to()]).unwrap_or_default(),
  };
  for token in Tokenizer::from(prefix) {
    match token {
      Ok(Token::ElementStart { local, span, .. }) => {
        if !matches!(
          prefix.as_bytes().get(span.end()),
          Some(b' ' | b'\t' | b'\r' | b'\n' | b'/' | b'>')
        ) {
          return None;
        }
        return Some(local.as_str() == "svg");
      }
      Ok(_) => {}
      Err(_) => return None,
    }
  }
  None
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
  fn detects_svg_root() {
    for input in [
      "<svg/>",
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>",
      "\u{feff}<?xml version=\"1.0\"?><svg/>",
      " \n\t<!-- diagram -->\r<svg></svg>",
      "<?xml version=\"1.0\"?><!DOCTYPE svg SYSTEM \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\"><svg/>",
      "<!DOCTYPE svg [<!ENTITY label \"<svg>\">]><svg/>",
      "<?xml version=\"1.0\"?><?xml-stylesheet href=\"style.css\"?><svg/>",
      "<?xml version=\"1.0\"?><svg:svg xmlns:svg=\"http://www.w3.org/2000/svg\"/>",
    ] {
      assert_eq!(has_svg_root(input.as_bytes()), Some(true), "{input}");
      assert_eq!(get_mime(input.as_bytes()), "image/svg+xml", "{input}");
    }
  }

  #[test]
  fn preserves_non_svg_xml() {
    for input in [
      "<?xml version=\"1.0\"?><document/>",
      "<?xml version=\"1.0\"?><!-- <svg/> --><document/>",
      "<?xml version=\"1.0\"?><document><svg/></document>",
      "<?xml version=\"1.0\"?><!DOCTYPE document [<!ENTITY svg \"<svg/>\">]><document/>",
      "<?xml version=\"1.0\"?><svg-image/>",
      "<?xml version=\"1.0\"?><SVG/>",
    ] {
      assert_eq!(has_svg_root(input.as_bytes()), Some(false), "{input}");
      assert_eq!(get_mime(input.as_bytes()), "text/xml", "{input}");
    }
    assert_ne!(get_mime(b"<!-- <svg/> --><document/>"), "image/svg+xml");
  }

  #[test]
  fn rejects_missing_or_incomplete_svg_roots() {
    for input in ["", "<!-- <svg/>", "<?xml", "<svg", "not xml <svg/>"] {
      assert_eq!(has_svg_root(input.as_bytes()), None, "{input}");
    }
    assert_eq!(has_svg_root(b"\xff<svg/>"), None);
  }

  #[test]
  fn bounds_svg_detection() {
    let input = format!("<?xml version=\"1.0\"?><!--{}--><svg/>", " ".repeat(SVG_SNIFF_LIMIT));
    assert_eq!(has_svg_root(input.as_bytes()), None);
    assert_eq!(get_mime(input.as_bytes()), "text/xml");

    let input = format!("<svg style=\"{}\"/>", " ".repeat(SVG_SNIFF_LIMIT));
    assert_eq!(get_mime(input.as_bytes()), "image/svg+xml");

    let input = format!("<?xml version=\"1.0\"?><svg>{}</svg>", "a".repeat(8192));
    assert_eq!(get_mime(input.as_bytes()), "image/svg+xml");

    let input = format!("<svg>{}é</svg>", " ".repeat(SVG_SNIFF_LIMIT - 6));
    assert_eq!(get_mime(input.as_bytes()), "image/svg+xml");
  }

  #[test]
  fn detects_svg_after_large_export_preamble() {
    let input = format!(
      "<?xml version=\"1.0\"?><!-- Generator: Adobe Illustrator {} --><!DOCTYPE svg [<!ENTITY ns_svg \"http://www.w3.org/2000/svg\">]><svg xmlns=\"&ns_svg;\"/>",
      " ".repeat(8192)
    );
    assert_eq!(get_mime(input.as_bytes()), "image/svg+xml");
  }

  #[test]
  fn preserves_inconclusive_svg_fallback() {
    for input in ["<svg", "<svg attr=\"", "<svg invalid attribute/>"] {
      assert_eq!(get_mime(input.as_bytes()), "image/svg+xml", "{input}");
    }
    for input in ["<svg-image/>", "<svgOther><!-- <svg/> --></svgOther>"] {
      assert_eq!(
        file_format::FileFormat::from_bytes(input.as_bytes()).media_type(),
        "image/svg+xml"
      );
      assert_eq!(get_mime(input.as_bytes()), "text/xml");
    }
  }

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
