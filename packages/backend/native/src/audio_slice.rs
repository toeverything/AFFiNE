use std::io::Cursor;

use anyhow::{Context, Result, ensure};
use napi::bindgen_prelude::Buffer;
use ogg::{
  PacketReader,
  writing::{PacketWriteEndInfo, PacketWriter},
};

const RATE: u64 = 48_000;
const SLICE_SAMPLES: u64 = 30 * RATE;
const PRE_ROLL: u64 = 3_840;

#[napi(object)]
pub struct TranscriptAudioSlice {
  pub data: Buffer,
  pub start_sec: f64,
  pub duration_sec: f64,
}

// RFC 6716 section 3: packet duration is encoded in the TOC, without decoding
// audio.
fn packet_samples(packet: &[u8]) -> Result<u64> {
  let toc = *packet.first().context("Empty Opus packet")?;
  let frame_samples = if toc & 0x80 != 0 {
    120 << ((toc >> 3) & 3)
  } else if toc & 0x60 == 0x60 {
    if toc & 8 != 0 { 960 } else { 480 }
  } else {
    [480, 960, 1920, 2880][((toc >> 3) & 3) as usize]
  };
  let frames = match toc & 3 {
    0 => 1,
    1 | 2 => 2,
    _ => u64::from(*packet.get(1).context("Missing Opus frame count")? & 0x3f),
  };
  let samples = frame_samples * frames;
  ensure!(samples > 0 && samples <= 5760, "Invalid Opus packet duration");
  Ok(samples)
}

fn split(data: &[u8]) -> Result<Vec<TranscriptAudioSlice>> {
  ensure!(data.len() <= 50 * 1024 * 1024, "Transcript audio exceeds size limit");
  let mut reader = PacketReader::new(Cursor::new(data));
  let head = reader.read_packet_expected()?;
  ensure!(
    head.first_in_stream()
      && head.data.len() == 19
      && head.data.starts_with(b"OpusHead")
      && head.data[8] == 1
      && matches!(head.data[9], 1 | 2)
      && head.data[18] == 0,
    "Transcript recovery requires mono/stereo Ogg Opus"
  );
  let serial = head.stream_serial();
  let pre_skip = u64::from(u16::from_le_bytes([head.data[10], head.data[11]]));
  let tags = reader.read_packet_expected()?;
  ensure!(
    tags.stream_serial() == serial && tags.data.starts_with(b"OpusTags"),
    "Missing Opus tags"
  );
  let mut packets = Vec::new();
  let mut decoded = 0;
  let mut origin = None;
  let mut end = None;
  while let Some(packet) = reader.read_packet()? {
    ensure!(
      packet.stream_serial() == serial && end.is_none(),
      "Chained or multiplexed Opus is unsupported"
    );
    let start = decoded;
    decoded += packet_samples(&packet.data)?;
    if packet.last_in_page() && origin.is_none() {
      origin = Some(packet.absgp_page().saturating_sub(decoded));
    }
    if packet.last_in_stream() {
      end = Some(
        packet
          .absgp_page()
          .checked_sub(origin.unwrap_or(0))
          .context("Invalid Opus end position")?,
      );
    }
    packets.push((start, decoded, packet.data));
    ensure!(decoded <= 3600 * RATE, "Transcript recovery slice exceeds one hour");
  }
  let end = end.context("Incomplete Ogg Opus stream")?.min(decoded);
  ensure!(end > pre_skip, "Empty Ogg Opus stream");
  let mut slices = Vec::new();
  let chunk_samples = SLICE_SAMPLES.min((end - pre_skip).div_ceil(2));
  let mut start = pre_skip;
  while start < end {
    let stop = (start + chunk_samples).min(end);
    let seek = start.saturating_sub(PRE_ROLL);
    let first = packets.partition_point(|(_, packet_end, _)| *packet_end <= seek);
    let last = packets.partition_point(|(packet_start, _, _)| *packet_start < stop);
    let base = packets[first].0;
    let mut header = head.data.clone();
    let skip = u16::try_from(start - base).context("Opus pre-roll exceeds header limit")?;
    header[10..12].copy_from_slice(&skip.to_le_bytes());
    let mut writer = PacketWriter::new(Vec::new());
    writer.write_packet(header, serial, PacketWriteEndInfo::EndPage, 0)?;
    // Do not propagate user-supplied comments into recovery requests.
    writer.write_packet(
      b"OpusTags\0\0\0\0\0\0\0\0".to_vec(),
      serial,
      PacketWriteEndInfo::EndPage,
      0,
    )?;
    for (index, (_, packet_end, packet)) in packets[first..last].iter().enumerate() {
      let final_packet = index + first + 1 == last;
      writer.write_packet(
        packet.clone(),
        serial,
        if final_packet {
          PacketWriteEndInfo::EndStream
        } else {
          PacketWriteEndInfo::NormalPacket
        },
        if final_packet { stop - base } else { packet_end - base },
      )?;
    }
    slices.push(TranscriptAudioSlice {
      data: writer.into_inner().into(),
      start_sec: (start - pre_skip) as f64 / RATE as f64,
      duration_sec: (stop - start) as f64 / RATE as f64,
    });
    start = stop;
  }
  Ok(slices)
}

