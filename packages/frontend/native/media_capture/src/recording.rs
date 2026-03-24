use std::{
  fs,
  io::{BufWriter, Write},
  path::PathBuf,
  sync::{
    Arc, LazyLock,
    atomic::{AtomicU64, Ordering},
  },
  thread::{self, JoinHandle},
  time::{SystemTime, UNIX_EPOCH},
};

use crossbeam_channel::{Receiver, Sender, bounded};
use napi::{Error, Status, bindgen_prelude::Result};
use napi_derive::napi;
use ogg::writing::{PacketWriteEndInfo, PacketWriter};
use opus_codec::{Application, Channels, Encoder, FrameSize, SampleRate as OpusSampleRate};
use rubato::Resampler;
use tokio::sync::{Mutex as AsyncMutex, mpsc, oneshot};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use crate::audio_callback::AudioCallback;
#[cfg(target_os = "macos")]
use crate::macos::screen_capture_kit::{ApplicationInfo, ShareableContent};
#[cfg(target_os = "windows")]
use crate::windows::screen_capture_kit::ShareableContent;

const ENCODE_SAMPLE_RATE: OpusSampleRate = OpusSampleRate::Hz48000;
const MAX_PACKET_SIZE: usize = 4096;
const RESAMPLER_INPUT_CHUNK: usize = 1024;
const AUDIO_CHUNK_QUEUE_CAPACITY: usize = 1024;

type RecordingResult<T> = std::result::Result<T, RecordingError>;

#[napi(object)]
pub struct RecordingStartOptions {
  pub app_process_id: Option<u32>,
  pub exclude_process_ids: Option<Vec<u32>>,
  pub output_dir: String,
  pub format: Option<String>,
  pub sample_rate: Option<u32>,
  pub channels: Option<u32>,
  pub id: Option<String>,
}

#[napi(object)]
pub struct RecordingSessionMeta {
  pub id: String,
  pub filepath: String,
  pub sample_rate: u32,
  pub channels: u32,
  pub started_at: i64,
}

#[napi(object)]
pub struct RecordingArtifact {
  pub id: String,
  pub filepath: String,
  pub sample_rate: u32,
  pub channels: u32,
  pub duration_ms: i64,
  pub size: i64,
  pub degraded: bool,
  pub overflow_count: u32,
}

#[derive(Debug, thiserror::Error)]
enum RecordingError {
  #[error("unsupported platform")]
  UnsupportedPlatform,
  #[error("invalid output directory")]
  InvalidOutputDir,
  #[error("invalid channel count {0}")]
  InvalidChannels(u32),
  #[error("invalid format {0}")]
  InvalidFormat(String),
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("encoding error: {0}")]
  Encoding(String),
  #[error("recording not found")]
  NotFound,
  #[error("empty recording")]
  Empty,
  #[error("start failure: {0}")]
  Start(String),
  #[error("teardown failure: {0}")]
  Teardown(String),
  #[error("join failure")]
  Join,
}

impl RecordingError {
  fn code(&self) -> &'static str {
    match self {
      RecordingError::UnsupportedPlatform => "unsupported-platform",
      RecordingError::InvalidOutputDir => "invalid-output-dir",
      RecordingError::InvalidChannels(_) => "invalid-channels",
      RecordingError::InvalidFormat(_) => "invalid-format",
      RecordingError::Io(_) => "io-error",
      RecordingError::Encoding(_) => "encoding-error",
      RecordingError::NotFound => "not-found",
      RecordingError::Empty => "empty-recording",
      RecordingError::Start(_) => "start-failure",
      RecordingError::Teardown(_) => "teardown-failure",
      RecordingError::Join => "join-failure",
    }
  }
}

impl From<RecordingError> for Error {
  fn from(err: RecordingError) -> Self {
    Error::new(Status::GenericFailure, format!("{}: {}", err.code(), err))
  }
}

struct InterleavedResampler {
  resampler: rubato::FastFixedIn<f32>,
  channels: usize,
  fifo: Vec<Vec<f32>>,
  warmed: bool,
}

impl InterleavedResampler {
  fn new(from_sr: u32, to_sr: u32, channels: usize) -> RecordingResult<Self> {
    let ratio = to_sr as f64 / from_sr as f64;
    let resampler = rubato::FastFixedIn::<f32>::new(
      ratio,
      1.0,
      rubato::PolynomialDegree::Linear,
      RESAMPLER_INPUT_CHUNK,
      channels,
    )
    .map_err(|e| RecordingError::Encoding(format!("resampler init failed: {e}")))?;

    Ok(Self {
      resampler,
      channels,
      fifo: vec![Vec::<f32>::new(); channels],
      warmed: false,
    })
  }

  fn append_blocks(&mut self, blocks: Vec<Vec<f32>>, out: &mut Vec<f32>) {
    if blocks.is_empty() || blocks.len() != self.channels {
      return;
    }
    if !self.warmed {
      self.warmed = true;
      return;
    }
    let out_len = blocks[0].len();
    for i in 0..out_len {
      for channel in blocks.iter().take(self.channels) {
        out.push(channel[i]);
      }
    }
  }

