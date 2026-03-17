use std::{
  collections::HashMap,
  fs,
  io::{BufWriter, Write},
  path::PathBuf,
  sync::{LazyLock, Mutex},
  thread::{self, JoinHandle},
  time::{SystemTime, UNIX_EPOCH},
};

use crossbeam_channel::{Receiver, Sender, bounded};
use napi::{Error, Status, bindgen_prelude::Result};
use napi_derive::napi;
use ogg::writing::{PacketWriteEndInfo, PacketWriter};
use opus_codec::{Application, Channels, Encoder, FrameSize, SampleRate as OpusSampleRate};
use rubato::Resampler;

use crate::audio_callback::AudioCallback;
#[cfg(target_os = "macos")]
use crate::macos::screen_capture_kit::{ApplicationInfo, ShareableContent};
#[cfg(target_os = "windows")]
use crate::windows::screen_capture_kit::ShareableContent;

const ENCODE_SAMPLE_RATE: OpusSampleRate = OpusSampleRate::Hz48000;
const MAX_PACKET_SIZE: usize = 4096;
const RESAMPLER_INPUT_CHUNK: usize = 1024;

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
}

#[derive(Debug, thiserror::Error)]
enum RecordingError {
  #[error("unsupported platform")]
  UnsupportedPlatform,
  #[error("invalid output directory")]
  InvalidOutputDir,
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
  #[error("join failure")]
  Join,
}

impl RecordingError {
  fn code(&self) -> &'static str {
    match self {
      RecordingError::UnsupportedPlatform => "unsupported-platform",
      RecordingError::InvalidOutputDir => "invalid-output-dir",
      RecordingError::InvalidFormat(_) => "invalid-format",
      RecordingError::Io(_) => "io-error",
      RecordingError::Encoding(_) => "encoding-error",
      RecordingError::NotFound => "not-found",
      RecordingError::Empty => "empty-recording",
      RecordingError::Start(_) => "start-failure",
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

  fn feed(&mut self, interleaved: &[f32]) -> Vec<f32> {
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

      if let Ok(blocks) = self.resampler.process(&chunk, None) {
        if blocks.is_empty() || blocks.len() != self.channels {
          continue;
        }
        if !self.warmed {
          self.warmed = true;
          continue;
        }
        let out_len = blocks[0].len();
        for i in 0..out_len {
          for channel in blocks.iter().take(self.channels) {
            out.push(channel[i]);
          }
        }
      }
    }

    out
  }
}

struct OggOpusWriter {
  writer: PacketWriter<'static, BufWriter<fs::File>>,
  encoder: Encoder,
  frame_samples: usize,
  pending: Vec<f32>,
  granule_position: u64,
  samples_written: u64,
  channels: Channels,
  sample_rate: OpusSampleRate,
  resampler: Option<InterleavedResampler>,
  filepath: PathBuf,
  stream_serial: u32,
}

