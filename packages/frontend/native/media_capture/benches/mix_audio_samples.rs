#[cfg(target_os = "macos")]
use std::hint::black_box;

#[cfg(target_os = "macos")]
use affine_media_capture::macos::audio_buffer::{mix_audio_samples, mix_audio_samples_scalar};
#[cfg(target_os = "macos")]
use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};

#[cfg(target_os = "macos")]
fn generate_test_samples() -> [f32; 1024] {
  let mut samples = [0.0; 1024];

  // Generate a simple sine wave with some variation
  for (i, sample) in samples.iter_mut().enumerate() {
    let t = i as f32 / 1024.0;
    // Create a complex waveform with multiple frequencies
    let value = 0.008 * (2.0 * std::f32::consts::PI * t * 5.0).sin()
      + 0.004 * (2.0 * std::f32::consts::PI * t * 10.0).cos()
      + 0.002 * (2.0 * std::f32::consts::PI * t * 20.0).sin();
    *sample = value;
  }

  samples
}

#[cfg(target_os = "macos")]
fn bench_audio_mix(c: &mut Criterion) {
  let mut group = c.benchmark_group("audio mix");

  let input = generate_test_samples();
  let output = generate_test_samples();

  group.bench_function(BenchmarkId::from_parameter("simd"), |b| {
    b.iter(|| {
      let mixed = mix_audio_samples(&input, &output);
      black_box(mixed);
    });
  });

  group.bench_function(BenchmarkId::from_parameter("scalar"), |b| {
    b.iter(|| {
      let mut mixed = vec![0.0; 1024];
      mix_audio_samples_scalar(&input, &output, &mut mixed, 0, input.len());
      black_box(mixed);
    });
  });
}

#[cfg(target_os = "macos")]
criterion_group!(benches, bench_audio_mix);
#[cfg(target_os = "macos")]
criterion_main!(benches);

#[cfg(not(target_os = "macos"))]
fn main() {}
