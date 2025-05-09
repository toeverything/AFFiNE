use std::hint::black_box;

use affine_common::hashcash::Stamp;
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};

fn bench_hashcash(c: &mut Criterion) {
  let mut group = c.benchmark_group("hashcash");

  group.bench_function(BenchmarkId::from_parameter("Generate"), |b| {
    b.iter(|| {
      black_box(Stamp::mint("test".to_string(), Some(20)).format());
    });
  });

  group.bench_function(BenchmarkId::from_parameter("Verify"), |b| {
    b.iter(|| {
      black_box(
        Stamp::try_from("1:20:20241114061212:test::RsRAAkoxjr4FattQ:292f0d")
          .unwrap()
          .check(20, "test"),
      );
    });
  });
}

criterion_group!(benches, bench_hashcash);
criterion_main!(benches);
