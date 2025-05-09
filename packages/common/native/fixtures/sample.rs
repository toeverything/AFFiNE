fn factorial(n: u64) -> u64 {
  if n == 0 {
    return 1;
  }
  n * factorial(n - 1)
}

fn main() {
  println!("Hello, world!");
}
