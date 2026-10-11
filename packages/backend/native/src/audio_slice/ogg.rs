use super::{Context, Cursor, OpusAudio, PacketReader, RATE, Result, ensure, packet_samples};

pub(super) fn read(data: &[u8]) -> Result<OpusAudio> {
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
  Ok(OpusAudio {
    header: head.data,
    packets,
    start: pre_skip,
    end,
  })
}