  fn feed(&mut self, interleaved: &[f32]) -> RecordingResult<Vec<f32>> {
    for frame in interleaved.chunks(self.channels) {
      for (idx, sample) in frame.iter().enumerate() {
        if let Some(channel_fifo) = self.fifo.get_mut(idx) {
          channel_fifo.push(*sample);
        }
      }
    }

    let mut out = Vec::new();

    while self.fifo.first().map(|q| q.len()).unwrap_or(0) >= RESAMPLER_INPUT_CHUNK {
      let mut chunk: Vec<Vec<f32>> = Vec::with_capacity(self.channels);
      for channel in &mut self.fifo {
        let take: Vec<f32> = channel.drain(..RESAMPLER_INPUT_CHUNK).collect();
        chunk.push(take);
      }

      let blocks = self
        .resampler
        .process(&chunk, None)
        .map_err(|e| RecordingError::Encoding(format!("resampler process failed: {e}")))?;
      self.append_blocks(blocks, &mut out);
    }

    Ok(out)
  }

  fn finalize(&mut self) -> RecordingResult<Vec<f32>> {
    let mut out = Vec::new();
    let has_pending = self.fifo.first().map(|q| !q.is_empty()).unwrap_or(false);

    if has_pending {
      let mut chunk: Vec<Vec<f32>> = Vec::with_capacity(self.channels);
      for channel in &mut self.fifo {
        chunk.push(std::mem::take(channel));
      }
      let blocks = self
        .resampler
        .process_partial(Some(&chunk), None)
        .map_err(|e| RecordingError::Encoding(format!("resampler finalize failed: {e}")))?;
      self.append_blocks(blocks, &mut out);
    }

    let delayed = self
      .resampler
      .process_partial::<Vec<f32>>(None, None)
      .map_err(|e| RecordingError::Encoding(format!("resampler drain failed: {e}")))?;
    self.append_blocks(delayed, &mut out);

    Ok(out)
  }
}

fn normalize_channel_count(channels: u32) -> RecordingResult<Channels> {
  match channels {
    1 => Ok(Channels::Mono),
    2 => Ok(Channels::Stereo),
    other => Err(RecordingError::InvalidChannels(other)),
  }
}

fn convert_interleaved_channels(
  samples: &[f32],
  source_channels: usize,
  target_channels: usize,
) -> RecordingResult<Vec<f32>> {
  if source_channels == 0 || target_channels == 0 {
    return Err(RecordingError::Encoding("channel count must be positive".into()));
  }

  if !samples.len().is_multiple_of(source_channels) {
    return Err(RecordingError::Encoding("invalid interleaved sample buffer".into()));
  }

  if source_channels == target_channels {
    return Ok(samples.to_vec());
  }

  let frame_count = samples.len() / source_channels;
  let mut converted = Vec::with_capacity(frame_count * target_channels);

  match (source_channels, target_channels) {
    (1, 2) => {
      for &sample in samples {
        converted.push(sample);
        converted.push(sample);
      }
    }
    (_, 1) => {
      for frame in samples.chunks(source_channels) {
        let sum: f32 = frame.iter().copied().sum();
        converted.push(sum / source_channels as f32);
      }
    }
    (2, 2) => return Ok(samples.to_vec()),
    (_, 2) => {
      for frame in samples.chunks(source_channels) {
        let mono = frame.iter().copied().sum::<f32>() / source_channels as f32;
        converted.push(mono);
        converted.push(mono);
      }
    }
    _ => {
      return Err(RecordingError::Encoding(format!(
        "unsupported channel conversion: {source_channels} -> {target_channels}"
      )));
    }
  }

  Ok(converted)
}

struct OggOpusWriter {
  writer: PacketWriter<'static, BufWriter<fs::File>>,
  encoder: Encoder,
  frame_samples: usize,
  pending: Vec<f32>,
  pending_packet: Option<Vec<u8>>,
  pending_packet_granule_position: u64,
  granule_position: u64,
  samples_written: u64,
  source_channels: usize,
  channels: Channels,
  sample_rate: OpusSampleRate,
  resampler: Option<InterleavedResampler>,
  filepath: PathBuf,
  stream_serial: u32,
}

impl OggOpusWriter {
  fn new(
    filepath: PathBuf,
    source_sample_rate: u32,
    source_channels: u32,
    encoding_channels: u32,
  ) -> RecordingResult<Self> {
    let source_channels =
      usize::try_from(source_channels).map_err(|_| RecordingError::InvalidChannels(source_channels))?;
    let channels = normalize_channel_count(encoding_channels)?;

    let sample_rate = ENCODE_SAMPLE_RATE;
    let mut encoder =
      Encoder::new(sample_rate, channels, Application::Audio).map_err(|e| RecordingError::Encoding(e.to_string()))?;
    let pre_skip = u16::try_from(
      encoder
        .lookahead()
        .map_err(|e| RecordingError::Encoding(e.to_string()))?,
    )
    .map_err(|_| RecordingError::Encoding("invalid encoder lookahead".into()))?;
    let resampler = if source_sample_rate != sample_rate.as_i32() as u32 {
      Some(InterleavedResampler::new(
        source_sample_rate,
        sample_rate.as_i32() as u32,
        channels.as_usize(),
      )?)
    } else {
      None
    };

    if let Some(parent) = filepath.parent() {
      fs::create_dir_all(parent)?;
    }

    let file = fs::File::create(&filepath)?;
    let mut writer = PacketWriter::new(BufWriter::new(file));

    let stream_serial: u32 = rand::random();
    write_opus_headers(&mut writer, stream_serial, channels, sample_rate, pre_skip)?;

    let frame_samples = FrameSize::Ms20.samples(sample_rate);

    Ok(Self {
      writer,
      encoder,
      frame_samples,
      pending: Vec::new(),
      pending_packet: None,
      pending_packet_granule_position: 0,
      granule_position: u64::from(pre_skip),
      samples_written: 0,
      source_channels,
      channels,
      sample_rate,
      resampler,
      filepath,
      stream_serial,
    })
  }

