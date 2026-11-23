use std::io::Cursor;

use ::ogg::{
  PacketReader,
  writing::{PacketWriteEndInfo, PacketWriter},
};
use anyhow::{Context, Result, ensure};
use napi::bindgen_prelude::Buffer;

mod mp4;
mod ogg;

struct OpusAudio {
  header: Vec<u8>,
  packets: Vec<(u64, u64, Vec<u8>)>,
  start: u64,
  end: u64,
}

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
  let audio = if data.starts_with(b"OggS") {
    ogg::read(data)?
  } else {
    mp4::read(data)?
  };
  let OpusAudio {
    header,
    packets,
    start: pre_skip,
    end,
  } = audio;
  ensure!(
    header.len() == 19 && matches!(header[9], 1 | 2) && header[18] == 0,
    "Transcript recovery requires mono/stereo Opus"
  );
  ensure!(
    end > pre_skip && end <= packets.last().context("Empty Opus stream")?.1,
    "Invalid Opus duration"
  );
  let serial = 1;
  let mut slices = Vec::new();
  let chunk_samples = SLICE_SAMPLES.min((end - pre_skip).div_ceil(2));
  let mut start = pre_skip;
  while start < end {
    let stop = (start + chunk_samples).min(end);
    let seek = start.saturating_sub(PRE_ROLL);
    let first = packets.partition_point(|(_, packet_end, _)| *packet_end <= seek);
    let last = packets.partition_point(|(packet_start, _, _)| *packet_start < stop);
    let base = packets[first].0;
    let mut header = header.clone();
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

  #[tokio::test]
  async fn splits_opus_with_preskip_preroll_and_trimmed_tail() {
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
    let slices = split_transcript_audio(data.clone().into()).await.unwrap();
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
    let error = split_transcript_audio(b"not audio".to_vec().into())
      .await
      .err()
      .unwrap();
    assert!(error.reason.starts_with("Cannot split transcript audio:"));
    // Generated with the same mp4-muxer settings as frontend muxToMp4:
    // 3100 mono Opus silence packets, each lasting 20 ms.
    let mp4 = include_bytes!("../../fixtures/transcript.m4a");
    let mp4_slices = split_transcript_audio(mp4.to_vec().into()).await.unwrap();
    assert_eq!(
      mp4_slices
        .iter()
        .map(|slice| (slice.start_sec, slice.duration_sec))
        .collect::<Vec<_>>(),
      [(0.0, 30.0), (30.0, 30.0), (60.0, 2.0)]
    );
    for slice in &mp4_slices {
      let audio = ogg::read(&slice.data).unwrap();
      assert!(audio.packets.iter().all(|(_, _, packet)| packet == &[0xf8, 0xff, 0xfe]));
      assert_eq!((audio.end - audio.start) as f64 / RATE as f64, slice.duration_sec);
    }
    assert!(split(&mp4[..mp4.len() - 1]).is_err());
    let mut wrong_codec = mp4.to_vec();
    let dops = wrong_codec.windows(4).position(|bytes| bytes == b"dOps").unwrap();
    wrong_codec[dops..dops + 4].copy_from_slice(b"free");
    assert!(split(&wrong_codec).is_err());

    // Exercise MP4 edit-list trimming independently of dOps pre-skip.
    let mut edited = mp4.to_vec();
    let moov = edited.windows(4).position(|bytes| bytes == b"moov").unwrap() - 4;
    let trak = edited.windows(4).position(|bytes| bytes == b"trak").unwrap() - 4;
    let trak_size = u32::from_be_bytes(edited[trak..trak + 4].try_into().unwrap());
    let movie = mp4parse::read_mp4(&mut Cursor::new(mp4)).unwrap();
    let movie_scale = movie.timescale.unwrap().0;
    let mut edit = Vec::new();
    edit.extend_from_slice(&36u32.to_be_bytes());
    edit.extend_from_slice(b"edts");
    edit.extend_from_slice(&28u32.to_be_bytes());
    edit.extend_from_slice(b"elst");
    edit.extend_from_slice(&0u32.to_be_bytes());
    edit.extend_from_slice(&1u32.to_be_bytes());
    edit.extend_from_slice(&(movie_scale as u32).to_be_bytes());
    edit.extend_from_slice(&312u32.to_be_bytes());
    edit.extend_from_slice(&65536u32.to_be_bytes());
    // Put the edit at the end of moov and move mdat offsets with the insertion.
    for offset in [moov, trak] {
      let size = u32::from_be_bytes(edited[offset..offset + 4].try_into().unwrap());
      edited[offset..offset + 4].copy_from_slice(&(size + 36).to_be_bytes());
    }
    let stco = edited.windows(4).position(|bytes| bytes == b"stco").unwrap();
    let entries = u32::from_be_bytes(edited[stco + 8..stco + 12].try_into().unwrap());
    for index in 0..entries as usize {
      let offset = stco + 12 + index * 4;
      let value = u32::from_be_bytes(edited[offset..offset + 4].try_into().unwrap());
      edited[offset..offset + 4].copy_from_slice(&(value + 36).to_be_bytes());
    }
    edited.splice(trak + trak_size as usize..trak + trak_size as usize, edit);
    let trimmed = split(&edited).unwrap();
    assert_eq!(trimmed.len(), 2);
    assert_eq!(trimmed[0].duration_sec, 0.5);
    assert_eq!(trimmed[1].start_sec, 0.5);
    assert_eq!(trimmed[1].duration_sec, 0.5);
    assert_eq!(ogg::read(&trimmed[0].data).unwrap().start, 312);
    assert!(packet_samples(&[]).is_err());
    assert!(packet_samples(&[3, 0]).is_err());
    assert_eq!(packet_samples(&[0xf8]).unwrap(), 960);
    assert_eq!(packet_samples(&[0x18]).unwrap(), 2880);
  }
}
