//! Diagnostic: dump every block in a doc (flavour + all sys:/prop: fields, shallow) so a
//! CLI-built doc can be compared field-by-field against an app-built one.
//!
//! Usage: AFFINE_DIR=<dir> cargo run -p affine-cli --example dump_blocks -- <wsid> <docid> [peer]

use affine_nbstore::pool::SqliteDocStoragePool;
use y_octo::{Any, Doc, DocOptions, Map, Value};

fn universal_id(peer: &str, id: &str) -> String {
    format!("@peer({peer});@type(workspace);@id({id});")
}

fn shallow(v: &Value) -> String {
    if let Some(a) = v.to_any() {
        match a {
            Any::String(s) => format!("{s:?}"),
            Any::Object(m) => {
                let mut ks: Vec<String> = m.keys().map(|k| k.to_string()).collect();
                ks.sort();
                format!("Object{{{}}}", ks.join(","))
            }
            other => format!("{other:?}"),
        }
    } else if let Some(t) = v.to_text() {
        format!("Y.Text({:?})", t.to_string())
    } else if let Some(m) = v.to_map() {
        let mut ks: Vec<String> = m.keys().map(|k| k.to_string()).collect();
        ks.sort();
        format!("Y.Map{{{}}}", ks.join(","))
    } else if let Some(arr) = v.to_array() {
        format!("Y.Array(len={})", arr.len())
    } else {
        "<?>".into()
    }
}

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let wsid = args.get(1).expect("wsid").clone();
    let docid = args.get(2).expect("docid").clone();
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
    let s = pool.get(uid).await.expect("store");
    let snap = s.get_doc_snapshot(docid.clone()).await.expect("snap");
    let updates = s.get_doc_updates(docid.clone()).await.expect("updates");

    let mut doc: Doc = DocOptions::new().build();
    if let Some(sn) = &snap {
        doc.apply_update_from_binary_v1(&sn.bin).expect("apply snap");
    }
    for u in &updates {
        doc.apply_update_from_binary_v1(&u.bin).expect("apply update");
    }

    let blocks: Map = match doc.get_map("blocks") {
        Ok(b) => b,
        Err(_) => {
            eprintln!("(no `blocks` map - doc has no block tree)");
            return;
        }
    };
    eprintln!("=== {} blocks ===", blocks.len());
    // Group by flavour for readability.
    let mut entries: Vec<(String, Map)> = blocks
        .iter()
        .filter_map(|(_, v)| {
            let m = v.to_map()?;
            let fl = match m.get("sys:flavour").and_then(|f| f.to_any()) {
                Some(Any::String(s)) => s,
                _ => "?".into(),
            };
            Some((fl, m))
        })
        .collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    for (fl, m) in entries {
        eprintln!("\n--- {fl} ---");
        let mut keys: Vec<String> = m.keys().map(|k| k.to_string()).collect();
        keys.sort();
        for k in keys {
            if let Some(v) = m.get(&k) {
                eprintln!("  {k} = {}", shallow(&v));
            }
        }
    }
}