  fn push_samples(&mut self, samples: &[f32]) -> RecordingResult<()> {
    let normalized = convert_interleaved_channels(samples, self.source_channels, self.channels.as_usize())?;
    let mut processed = if let Some(resampler) = &mut self.resampler {
      resampler.feed(&normalized)?
    } else {
      normalized
    };

    if processed.is_empty() {
      return Ok(());
    }

    self.pending.append(&mut processed);
    let frame_len = self.frame_samples * self.channels.as_usize();

    while self.pending.len() >= frame_len {
      let frame: Vec<f32> = self.pending.drain(..frame_len).collect();
      self.encode_frame(frame, self.frame_samples, PacketWriteEndInfo::NormalPacket)?;
    }

    Ok(())
  }

  fn encode_frame(&mut self, frame: Vec<f32>, samples_in_frame: usize, end: PacketWriteEndInfo) -> RecordingResult<()> {
    let mut out = vec![0u8; MAX_PACKET_SIZE];
    let encoded = self
      .encoder
      .encode_float(&frame, &mut out)
      .map_err(|e| RecordingError::Encoding(e.to_string()))?;

    self.granule_position += samples_in_frame as u64;
    self.samples_written += samples_in_frame as u64;

    let packet = out[..encoded].to_vec();

    if let Some(previous_packet) = self.pending_packet.replace(packet) {
      self
        .writer
        .write_packet(
          previous_packet,
          self.stream_serial,
          PacketWriteEndInfo::NormalPacket,
          self.pending_packet_granule_position,
        )
        .map_err(|e| RecordingError::Encoding(format!("failed to write packet: {e}")))?;
    }
    self.pending_packet_granule_position = self.granule_position;

    if end == PacketWriteEndInfo::EndStream {
      let final_packet = self
        .pending_packet
        .take()
        .ok_or_else(|| RecordingError::Encoding("missing final packet".into()))?;
      self
        .writer
        .write_packet(
          final_packet,
          self.stream_serial,
          PacketWriteEndInfo::EndStream,
          self.pending_packet_granule_position,
        )
        .map_err(|e| RecordingError::Encoding(format!("failed to write packet: {e}")))?;
    }

    Ok(())
  }

  fn finish(mut self) -> RecordingResult<RecordingArtifact> {
    if let Some(resampler) = &mut self.resampler {
      let mut flushed = resampler.finalize()?;
      self.pending.append(&mut flushed);
    }

    let frame_len = self.frame_samples * self.channels.as_usize();
    if !self.pending.is_empty() {
      let mut frame = self.pending.clone();
      let samples_in_frame = frame.len() / self.channels.as_usize();
      frame.resize(frame_len, 0.0);
      self.encode_frame(frame, samples_in_frame, PacketWriteEndInfo::EndStream)?;
      self.pending.clear();
    }

    if self.samples_written == 0 {
      fs::remove_file(&self.filepath).ok();
      return Err(RecordingError::Empty);
    }

    if let Some(final_packet) = self.pending_packet.take() {
      self
        .writer
        .write_packet(
          final_packet,
          self.stream_serial,
          PacketWriteEndInfo::EndStream,
          self.pending_packet_granule_position,
        )
        .map_err(|e| RecordingError::Encoding(format!("failed to finish stream: {e}")))?;
    }

    self.writer.inner_mut().flush()?;

    let size = fs::metadata(&self.filepath)?.len() as i64;
    let duration_ms = (self.samples_written * 1000) as i64 / self.sample_rate.as_i32() as i64;

    Ok(RecordingArtifact {
      id: String::new(),
      filepath: self.filepath.to_string_lossy().to_string(),
      sample_rate: self.sample_rate.as_i32() as u32,
      channels: self.channels.as_usize() as u32,
      duration_ms,
      size,
      degraded: false,
      overflow_count: 0,
    })
  }
}