impl OggOpusWriter {
  fn new(filepath: PathBuf, source_sample_rate: u32, channels: u32) -> RecordingResult<Self> {
    let channels = if channels > 1 { Channels::Stereo } else { Channels::Mono };

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
      granule_position: u64::from(pre_skip),
      samples_written: 0,
      channels,
      sample_rate,
      resampler,
      filepath,
      stream_serial,
    })
  }

  fn push_samples(&mut self, samples: &[f32]) -> RecordingResult<()> {
    let mut processed = if let Some(resampler) = &mut self.resampler {
      resampler.feed(samples)
    } else {
      samples.to_vec()
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

    self
      .writer
      .write_packet(packet, self.stream_serial, end, self.granule_position)
      .map_err(|e| RecordingError::Encoding(format!("failed to write packet: {e}")))?;

    Ok(())
  }

  fn finish(mut self) -> RecordingResult<RecordingArtifact> {
    let frame_len = self.frame_samples * self.channels.as_usize();
    if !self.pending.is_empty() {
      let mut frame = self.pending.clone();
      let samples_in_frame = frame.len() / self.channels.as_usize();
      frame.resize(frame_len, 0.0);
      self.encode_frame(frame, samples_in_frame, PacketWriteEndInfo::NormalPacket)?;
      self.pending.clear();
    }

    // Mark end of stream with an empty packet if nothing was written, otherwise
    // flag the last packet as end of stream.
    if self.samples_written == 0 {
      fs::remove_file(&self.filepath).ok();
      return Err(RecordingError::Empty);
    }

    // Flush a final end-of-stream marker.
    self
      .writer
      .write_packet(
        Vec::<u8>::new(),
        self.stream_serial,
        PacketWriteEndInfo::EndStream,
        self.granule_position,
      )
      .map_err(|e| RecordingError::Encoding(format!("failed to finish stream: {e}")))?;

    let _ = self.writer.inner_mut().flush();

    let size = fs::metadata(&self.filepath)?.len() as i64;
    let duration_ms = (self.samples_written * 1000) as i64 / self.sample_rate.as_i32() as i64;

    Ok(RecordingArtifact {
      id: String::new(),
      filepath: self.filepath.to_string_lossy().to_string(),
      sample_rate: self.sample_rate.as_i32() as u32,
      channels: self.channels.as_usize() as u32,
      duration_ms,
      size,
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

unsafe impl Send for PlatformCapture {}

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

struct ActiveRecording {
  sender: Option<Sender<Vec<f32>>>,
  capture: PlatformCapture,
  worker: Option<JoinHandle<std::result::Result<RecordingArtifact, RecordingError>>>,
}

static ACTIVE_RECORDINGS: LazyLock<Mutex<HashMap<String, ActiveRecording>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));
static START_RECORDING_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

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

fn start_capture(opts: &RecordingStartOptions, tx: Sender<Vec<f32>>) -> Result<(PlatformCapture, u32, u32)> {
  #[cfg(target_os = "macos")]
  {
    let callback = AudioCallback::Channel(tx);
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
    let callback = AudioCallback::Channel(tx);
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
    Err(RecordingError::UnsupportedPlatform.into())
  }
}

fn spawn_worker(
  id: String,
  filepath: PathBuf,
  rx: Receiver<Vec<f32>>,
  source_sample_rate: u32,
  channels: u32,
) -> JoinHandle<std::result::Result<RecordingArtifact, RecordingError>> {
  thread::spawn(move || {
    let mut writer = OggOpusWriter::new(filepath.clone(), source_sample_rate, channels)?;
    for chunk in rx {
      writer.push_samples(&chunk)?;
    }
    let mut artifact = writer.finish()?;
    artifact.id = id;
    Ok(artifact)
  })
}

#[napi]
pub fn start_recording(opts: RecordingStartOptions) -> Result<RecordingSessionMeta> {
  if let Some(fmt) = opts.format.as_deref()
    && !fmt.eq_ignore_ascii_case("opus")
  {
    return Err(RecordingError::InvalidFormat(fmt.to_string()).into());
  }

  let _start_lock = START_RECORDING_LOCK
    .lock()
    .map_err(|_| RecordingError::Start("lock poisoned".into()))?;
  let output_dir = validate_output_dir(&opts.output_dir)?;
  let id = sanitize_id(opts.id.clone());

  {
    let recordings = ACTIVE_RECORDINGS
      .lock()
      .map_err(|_| RecordingError::Start("lock poisoned".into()))?;

    if recordings.contains_key(&id) {
      return Err(RecordingError::Start("duplicate recording id".into()).into());
    }
  }

  let filepath = output_dir.join(format!("{id}.opus"));
  if filepath.exists() {
    fs::remove_file(&filepath)?;
  }

  let (tx, rx) = bounded::<Vec<f32>>(32);
  let (capture, capture_rate, capture_channels) =
    start_capture(&opts, tx.clone()).map_err(|e| RecordingError::Start(e.to_string()))?;

  let encoding_channels = match opts.channels {
    Some(1) => 1,
    Some(2) => 2,
    _ => capture_channels,
  };

  let worker = spawn_worker(id.clone(), filepath.clone(), rx, capture_rate, encoding_channels);

  let meta = RecordingSessionMeta {
    id: id.clone(),
    filepath: filepath.to_string_lossy().to_string(),
    sample_rate: ENCODE_SAMPLE_RATE.as_i32() as u32,
    channels: encoding_channels,
    started_at: now_millis(),
  };

  let mut recordings = ACTIVE_RECORDINGS
    .lock()
    .map_err(|_| RecordingError::Start("lock poisoned".into()))?;

  recordings.insert(
    id,
    ActiveRecording {
      sender: Some(tx),
      capture,
      worker: Some(worker),
    },
  );

  Ok(meta)
}

#[napi]
pub fn stop_recording(id: String) -> Result<RecordingArtifact> {
  let mut recordings = ACTIVE_RECORDINGS
    .lock()
    .map_err(|_| RecordingError::Start("lock poisoned".into()))?;

  let mut entry = recordings.remove(&id).ok_or(RecordingError::NotFound)?;

  entry.capture.stop().map_err(|e| RecordingError::Start(e.to_string()))?;

  drop(entry.sender.take());

  let handle = entry.worker.take().ok_or(RecordingError::Join)?;
  let artifact = handle.join().map_err(|_| RecordingError::Join)??;

  Ok(artifact)
}
