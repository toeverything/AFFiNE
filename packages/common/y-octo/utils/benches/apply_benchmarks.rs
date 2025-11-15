mod utils;

use std::time::Duration;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use path_ext::PathExt;
use utils::Files;

fn apply(c: &mut Criterion) {
  let files = Files::load();

  let mut group = c.benchmark_group("apply");
  group.measurement_time(Duration::from_secs(15));

  for file in &files.files {
    group.throughput(Throughput::Bytes(file.content.len() as u64));
    group.bench_with_input(
      BenchmarkId::new("apply with yrs", file.path.name_str()),
      &file.content,
      |b, content| {
        b.iter(|| {
          use yrs::{updates::decoder::Decode, Doc, Transact, Update};
          let update = Update::decode_v1(content).unwrap();
          let doc = Doc::new();
          doc.transact_mut().apply_update(update).unwrap();
        });
      },
    );
  }

  group.finish();
}

criterion_group!(benches, apply);
criterion_main!(benches);