fn write_opus_headers(
  writer: &mut PacketWriter<'static, BufWriter<fs::File>>,
  stream_serial: u32,
  channels: Channels,
  sample_rate: OpusSampleRate,
  pre_skip: u16,
) -> RecordingResult<()> {
  let mut opus_head = Vec::with_capacity(19);
  opus_head.extend_from_slice(b"OpusHead");
  opus_head.push(1); // version
  opus_head.push(channels.as_usize() as u8);
  opus_head.extend_from_slice(&pre_skip.to_le_bytes());
  opus_head.extend_from_slice(&(sample_rate.as_i32() as u32).to_le_bytes());
  opus_head.extend_from_slice(&0i16.to_le_bytes()); // output gain
  opus_head.push(0); // channel mapping

  writer
    .write_packet(opus_head, stream_serial, PacketWriteEndInfo::EndPage, 0)
    .map_err(|e| RecordingError::Encoding(format!("failed to write OpusHead: {e}")))?;

  let vendor = b"AFFiNE Native";
  let mut opus_tags = Vec::new();
  opus_tags.extend_from_slice(b"OpusTags");
  opus_tags.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
  opus_tags.extend_from_slice(vendor);
  opus_tags.extend_from_slice(&0u32.to_le_bytes()); // user comment list length

  writer
    .write_packet(opus_tags, stream_serial, PacketWriteEndInfo::EndPage, 0)
    .map_err(|e| RecordingError::Encoding(format!("failed to write OpusTags: {e}")))?;

  Ok(())
}

enum PlatformCapture {
  #[cfg(target_os = "macos")]
  Mac(crate::macos::tap_audio::AudioCaptureSession),
  #[cfg(target_os = "windows")]
  Windows(crate::windows::audio_capture::AudioCaptureSession),
}

impl PlatformCapture {
  fn stop(&mut self) -> Result<()> {
    match self {
      #[cfg(target_os = "macos")]
      PlatformCapture::Mac(session) => session.stop(),
      #[cfg(target_os = "windows")]
      PlatformCapture::Windows(session) => session.stop(),
      #[allow(unreachable_patterns)]
      _ => Err(RecordingError::UnsupportedPlatform.into()),
    }
  }
}

enum ControlMessage {
  Stop {
    reply_tx: oneshot::Sender<RecordingResult<RecordingArtifact>>,
  },
  Abort {
    reply_tx: oneshot::Sender<RecordingResult<()>>,
  },
}

struct ActiveRecording {
  id: String,
  control_tx: mpsc::UnboundedSender<ControlMessage>,
  controller: Option<JoinHandle<()>>,
}

#[derive(Default)]
struct RecordingQualityMetrics {
  overflow_count: Arc<AtomicU64>,
}

impl RecordingQualityMetrics {
  fn shared_counter(&self) -> Arc<AtomicU64> {
    Arc::clone(&self.overflow_count)
  }

  fn overflow_count(&self) -> u32 {
    self
      .overflow_count
      .load(Ordering::Relaxed)
      .try_into()
      .unwrap_or(u32::MAX)
  }
}

static ACTIVE_RECORDING: LazyLock<AsyncMutex<Option<ActiveRecording>>> = LazyLock::new(|| AsyncMutex::new(None));
static START_RECORDING_LOCK: LazyLock<AsyncMutex<()>> = LazyLock::new(|| AsyncMutex::new(()));

fn now_millis() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

fn new_recording_id() -> String {
  format!("{}-{:08x}", now_millis(), rand::random::<u32>())
}

fn sanitize_id(id: Option<String>) -> String {
  let raw = id.unwrap_or_else(new_recording_id);
  let filtered: String = raw
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
    .collect();
  if filtered.is_empty() {
    new_recording_id()
  } else {
    filtered
  }
}

fn validate_output_dir(path: &str) -> Result<PathBuf> {
  let dir = PathBuf::from(path);
  if !dir.is_absolute() {
    return Err(RecordingError::InvalidOutputDir.into());
  }
  fs::create_dir_all(&dir)?;
  let normalized = dir.canonicalize().map_err(|_| RecordingError::InvalidOutputDir)?;
  Ok(normalized)
}

#[cfg(target_os = "macos")]
fn build_excluded_refs(ids: &[u32]) -> Result<Vec<ApplicationInfo>> {
  if ids.is_empty() {
    return Ok(Vec::new());
  }
  let apps = ShareableContent::applications()?;
  let mut excluded = Vec::new();
  for app in apps {
    if ids.contains(&(app.process_id as u32)) {
      excluded.push(app);
    }
  }
  Ok(excluded)
}

fn start_capture(
  opts: &RecordingStartOptions,
  tx: Sender<Vec<f32>>,
  overflow_count: Arc<AtomicU64>,
) -> Result<(PlatformCapture, u32, u32)> {
  #[cfg(target_os = "macos")]
  {
    let callback = AudioCallback::Channel {
      sender: tx,
      overflow_count,
    };
    let session = if let Some(app_id) = opts.app_process_id {
      ShareableContent::tap_audio_with_callback(app_id, callback)?
    } else {
      let excluded_apps = build_excluded_refs(opts.exclude_process_ids.as_deref().unwrap_or(&[]))?;
      let excluded_refs: Vec<&ApplicationInfo> = excluded_apps.iter().collect();
      ShareableContent::tap_global_audio_with_callback(Some(excluded_refs), callback)?
    };
    let sample_rate = session.get_sample_rate()?.round().clamp(1.0, f64::MAX) as u32;
    let channels = session.get_channels()?;
    Ok((PlatformCapture::Mac(session), sample_rate, channels))
  }

  #[cfg(target_os = "windows")]
  {
    let callback = AudioCallback::Channel {
      sender: tx,
      overflow_count,
    };
    let session =
      ShareableContent::tap_audio_with_callback(opts.app_process_id.unwrap_or(0), callback, opts.sample_rate)?;
    let sample_rate = session.get_sample_rate().round() as u32;
    let channels = session.get_channels();
    return Ok((PlatformCapture::Windows(session), sample_rate, channels));
  }

  #[cfg(not(any(target_os = "macos", target_os = "windows")))]
  {
    let _ = opts;
    let _ = tx;
    let _ = overflow_count;
    Err(RecordingError::UnsupportedPlatform.into())
  }
}

