use std::time::Duration;

use criterion::{Criterion, criterion_group, criterion_main};

fn operations(c: &mut Criterion) {
  let mut group = c.benchmark_group("ops/map");
  group.measurement_time(Duration::from_secs(15));

  group.bench_function("jwst/insert", |b| {
    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9"
      .split(' ')
      .collect::<Vec<_>>();

    b.iter(|| {
      use y_octo::*;
      let doc = Doc::default();
      let mut map = doc.get_or_create_map("test").unwrap();
      for (idx, key) in base_text.iter().enumerate() {
        map.insert(key.to_string(), idx).unwrap();
      }
    });
  });

  group.bench_function("jwst/get", |b| {
    use y_octo::*;

    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9"
      .split(' ')
      .collect::<Vec<_>>();
    let doc = Doc::default();
    let mut map = doc.get_or_create_map("test").unwrap();
    for (idx, key) in base_text.iter().enumerate() {
      map.insert(key.to_string(), idx).unwrap();
    }

    b.iter(|| {
      for key in &base_text {
        map.get(key);
      }
    });
  });

  group.bench_function("jwst/remove", |b| {
    let base_text = "test1 test2 test3 test4 test5 test6 test7 test8 test9"
      .split(' ')
      .collect::<Vec<_>>();

    b.iter(|| {
      use y_octo::*;
      let doc = Doc::default();
      let mut map = doc.get_or_create_map("test").unwrap();
      for (idx, key) in base_text.iter().enumerate() {
        map.insert(key.to_string(), idx).unwrap();
      }
      for key in &base_text {
        map.remove(key);
      }
    });
  });

  group.finish();
}

criterion_group!(benches, operations);
criterion_main!(benches);
