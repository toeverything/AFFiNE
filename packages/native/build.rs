extern crate napi_build;

fn main() -> Result<(), std::io::Error> {
  napi_build::setup();
  Ok(())
}
