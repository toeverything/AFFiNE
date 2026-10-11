use mp4parse::{AudioCodecSpecific, SampleEntry, TrackType, read_mp4, serialize_opus_header};

use super::{Context, Cursor, OpusAudio, RATE, Result, ensure, packet_samples};

pub(super) fn read(data: &[u8]) -> Result<OpusAudio> {
  let context = read_mp4(&mut Cursor::new(data))?;
  ensure!(context.mvex.is_none(), "Fragmented MP4 is unsupported");
  let mut tracks = context
    .tracks
    .iter()
    .filter(|track| track.track_type == TrackType::Audio);
  let track = tracks.next().context("Missing MP4 audio track")?;
  ensure!(tracks.next().is_none(), "Multiple MP4 audio tracks are unsupported");
  ensure!(
    track.empty_duration.as_ref().is_none_or(|duration| duration.0 == 0),
    "Empty MP4 edits are unsupported"
  );
  let descriptions = &track
    .stsd
    .as_ref()
    .context("Missing MP4 sample description")?
    .descriptions;
  ensure!(
    descriptions.len() == 1,
    "Multiple MP4 sample descriptions are unsupported"
  );
  let SampleEntry::Audio(entry) = &descriptions[0] else {
    anyhow::bail!("Expected MP4 audio sample entry");
  };
  ensure!(entry.protection_info.is_empty(), "Encrypted MP4 audio is unsupported");
  let AudioCodecSpecific::OpusSpecificBox(opus) = &entry.codec_specific else {
    anyhow::bail!("Transcript recovery requires Opus audio");
  };
  let mut header = Vec::new();
  serialize_opus_header(opus, &mut header)?;
  let chunks = &track.stco.as_ref().context("Missing MP4 chunk offsets")?.offsets;
  let mapping = &track
    .stsc
    .as_ref()
    .context("Missing MP4 sample-to-chunk table")?
    .samples;
  let sizes = track.stsz.as_ref().context("Missing MP4 sample sizes")?;
  let timing = &track.stts.as_ref().context("Missing MP4 sample timing")?.samples;
  let count = timing
    .iter()
    .try_fold(0u64, |sum, entry| sum.checked_add(u64::from(entry.sample_count)))
    .context("MP4 sample count overflow")?;
  ensure!(
    count <= 3600 * RATE / 120,
    "Transcript recovery slice exceeds packet limit"
  );
  ensure!(
    sizes.sample_size != 0 || sizes.sample_sizes.len() as u64 == count,
    "Inconsistent MP4 sample count"
  );
  ensure!(
    mapping.first().is_some_and(|entry| entry.first_chunk == 1)
      && mapping.windows(2).all(|pair| pair[0].first_chunk < pair[1].first_chunk),
    "Invalid MP4 chunk mapping"
  );
  let mut packets = Vec::new();
  let mut decoded = 0;
  let mut sample_index = 0usize;
  let mut mapping_index = 0;
  for (chunk_index, chunk_offset) in chunks.iter().enumerate() {
    while mapping_index + 1 < mapping.len() && mapping[mapping_index + 1].first_chunk as usize <= chunk_index + 1 {
      mapping_index += 1;
    }
    let entry = &mapping[mapping_index];
    ensure!(
      entry.sample_description_index == 1 && entry.samples_per_chunk > 0,
      "Invalid MP4 sample mapping"
    );
    let mut offset = usize::try_from(*chunk_offset)?;
    for _ in 0..entry.samples_per_chunk {
      ensure!((sample_index as u64) < count, "Excess MP4 samples");
      let size = if sizes.sample_size == 0 {
        sizes.sample_sizes[sample_index]
      } else {
        sizes.sample_size
      } as usize;
      let end = offset.checked_add(size).context("MP4 sample offset overflow")?;
      let packet = data.get(offset..end).context("Truncated MP4 sample")?;
      let start = decoded;
      decoded += packet_samples(packet)?;
      ensure!(decoded <= 3600 * RATE, "Transcript recovery slice exceeds one hour");
      packets.push((start, decoded, packet.to_vec()));
      offset = end;
      sample_index += 1;
    }
  }
  ensure!(sample_index as u64 == count, "Missing MP4 samples");
  let timescale = track.timescale.as_ref().context("Missing MP4 timescale")?.0;
  let to_samples = |time: u64, scale: u64| -> Result<u64> {
    ensure!(scale > 0, "Invalid MP4 timescale");
    Ok(time.checked_mul(RATE).context("MP4 duration overflow")? / scale)
  };
  // MP4 uses the edit list for playback trimming; dOps pre-skip is
  // informational.
  let start = to_samples(track.media_time.as_ref().map_or(0, |time| time.0), timescale)?;
  let end = if let Some(duration) = &track.edited_duration {
    let movie_scale = context.timescale.as_ref().context("Missing MP4 movie timescale")?.0;
    start
      .checked_add(to_samples(duration.0, movie_scale)?)
      .context("MP4 edit overflow")?
  } else {
    let duration = timing
      .iter()
      .try_fold(0u64, |sum, entry| {
        sum.checked_add(u64::from(entry.sample_count) * u64::from(entry.sample_delta))
      })
      .context("MP4 duration overflow")?;
    to_samples(duration, timescale)?
  };
  Ok(OpusAudio {
    header,
    packets,
    start,
    end,
  })
}