fn spawn_worker(
  id: String,
  filepath: PathBuf,
  rx: Receiver<Vec<f32>>,
  source_sample_rate: u32,
  source_channels: u32,
  encoding_channels: u32,
) -> JoinHandle<std::result::Result<RecordingArtifact, RecordingError>> {
  thread::spawn(move || {
    let mut writer = OggOpusWriter::new(filepath.clone(), source_sample_rate, source_channels, encoding_channels)?;
    for chunk in rx {
      writer.push_samples(&chunk)?;
    }
    let mut artifact = writer.finish()?;
    artifact.id = id;
    Ok(artifact)
  })
}

fn finalize_worker_artifact(
  worker_result: RecordingResult<RecordingArtifact>,
  metrics: &RecordingQualityMetrics,
) -> RecordingResult<RecordingArtifact> {
  worker_result.map(|mut artifact| {
    artifact.overflow_count = metrics.overflow_count();
    artifact.degraded = artifact.overflow_count > 0;
    artifact
  })
}

fn resolve_stop_result(
  stop_result: std::result::Result<(), Error>,
  worker_result: RecordingResult<RecordingArtifact>,
  metrics: &RecordingQualityMetrics,
) -> RecordingResult<RecordingArtifact> {
  match finalize_worker_artifact(worker_result, metrics) {
    Ok(artifact) => Ok(artifact),
    Err(worker_error) => match stop_result {
      Ok(()) => Err(worker_error),
      Err(error) => Err(RecordingError::Teardown(error.to_string())),
    },
  }
}

fn resolve_abort_result(
  stop_result: std::result::Result<(), Error>,
  worker_result: RecordingResult<RecordingArtifact>,
) -> RecordingResult<()> {
  match worker_result {
    Ok(artifact) => {
      fs::remove_file(&artifact.filepath).ok();
      Ok(())
    }
    Err(RecordingError::Empty) => Ok(()),
    Err(worker_error) => match stop_result {
      Ok(()) => Err(worker_error),
      Err(error) => Err(RecordingError::Teardown(error.to_string())),
    },
  }
}

fn spawn_recording_controller(
  id: String,
  filepath: PathBuf,
  opts: RecordingStartOptions,
) -> (
  oneshot::Receiver<RecordingResult<u32>>,
  mpsc::UnboundedSender<ControlMessage>,
  JoinHandle<()>,
) {
  let (started_tx, started_rx) = oneshot::channel();
  let (control_tx, mut control_rx) = mpsc::unbounded_channel();

  let controller = thread::spawn(move || {
    let (tx, rx) = bounded::<Vec<f32>>(AUDIO_CHUNK_QUEUE_CAPACITY);
    let metrics = RecordingQualityMetrics::default();
    let (mut capture, capture_rate, capture_channels) = match start_capture(&opts, tx.clone(), metrics.shared_counter())
    {
      Ok(capture) => capture,
      Err(error) => {
        let _ = started_tx.send(Err(RecordingError::Start(error.to_string())));
        return;
      }
    };

    let encoding_channels = match opts.channels {
      Some(channels) => match normalize_channel_count(channels) {
        Ok(_) => channels,
        Err(error) => {
          let _ = started_tx.send(Err(error));
          return;
        }
      },
      None => {
        if capture_channels == 0 {
          let _ = started_tx.send(Err(RecordingError::InvalidChannels(capture_channels)));
          return;
        }
        if capture_channels > 1 { 2 } else { 1 }
      }
    };

    let mut audio_tx = Some(tx);
    let mut worker = Some(spawn_worker(
      id,
      filepath,
      rx,
      capture_rate,
      capture_channels,
      encoding_channels,
    ));

    if started_tx.send(Ok(encoding_channels)).is_err() {
      let _ = capture.stop();
      drop(audio_tx.take());
      if let Some(handle) = worker.take() {
        let _ = handle.join();
      }
      return;
    }

    if let Some(message) = control_rx.blocking_recv() {
      match message {
        ControlMessage::Stop { reply_tx } => {
          let stop_result = capture.stop();
          drop(audio_tx.take());
          let worker_result = match worker.take() {
            Some(handle) => match handle.join() {
              Ok(result) => result,
              Err(_) => Err(RecordingError::Join),
            },
            None => Err(RecordingError::Join),
          };
          let result = resolve_stop_result(stop_result, worker_result, &metrics);

          let _ = reply_tx.send(result);
        }
        ControlMessage::Abort { reply_tx } => {
          let stop_result = capture.stop();
          drop(audio_tx.take());
          let worker_result = match worker.take() {
            Some(handle) => match handle.join() {
              Ok(result) => result,
              Err(_) => Err(RecordingError::Join),
            },
            None => Err(RecordingError::Join),
          };
          let result = resolve_abort_result(stop_result, worker_result);

          let _ = reply_tx.send(result);
        }
      }
    }

    if let Some(handle) = worker.take() {
      let _ = capture.stop();
      drop(audio_tx.take());
      let _ = handle.join();
    }
  });

  (started_rx, control_tx, controller)
}

