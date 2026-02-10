use std::time::Duration;

use criterion::{Criterion, criterion_group, criterion_main};

fn operations(c: &mut Criterion) {
  let mut group = c.benchmark_group("ops/map");
  group.measurement_time(Duration::from_secs(15));

  group.bench_function("yrs/insert", |b| {
    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9"
      .split(' ')
      .collect::<Vec<_>>();

    b.iter(|| {
      use yrs::{Doc, Map, Transact};
      let doc = Doc::new();
      let map = doc.get_or_insert_map("test");

      let mut trx = doc.transact_mut();
      for (idx, key) in base_text.iter().enumerate() {
        map.insert(&mut trx, key.to_string(), idx as f64);
      }

      drop(trx);
    });
  });

  group.bench_function("yrs/get", |b| {
    use yrs::{Doc, Map, Transact};

    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9"
      .split(' ')
      .collect::<Vec<_>>();

    let doc = Doc::new();
    let map = doc.get_or_insert_map("test");

    let mut trx = doc.transact_mut();
    for (idx, key) in base_text.iter().enumerate() {
      map.insert(&mut trx, key.to_string(), idx as f64);
    }
    drop(trx);

    b.iter(|| {
      let trx = doc.transact();
      for key in &base_text {
        map.get(&trx, key).unwrap();
      }
    });
  });

  group.bench_function("yrs/remove", |b| {
    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9"
      .split(' ')
      .collect::<Vec<_>>();

    b.iter(|| {
      use yrs::{Doc, Map, Transact};
      let doc = Doc::new();
      let map = doc.get_or_insert_map("test");

      let mut trx = doc.transact_mut();
      for (idx, key) in base_text.iter().enumerate() {
        map.insert(&mut trx, key.to_string(), idx as f64);
      }

      for key in &base_text {
        map.remove(&mut trx, key).unwrap();
      }

      drop(trx);
    });
  });

  group.finish();
}

criterion_group!(benches, operations);
criterion_main!(benches);
