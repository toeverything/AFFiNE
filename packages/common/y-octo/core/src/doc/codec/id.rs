use std::{
  fmt::Display,
  hash::Hash,
  ops::{Add, Sub},
};

pub type Client = u64;
pub type Clock = u64;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
#[cfg_attr(fuzzing, derive(arbitrary::Arbitrary))]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub struct Id {
  pub client: Client,
  pub clock: Clock,
}

impl Id {
  pub fn new(client: Client, clock: Clock) -> Self {
    Self { client, clock }
  }
}

impl From<(Client, Clock)> for Id {
  fn from((client, clock): (Client, Clock)) -> Self {
    Id::new(client, clock)
  }
}

impl Sub<Clock> for Id {
  type Output = Id;

  fn sub(self, rhs: Clock) -> Self::Output {
    (self.client, self.clock - rhs).into()
  }
}

impl Add<Clock> for Id {
  type Output = Id;

  fn add(self, rhs: Clock) -> Self::Output {
    (self.client, self.clock + rhs).into()
  }
}

impl Display for Id {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "({}, {})", self.client, self.clock)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn basic_id_operation() {
    let id_with_different_client_1 = Id::new(1, 1);
    let id_with_different_client_2 = Id::new(2, 1);

    assert_ne!(id_with_different_client_1, id_with_different_client_2);
    assert_eq!(Id::new(1, 1), Id::new(1, 1));

    let clock = 2;
    assert_eq!(Id::new(1, 1) + clock, (1, 3).into());
    assert_eq!(Id::new(1, 3) - clock, (1, 1).into());
  }
}