async fn join_controller_handle(controller: JoinHandle<()>) -> RecordingResult<()> {
  tokio::task::spawn_blocking(move || controller.join().map_err(|_| RecordingError::Join))
    .await
    .map_err(|_| RecordingError::Join)?
}

async fn cleanup_recording_controller(control_tx: &mpsc::UnboundedSender<ControlMessage>, controller: JoinHandle<()>) {
  let (reply_tx, reply_rx) = oneshot::channel();
  let _ = control_tx.send(ControlMessage::Abort { reply_tx });
  let _ = reply_rx.await;
  let _ = join_controller_handle(controller).await;
}

fn map_recording_result<T>(result: RecordingResult<T>) -> Result<T> {
  result.map_err(Into::into)
}

async fn send_control_message<T>(
  id: &str,
  message: ControlMessage,
  reply_rx: oneshot::Receiver<RecordingResult<T>>,
) -> Result<T> {
  let active_recording = take_active_recording(id).await?;

  if active_recording.control_tx.send(message).is_err() {
    let _ = join_active_recording(active_recording).await;
    return Err(RecordingError::Join.into());
  }

  let response = match reply_rx.await {
    Ok(response) => response,
    Err(_) => {
      let _ = join_active_recording(active_recording).await;
      return Err(RecordingError::Join.into());
    }
  };

  join_active_recording(active_recording).await?;
  map_recording_result(response)
}

async fn take_active_recording(id: &str) -> RecordingResult<ActiveRecording> {
  let mut active_recording = ACTIVE_RECORDING.lock().await;
  let recording = active_recording.take().ok_or(RecordingError::NotFound)?;
  if recording.id != id {
    *active_recording = Some(recording);
    return Err(RecordingError::NotFound);
  }
  Ok(recording)
}

async fn join_active_recording(mut recording: ActiveRecording) -> RecordingResult<()> {
  if let Some(handle) = recording.controller.take() {
    join_controller_handle(handle).await?;
  }
  Ok(())
}

async fn start_recording_inner(opts: RecordingStartOptions) -> Result<RecordingSessionMeta> {
  if let Some(fmt) = opts.format.as_deref()
    && !fmt.eq_ignore_ascii_case("opus")
  {
    return Err(RecordingError::InvalidFormat(fmt.to_string()).into());
  }
  if let Some(channels) = opts.channels {
    normalize_channel_count(channels)?;
  }

  let _start_lock = START_RECORDING_LOCK.lock().await;
  let output_dir = validate_output_dir(&opts.output_dir)?;
  let id = sanitize_id(opts.id.clone());

  {
    let recording = ACTIVE_RECORDING.lock().await;
    if recording.is_some() {
      return Err(RecordingError::Start("recording already active".into()).into());
    }
  }

  let filepath = output_dir.join(format!("{id}.opus"));
  if filepath.exists() {
    fs::remove_file(&filepath)?;
  }

  let (started_rx, control_tx, controller) = spawn_recording_controller(id.clone(), filepath.clone(), opts);
  let encoding_channels = match started_rx.await {
    Ok(Ok(channels)) => channels,
    Ok(Err(error)) => {
      let _ = join_controller_handle(controller).await;
      return Err(error.into());
    }
    Err(_) => {
      let _ = join_controller_handle(controller).await;
      return Err(RecordingError::Start("failed to start recording controller".into()).into());
    }
  };

  let meta = RecordingSessionMeta {
    id: id.clone(),
    filepath: filepath.to_string_lossy().to_string(),
    sample_rate: ENCODE_SAMPLE_RATE.as_i32() as u32,
    channels: encoding_channels,
    started_at: now_millis(),
  };

  let mut recording = ACTIVE_RECORDING.lock().await;

  if recording.is_some() {
    cleanup_recording_controller(&control_tx, controller).await;
    return Err(RecordingError::Start("recording already active".into()).into());
  }

  *recording = Some(ActiveRecording {
    id,
    control_tx,
    controller: Some(controller),
  });

  Ok(meta)
}

#[napi]
pub async fn start_recording(opts: RecordingStartOptions) -> Result<RecordingSessionMeta> {
  start_recording_inner(opts).await
}

async fn stop_recording_inner(id: String) -> Result<RecordingArtifact> {
  let (reply_tx, reply_rx) = oneshot::channel();
  send_control_message(&id, ControlMessage::Stop { reply_tx }, reply_rx).await
}

#[napi]
pub async fn stop_recording(id: String) -> Result<RecordingArtifact> {
  stop_recording_inner(id).await
}

async fn abort_recording_inner(id: String) -> Result<()> {
  let (reply_tx, reply_rx) = oneshot::channel();
  send_control_message(&id, ControlMessage::Abort { reply_tx }, reply_rx).await
}

#[napi]
pub async fn abort_recording(id: String) -> Result<()> {
  abort_recording_inner(id).await
}

#[cfg(test)]
mod tests {
  use std::{env, fs::File, path::PathBuf, thread};