#[napi]
pub async fn split_transcript_audio(data: Buffer) -> napi::Result<Vec<TranscriptAudioSlice>> {
  tokio::task::spawn_blocking(move || split(&data))
    .await
    .map_err(|error| napi::Error::from_reason(error.to_string()))?
    .map_err(|error| napi::Error::from_reason(format!("Cannot split transcript audio: {error}")))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn splits_opus_with_preskip_preroll_and_trimmed_tail() {
    let mut writer = PacketWriter::new(Vec::new());
    let mut header = b"OpusHead\x01\x01\x38\x01\x80\xbb\0\0\0\0\0".to_vec();
    writer
      .write_packet(header.clone(), 1, PacketWriteEndInfo::EndPage, 0)
      .unwrap();
    writer
      .write_packet(b"OpusTags\0\0\0\0\0\0\0\0".to_vec(), 1, PacketWriteEndInfo::EndPage, 0)
      .unwrap();
    let end = 3100 * 960 - 400;
    for i in 0..3100 {
      let last = i == 3099;
      writer
        .write_packet(
          vec![0xf8, 0xff, 0xfe],
          1,
          if last {
            PacketWriteEndInfo::EndStream
          } else {
            PacketWriteEndInfo::NormalPacket
          },
          if last { end } else { (i + 1) * 960 },
        )
        .unwrap();
    }
    let data = writer.into_inner();
    let slices = split(&data).unwrap();
    assert_eq!(slices.len(), 3);
    assert_eq!(
      slices.iter().map(|slice| slice.start_sec).collect::<Vec<_>>(),
      [0.0, 30.0, 60.0]
    );
    assert_eq!(slices[0].duration_sec, 30.0);
    assert!((slices.iter().map(|slice| slice.duration_sec).sum::<f64>() - (end - 312) as f64 / 48000.0).abs() < 1e-9);
    for (i, slice) in slices.iter().enumerate() {
      let mut reader = PacketReader::new(Cursor::new(slice.data.as_ref()));
      header = reader.read_packet_expected().unwrap().data;
      let skip = u16::from_le_bytes([header[10], header[11]]) as u64;
      if i > 0 {
        assert!(skip >= PRE_ROLL);
      }
      reader.read_packet_expected().unwrap();
      let mut final_gp = 0;
      while let Some(packet) = reader.read_packet().unwrap() {
        assert_eq!(packet.data, [0xf8, 0xff, 0xfe]);
        final_gp = packet.absgp_page();
      }
      assert!(((final_gp - skip) as f64 / 48000.0 - slice.duration_sec).abs() < 1e-9);
    }
    let short = split(&slices[2].data).unwrap();
    assert_eq!(short.len(), 2);
    assert_eq!(short[0].start_sec, 0.0);
    assert!((short[0].duration_sec + short[1].duration_sec - slices[2].duration_sec).abs() < 1e-9);
    assert_eq!(short[1].start_sec, short[0].duration_sec);
    assert!(split(&data[..data.len() - 10]).is_err());
    assert!(split(b"not audio").is_err());
    assert!(packet_samples(&[]).is_err());
    assert!(packet_samples(&[3, 0]).is_err());
    assert_eq!(packet_samples(&[0xf8]).unwrap(), 960);
    assert_eq!(packet_samples(&[0x18]).unwrap(), 2880);
  }
}
