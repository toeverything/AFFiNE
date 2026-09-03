//! Throwaway diagnostic: dump every surface element's full field set from a stored doc.
//!
//! Usage: cargo run -p affine-cli --example dump_surface -- <wsid> <docid> [peer]
//! Reads `<data>/workspaces/<peer>/<wsid>/storage.db`, merges snapshot+updates, and prints
//! each element under affine:surface prop:elements.value with all its fields.

use affine_nbstore::pool::SqliteDocStoragePool;
use y_octo::{Any, Doc, DocOptions, Map, Value};

fn universal_id(peer: &str, id: &str) -> String {
    format!("@peer({peer});@type(workspace);@id({id});")
}

fn any_to_string(a: &Any) -> String {
    match a {
        Any::String(s) => format!("{s:?}"),
        Any::Integer(i) => format!("Int({i})"),
        Any::Float64(f) => format!("F64({})", f.into_inner()),
        Any::Float32(f) => format!("F32({})", f.into_inner()),
        Any::BigInt64(i) => format!("BigInt({i})"),
        Any::True => "true".into(),
        Any::False => "false".into(),
        Any::Null => "null".into(),
        Any::Undefined => "undefined".into(),
        Any::Object(m) => {
            let mut parts: Vec<String> = m.iter().map(|(k, v)| format!("{k}={}", any_to_string(v))).collect();
            parts.sort();
            format!("Object{{{}}}", parts.join(","))
        }
        Any::Array(arr) => {
            let parts: Vec<String> = arr.iter().map(any_to_string).collect();
            format!("[{}]", parts.join(","))
        }
        other => format!("{other:?}"),
    }
}

fn dump_value(v: &Value) -> String {
    if let Some(a) = v.to_any() {
        any_to_string(&a)
    } else if let Some(t) = v.to_text() {
        format!("Y.Text({:?})", t.to_string())
    } else if let Some(m) = v.to_map() {
        let mut parts: Vec<String> = m.iter().map(|(k, val)| format!("{k}: {}", dump_value(&val))).collect();
        parts.sort();
        format!("Y.Map{{{}}}", parts.join(", "))
    } else if let Some(arr) = v.to_array() {
        let parts: Vec<String> = arr.iter().map(|val| dump_value(&val)).collect();
        format!("Y.Array[{}]", parts.join(", "))
    } else {
        "<unknown>".into()
    }
}

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let wsid = args.get(1).expect("wsid arg").clone();
    let docid = args.get(2).expect("docid arg").clone();
    let peer = args.get(3).cloned().unwrap_or_else(|| "local".to_string());

    let base = match std::env::var("AFFINE_DIR") {
        Ok(d) => std::path::PathBuf::from(d),
        Err(_) => dirs::data_dir().unwrap().join("AFFiNE"),
    };
    let db = base.join("workspaces").join(&peer).join(&wsid).join("storage.db");
    let uid = universal_id(&peer, &wsid);

    let pool = SqliteDocStoragePool::default();
    pool.connect(uid.clone(), db.to_str().unwrap().to_string())
        .await
        .expect("connect");
    let s = pool.get(uid).await.expect("get store");

    let snapshot = s.get_doc_snapshot(docid.clone()).await.expect("snap");
    let updates = s.get_doc_updates(docid.clone()).await.expect("updates");
    eprintln!("snapshot present={} ; #updates={}", snapshot.is_some(), updates.len());

    let mut doc: Doc = DocOptions::new().build();
    if let Some(snap) = &snapshot {
        doc.apply_update_from_binary_v1(&snap.bin).expect("apply snap");
    }
    for u in &updates {
        doc.apply_update_from_binary_v1(&u.bin).expect("apply update");
    }

    let blocks: Map = doc.get_map("blocks").expect("blocks map");
    let surface = blocks
        .iter()
        .find_map(|(_, v)| {
            let m = v.to_map()?;
            match m.get("sys:flavour").and_then(|f| f.to_any()) {
                Some(Any::String(s)) if s == "affine:surface" => Some(m),
                _ => None,
            }
        })
        .expect("surface block");

    // sys:version of the surface block.
    if let Some(ver) = surface.get("sys:version").and_then(|v| v.to_any()) {
        eprintln!("affine:surface sys:version = {}", any_to_string(&ver));
    }

    let boxed = surface
        .get("prop:elements")
        .and_then(|v| v.to_map())
        .expect("prop:elements");
    eprintln!("prop:elements.type = {:?}", boxed.get("type").and_then(|v| v.to_any()));
    let value: Map = boxed.get("value").and_then(|v| v.to_map()).expect("value map");

    eprintln!("\n=== {} surface elements ===", value.len());
    let mut keys: Vec<String> = value.iter().map(|(k, _)| k.to_string()).collect();
    keys.sort();
    for (n, key) in keys.iter().enumerate() {
        let el = value.get(key).and_then(|v| v.to_map()).expect("element map");
        let etype = el
            .get("type")
            .and_then(|v| v.to_any())
            .map(|a| any_to_string(&a))
            .unwrap_or_default();
        let id = el
            .get("id")
            .and_then(|v| v.to_any())
            .map(|a| any_to_string(&a))
            .unwrap_or_default();
        eprintln!("\n[{n}] key={key:?} type={etype} id={id}");
        let mut fields: Vec<String> = el
            .iter()
            .map(|(k, val)| format!("    {k} = {}", dump_value(&val)))
            .collect();
        fields.sort();
        for f in fields {
            eprintln!("{f}");
        }
    }
}