  use napi::{Error, Status};
  use ogg::PacketReader;
  use tokio::runtime::Builder;

  use super::{
    ACTIVE_RECORDING, ActiveRecording, ControlMessage, OggOpusWriter, RecordingArtifact, RecordingError,
    RecordingQualityMetrics, START_RECORDING_LOCK, abort_recording_inner, bounded, convert_interleaved_channels, mpsc,
    resolve_abort_result, resolve_stop_result, stop_recording_inner,
  };
  use crate::audio_callback::AudioCallback;

  fn block_on<F: std::future::Future>(future: F) -> F::Output {
    Builder::new_current_thread()
      .build()
      .expect("create runtime")
      .block_on(future)
  }

  fn temp_recording_path() -> PathBuf {
    env::temp_dir().join(format!("affine-recording-test-{}.opus", rand::random::<u64>()))
  }

  #[test]
  fn finish_marks_last_audio_packet_as_end_of_stream() {
    let path = temp_recording_path();
    let samples = vec![0.0f32; 960 * 2];

    let artifact = {
      let mut writer = OggOpusWriter::new(path.clone(), 48_000, 2, 2).expect("create writer");
      writer.push_samples(&samples).expect("push samples");
      writer.finish().expect("finish writer")
    };

    assert_eq!(artifact.filepath, path.to_string_lossy());
    assert!(artifact.size > 0);
    assert_eq!(artifact.sample_rate, 48_000);
    assert_eq!(artifact.channels, 2);

    let mut reader = PacketReader::new(File::open(&path).expect("open opus file"));
    let mut packets = Vec::new();
    while let Some(packet) = reader.read_packet().expect("read packet") {
      packets.push(packet);
    }

    assert_eq!(packets.len(), 3);
    assert_eq!(&packets[0].data[..8], b"OpusHead");
    assert_eq!(&packets[1].data[..8], b"OpusTags");
    assert!(!packets[2].data.is_empty());
    assert!(packets[2].last_in_stream());

    std::fs::remove_file(path).ok();
  }

  #[test]
  fn finish_flushes_short_resampled_recordings() {
    let path = temp_recording_path();
    let samples = vec![0.25f32; 512 * 2];

    let artifact = {
      let mut writer = OggOpusWriter::new(path.clone(), 44_100, 2, 2).expect("create writer");
      writer.push_samples(&samples).expect("push samples");
      writer.finish().expect("finish writer")
    };

    assert!(artifact.size > 0);
    assert!(artifact.duration_ms > 0);

    let mut reader = PacketReader::new(File::open(&path).expect("open opus file"));
    let mut packets = Vec::new();
    while let Some(packet) = reader.read_packet().expect("read packet") {
      packets.push(packet);
    }

    assert_eq!(packets.len(), 3);
    assert!(packets[2].last_in_stream());

    std::fs::remove_file(path).ok();
  }

  #[test]
  fn converts_interleaved_channels_before_encoding() {
    assert_eq!(
      convert_interleaved_channels(&[1.0, 2.0], 1, 2).expect("mono to stereo"),
      vec![1.0, 1.0, 2.0, 2.0]
    );
    assert_eq!(
      convert_interleaved_channels(&[1.0, 3.0, 5.0, 7.0], 2, 1).expect("stereo to mono"),
      vec![2.0, 6.0]
    );
    assert_eq!(
      convert_interleaved_channels(&[1.0, 3.0, 5.0, 2.0, 4.0, 6.0], 3, 2).expect("surround to stereo"),
      vec![3.0, 3.0, 4.0, 4.0]
    );
  }

  #[test]
  fn stop_recording_clears_active_session_after_stop_error() {
    let _lock = START_RECORDING_LOCK.blocking_lock();
    let id = String::from("stop-error");
    let (control_tx, mut control_rx) = mpsc::unbounded_channel();
    let controller = thread::spawn(move || {
      let Some(ControlMessage::Stop { reply_tx }) = control_rx.blocking_recv() else {
        panic!("expected stop");
      };
      let _ = reply_tx.send(Err(RecordingError::Teardown(String::from("boom"))));
    });

    *ACTIVE_RECORDING.blocking_lock() = Some(ActiveRecording {
      id: id.clone(),
      control_tx,
      controller: Some(controller),
    });

    let error = match block_on(stop_recording_inner(id)) {
      Ok(_) => panic!("stop should fail"),
      Err(error) => error,
    };
    assert!(
      error.to_string().contains("teardown failure: boom"),
      "unexpected error: {error}"
    );
    assert!(ACTIVE_RECORDING.blocking_lock().is_none());
  }

  #[test]
  fn stop_recording_returns_artifact_and_clears_active_session() {
    let _lock = START_RECORDING_LOCK.blocking_lock();
    let id = String::from("stop-success");
    let (control_tx, mut control_rx) = mpsc::unbounded_channel();
    let controller = thread::spawn(move || {
      let Some(ControlMessage::Stop { reply_tx }) = control_rx.blocking_recv() else {
        panic!("expected stop");
      };
      let _ = reply_tx.send(Ok(RecordingArtifact {
        id: String::from("stop-success"),
        filepath: String::from("/tmp/recording.opus"),
        sample_rate: 48_000,
        channels: 2,
        duration_ms: 1_000,
        size: 128,
        degraded: true,
        overflow_count: 3,
      }));
    });

    *ACTIVE_RECORDING.blocking_lock() = Some(ActiveRecording {
      id: id.clone(),
      control_tx,
      controller: Some(controller),
    });

    let artifact = block_on(stop_recording_inner(id)).expect("stop should succeed");
    assert_eq!(artifact.filepath, "/tmp/recording.opus");
    assert!(artifact.degraded);
    assert_eq!(artifact.overflow_count, 3);
    assert!(ACTIVE_RECORDING.blocking_lock().is_none());
  }

