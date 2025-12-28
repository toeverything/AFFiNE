use std::{
  fs::read,
  io::{Error, ErrorKind},
  path::PathBuf,
  time::Instant,
};

use clap::Parser;
use y_octo::Doc;

/// ybinary merger
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
  /// Path of the ybinary to read
  #[arg(short, long)]
  path: String,
}

fn load_path(path: &str) -> Result<Vec<Vec<u8>>, Error> {
  let path = PathBuf::from(path);
  if path.is_dir() {
    let mut updates = Vec::new();
    let mut paths = path
      .read_dir()?
      .filter_map(|entry| {
        let entry = entry.ok()?;
        if entry.path().is_file() {
          Some(entry.path())
        } else {
          None
        }
      })
      .collect::<Vec<_>>();
    paths.sort();

    for path in paths {
      println!("read {path:?}");
      updates.push(read(path)?);
    }
    Ok(updates)
  } else if path.is_file() {
    Ok(vec![read(path)?])
  } else {
    Err(Error::new(ErrorKind::NotFound, "not a file or directory"))
  }
}

fn main() {
  let args = Args::parse();
  jwst_merge(&args.path);
}

fn jwst_merge(path: &str) {
  let updates = load_path(path).unwrap();

  let mut doc = Doc::default();
  for (i, update) in updates.iter().enumerate() {
    println!("apply update{i} {} bytes", update.len());
    doc.apply_update_from_binary_v1(update.clone()).unwrap();
  }

  println!("press enter to continue");
  std::io::stdin().read_line(&mut String::new()).unwrap();
  let ts = Instant::now();
  let history = doc.history().parse_store(Default::default());
  println!("history: {:?}", ts.elapsed());
  for history in history.iter().take(100) {
    println!("history: {history:?}");
  }

  doc.gc().unwrap();

  let binary = {
    let binary = doc.encode_update_v1().unwrap();

    println!("merged {} bytes", binary.len());

    binary
  };

  {
    let mut doc = Doc::default();
    doc.apply_update_from_binary_v1(binary.clone()).unwrap();
    let new_binary = doc.encode_update_v1().unwrap();

    println!("re-encoded {} bytes", new_binary.len(),);
  };
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  #[ignore = "only for debug"]
  fn test_gc() {
    jwst_merge("/Users/ds/Downloads/out");
  }
}
