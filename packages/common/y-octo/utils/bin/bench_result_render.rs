use std::{
  collections::HashMap,
  io::{self, BufRead},
};

fn process_duration(duration: &str) -> Option<(f64, f64)> {
  let dur_split: Vec<String> = duration.split('±').map(String::from).collect();
  if dur_split.len() != 2 {
    return None;
  }
  let units = dur_split[1]
    .chars()
    .skip_while(|c| c.is_ascii_digit())
    .collect::<String>();
  let dur_secs = dur_split[0].parse::<f64>().ok()?;
  let error_secs = dur_split[1]
    .chars()
    .take_while(|c| c.is_ascii_digit())
    .collect::<String>()
    .parse::<f64>()
    .ok()?;
  Some((
    convert_dur_to_seconds(dur_secs, &units),
    convert_dur_to_seconds(error_secs, &units),
  ))
}

fn convert_dur_to_seconds(dur: f64, units: &str) -> f64 {
  let factors: HashMap<_, _> = [
    ("s", 1.0),
    ("ms", 1.0 / 1000.0),
    ("µs", 1.0 / 1_000_000.0),
    ("ns", 1.0 / 1_000_000_000.0),
  ]
  .iter()
  .cloned()
  .collect();
  dur * factors.get(units).unwrap_or(&1.0)
}

fn is_significant(changes_dur: f64, changes_err: f64, base_dur: f64, base_err: f64) -> bool {
  if changes_dur < base_dur {
    changes_dur + changes_err < base_dur || base_dur - base_err > changes_dur
  } else {
    changes_dur - changes_err > base_dur || base_dur + base_err < changes_dur
  }
}

fn convert_to_markdown() -> impl Iterator<Item = String> {
  #[cfg(feature = "bench")]
  let re = regex::Regex::new(r"\s{2,}").unwrap();
  io::stdin()
    .lock()
    .lines()
    .skip(2)
    .flat_map(move |row| {
      if let Ok(_row) = row {
        let columns = {
          #[cfg(feature = "bench")]
          {
            re.split(&_row).collect::<Vec<_>>()
          }
          #[cfg(not(feature = "bench"))]
          Vec::<&str>::new()
        };
        let name = columns.first()?;
        let base_duration = columns.get(2)?;
        let changes_duration = columns.get(5)?;
        Some((
          name.to_string(),
          base_duration.to_string(),
          changes_duration.to_string(),
        ))
      } else {
        None
      }
    })
    .flat_map(|(name, base_duration, changes_duration)| {
      let mut difference = "N/A".to_string();
      let base_undefined = base_duration == "?";
      let changes_undefined = changes_duration == "?";

      if !base_undefined && !changes_undefined {
        let (base_dur_secs, base_err_secs) = process_duration(&base_duration)?;
        let (changes_dur_secs, changes_err_secs) = process_duration(&changes_duration)?;

        let diff = -(1.0 - changes_dur_secs / base_dur_secs) * 100.0;
        difference = format!("{diff:+.2}%");

        if is_significant(changes_dur_secs, changes_err_secs, base_dur_secs, base_err_secs) {
          difference = format!("**{difference}**");
        }
      }

      Some(format!(
        "| {} | {} | {} | {} |",
        name.replace('|', "\\|"),
        if base_undefined { "N/A" } else { &base_duration },
        if changes_undefined { "N/A" } else { &changes_duration },
        difference
      ))
    })
}

fn main() {
  let platform = std::env::args().nth(1).expect("Missing platform argument");

  let headers = vec![
    format!("## Benchmark for {}", platform),
    "<details>".to_string(),
    "  <summary>Click to view benchmark</summary>".to_string(),
    "".to_string(),
    "| Test | Base | PR | % |".to_string(),
    "| --- | --- | --- | --- |".to_string(),
  ];

  for line in headers.into_iter().chain(convert_to_markdown()) {
    println!("{line}");
  }
  println!("</details>");
}
