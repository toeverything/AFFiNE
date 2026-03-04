use criterion::{Criterion, SamplingMode, criterion_group, criterion_main};
use lib0::{
  decoding::{Cursor, Read},
  encoding::Write,
};

const BENCHMARK_SIZE: u32 = 100000;

fn codec(c: &mut Criterion) {
  let mut codec_group = c.benchmark_group("codec");
  codec_group.sampling_mode(SamplingMode::Flat);
  {
    codec_group.bench_function("lib0 encode var_int (64 bit)", |b| {
      b.iter(|| {
        let mut encoder = Vec::with_capacity(BENCHMARK_SIZE as usize * 8);
        for i in 0..(BENCHMARK_SIZE as i64) {
          encoder.write_var(i);
        }
      })
    });
    codec_group.bench_function("lib0 decode var_int (64 bit)", |b| {
      let mut encoder = Vec::with_capacity(BENCHMARK_SIZE as usize * 8);
      for i in 0..(BENCHMARK_SIZE as i64) {
        encoder.write_var(i);
      }

      b.iter(|| {
        let mut decoder = Cursor::from(&encoder);
        for i in 0..(BENCHMARK_SIZE as i64) {
          let num: i64 = decoder.read_var().unwrap();
          assert_eq!(num, i);
        }
      })
    });
  }

  {
    codec_group.bench_function("lib0 encode var_uint (32 bit)", |b| {
      b.iter(|| {
        let mut encoder = Vec::with_capacity(BENCHMARK_SIZE as usize * 8);
        for i in 0..BENCHMARK_SIZE {
          encoder.write_var(i);
        }
      })
    });
    codec_group.bench_function("lib0 decode var_uint (32 bit)", |b| {
      let mut encoder = Vec::with_capacity(BENCHMARK_SIZE as usize * 8);
      for i in 0..BENCHMARK_SIZE {
        encoder.write_var(i);
      }

      b.iter(|| {
        let mut decoder = Cursor::from(&encoder);
        for i in 0..BENCHMARK_SIZE {
          let num: u32 = decoder.read_var().unwrap();
          assert_eq!(num, i);
        }
      })
    });
  }

  {
    codec_group.bench_function("lib0 encode var_uint (64 bit)", |b| {
      b.iter(|| {
        let mut encoder = Vec::with_capacity(BENCHMARK_SIZE as usize * 8);
        for i in 0..(BENCHMARK_SIZE as u64) {
          encoder.write_var(i);
        }
      })
    });
    codec_group.bench_function("lib0 decode var_uint (64 bit)", |b| {
      let mut encoder = Vec::with_capacity(BENCHMARK_SIZE as usize * 8);
      for i in 0..(BENCHMARK_SIZE as u64) {
        encoder.write_var(i);
      }

      b.iter(|| {
        let mut decoder = Cursor::from(&encoder);
        for i in 0..(BENCHMARK_SIZE as u64) {
          let num: u64 = decoder.read_var().unwrap();
          assert_eq!(num, i);
        }
      })
    });
  }
}

criterion_group!(benches, codec);
criterion_main!(benches);
