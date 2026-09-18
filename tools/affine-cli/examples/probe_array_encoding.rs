//! Throwaway probe: emit several candidate encodings of a 4-number array as Y.Map values,
//! so a node+real-yjs decoder can show which one round-trips as a plain JS array [x,y,w,h].
//! Writes raw encode_update_v1 bytes to the path in arg 1 (default /tmp/probe.bin).
use std::io::Write;
use y_octo::{AHashMap, Any, Array, Doc, DocOptions, HashMapExt, Map, Value};

fn main() {
    let doc: Doc = DocOptions::new().build();
    let mut m: Map = doc.get_or_create_map("m").unwrap();

    // (1) current behaviour: Any::Array of 4 floats
    m.insert(
        "broken".to_string(),
        Any::Array(vec![
            Any::Float64(10.0.into()),
            Any::Float64(20.0.into()),
            Any::Float64(30.0.into()),
            Any::Float64(40.0.into()),
        ]),
    )
    .unwrap();

    // (2) nested Y.Array of 4 floats
    {
        let arr: Array = doc.create_array().unwrap();
        m.insert("yarray".to_string(), Value::Array(arr)).unwrap();
        let mut arr = m.get("yarray").and_then(|v| v.to_array()).unwrap();
        for v in [10.0_f64, 20.0, 30.0, 40.0] {
            arr.push(Any::Float64(v.into())).unwrap();
        }
    }

    // (3) double-wrapped Any::Array (single outer value that is itself an array)
    m.insert(
        "wrapped".to_string(),
        Any::Array(vec![Any::Array(vec![
            Any::Float64(10.0.into()),
            Any::Float64(20.0.into()),
            Any::Float64(30.0.into()),
            Any::Float64(40.0.into()),
        ])]),
    )
    .unwrap();

    // (4) array nested INSIDE an Any::Object value (mirrors connector source/target.position)
    {
        let mut o = AHashMap::<String, Any>::new();
        o.insert("id".to_string(), Any::String("abc".to_string()));
        o.insert(
            "position".to_string(),
            Any::Array(vec![Any::Float64(10.0.into()), Any::Float64(20.0.into())]),
        );
        m.insert("obj_with_array".to_string(), Any::Object(Box::new(o)))
            .unwrap();
    }

    // What does y-octo's OWN reader return for each form? (Determines if a Rust test can see it.)
    for k in ["broken", "yarray", "wrapped"] {
        eprintln!("y-octo reads {k:>8} = {:?}", m.get(k).and_then(|v| v.to_any()));
    }

    let bin = doc.encode_update_v1().unwrap();
    let path = std::env::args().nth(1).unwrap_or_else(|| "/tmp/probe.bin".to_string());
    let mut f = std::fs::File::create(&path).unwrap();
    f.write_all(&bin).unwrap();
    eprintln!("wrote {} bytes to {}", bin.len(), path);
}