  #[test]
  fn abort_recording_clears_active_session() {
    let _lock = START_RECORDING_LOCK.blocking_lock();
    let id = String::from("abort-success");
    let (control_tx, mut control_rx) = mpsc::unbounded_channel();
    let controller = thread::spawn(move || {
      let Some(ControlMessage::Abort { reply_tx }) = control_rx.blocking_recv() else {
        panic!("expected abort");
      };
      let _ = reply_tx.send(Ok(()));
    });

    *ACTIVE_RECORDING.blocking_lock() = Some(ActiveRecording {
      id: id.clone(),
      control_tx,
      controller: Some(controller),
    });

    block_on(abort_recording_inner(id)).expect("abort should succeed");
    assert!(ACTIVE_RECORDING.blocking_lock().is_none());
  }

  #[test]
  fn concurrent_stop_and_abort_only_allow_one_owner() {
    let _lock = START_RECORDING_LOCK.blocking_lock();
    let id = String::from("concurrent-stop-abort");
    let (control_tx, mut control_rx) = mpsc::unbounded_channel();
    let (stop_started_tx, stop_started_rx) = std::sync::mpsc::channel();
    let (finish_stop_tx, finish_stop_rx) = std::sync::mpsc::channel();
    let controller = thread::spawn(move || {
      let Some(ControlMessage::Stop { reply_tx }) = control_rx.blocking_recv() else {
        panic!("expected stop");
      };
      stop_started_tx.send(()).expect("signal stop start");
      finish_stop_rx.recv().expect("wait for stop completion");
      let _ = reply_tx.send(Ok(RecordingArtifact {
        id: String::from("concurrent-stop-abort"),
        filepath: String::from("/tmp/recording.opus"),
        sample_rate: 48_000,
        channels: 2,
        duration_ms: 1_000,
        size: 128,
        degraded: false,
        overflow_count: 0,
      }));
    });

    *ACTIVE_RECORDING.blocking_lock() = Some(ActiveRecording {
      id: id.clone(),
      control_tx,
      controller: Some(controller),
    });

    let stop_id = id.clone();
    let stop_thread = thread::spawn(move || block_on(stop_recording_inner(stop_id)));
    stop_started_rx.recv().expect("stop should own the session");

    let abort_error = block_on(abort_recording_inner(id)).expect_err("abort should lose ownership");
    assert!(
      abort_error.to_string().contains("not-found"),
      "unexpected abort error: {abort_error}"
    );

    finish_stop_tx.send(()).expect("allow stop to finish");
    let stop_result = stop_thread.join().expect("join stop thread");
    assert!(stop_result.is_ok(), "stop should win ownership");
    assert!(ACTIVE_RECORDING.blocking_lock().is_none());
  }

  #[test]
  fn queue_overflow_marks_recording_as_degraded() {
    let metrics = RecordingQualityMetrics::default();
    let (sender, receiver) = bounded(1);
    let callback = AudioCallback::Channel {
      sender,
      overflow_count: metrics.shared_counter(),
    };

    callback.call(vec![0.1, 0.2]);
    callback.call(vec![0.3, 0.4]);

    let _ = receiver.recv().expect("queued audio");
    assert_eq!(metrics.overflow_count(), 1);
  }

  #[test]
  fn stop_prefers_a_finished_artifact_over_teardown_errors() {
    let metrics = RecordingQualityMetrics::default();
    metrics.shared_counter().store(2, std::sync::atomic::Ordering::Relaxed);

    let artifact = resolve_stop_result(
      Err(Error::new(Status::GenericFailure, "pause failed")),
      Ok(RecordingArtifact {
        id: String::from("stop-success"),
        filepath: String::from("/tmp/recording.opus"),
        sample_rate: 48_000,
        channels: 2,
        duration_ms: 1_000,
        size: 128,
        degraded: false,
        overflow_count: 0,
      }),
      &metrics,
    )
    .expect("artifact should be preserved");

    assert_eq!(artifact.overflow_count, 2);
    assert!(artifact.degraded);
  }

  #[test]
  fn abort_cleans_artifacts_even_when_teardown_reports_an_error() {
    let path = temp_recording_path();
    std::fs::write(&path, b"artifact").expect("write temp artifact");

    resolve_abort_result(
      Err(Error::new(Status::GenericFailure, "pause failed")),
      Ok(RecordingArtifact {
        id: String::from("abort-success"),
        filepath: path.to_string_lossy().into_owned(),
        sample_rate: 48_000,
        channels: 2,
        duration_ms: 1_000,
        size: 8,
        degraded: false,
        overflow_count: 0,
      }),
    )
    .expect("abort should still clean up");

    assert!(!path.exists());
  }
}
