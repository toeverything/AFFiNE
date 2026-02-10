use std::time::Duration;

use criterion::{Criterion, criterion_group, criterion_main};
use rand::{Rng, SeedableRng};

fn operations(c: &mut Criterion) {
  let mut group = c.benchmark_group("ops/array");
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
      let mut array = doc.get_or_create_array("test").unwrap();
      for c in base_text.chars() {
        array.push(c.to_string()).unwrap();
      }
      for idx in &idxs {
        array.insert(*idx, "test").unwrap();
      }
    });
  });

  group.bench_function("jwst/insert range", |b| {
    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9";
    let mut rng = rand_chacha::ChaCha20Rng::seed_from_u64(1234);

    let idxs = (0..99)
      .map(|_| rng.random_range(0..base_text.len() as u64))
      .collect::<Vec<_>>();
    b.iter(|| {
      use y_octo::*;
      let doc = Doc::default();
      let mut array = doc.get_or_create_array("test").unwrap();
      for c in base_text.chars() {
        array.push(c.to_string()).unwrap();
      }
      for idx in &idxs {
        array.insert(*idx, "test1").unwrap();
        array.insert(idx + 1, "test2").unwrap();
      }
    });
  });

  group.bench_function("jwst/remove", |b| {
    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9";

    b.iter(|| {
      use y_octo::*;
      let doc = Doc::default();
      let mut array = doc.get_or_create_array("test").unwrap();
      for c in base_text.chars() {
        array.push(c.to_string()).unwrap();
      }
      for idx in (0..base_text.len() as u64).rev() {
        array.remove(idx, 1).unwrap();
      }
    });
  });

  group.finish();
}

criterion_group!(benches, operations);
criterion_main!(benches);
