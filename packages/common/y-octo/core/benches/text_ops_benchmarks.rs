use std::time::Duration;

use criterion::{Criterion, criterion_group, criterion_main};
use rand::{Rng, SeedableRng};

fn operations(c: &mut Criterion) {
  let mut group = c.benchmark_group("ops/text");
  group.measurement_time(Duration::from_secs(15));

  group.bench_function("jwst/insert", |b| {
    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9";
    let mut rng = rand_chacha::ChaCha20Rng::seed_from_u64(1234);

    let idxs = (0..99)
      .map(|_| rng.random_range(0..base_text.len() as u64))
      .collect::<Vec<_>>();
    b.iter(|| {
      use y_octo::*;
      let doc = Doc::default();
      let mut text = doc.get_or_create_text("test").unwrap();

      text.insert(0, base_text).unwrap();
      for idx in &idxs {
        text.insert(*idx, "test").unwrap();
      }
    });
  });

  group.bench_function("jwst/remove", |b| {
    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9";

    b.iter(|| {
      use y_octo::*;
      let doc = Doc::default();
      let mut text = doc.get_or_create_text("test").unwrap();

      text.insert(0, base_text).unwrap();
      text.insert(0, base_text).unwrap();
      text.insert(0, base_text).unwrap();
      for idx in (0..base_text.len() as u64).rev() {
        text.remove(idx, 1).unwrap();
      }
    });
  });

  group.finish();
}

criterion_group!(benches, operations);
criterion_main!(benches);
