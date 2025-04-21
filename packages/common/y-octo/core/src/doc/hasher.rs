use std::{
  collections::HashMap,
  hash::{BuildHasher, Hasher},
};

use super::Client;

#[derive(Default)]
pub struct ClientHasher(Client);

impl Hasher for ClientHasher {
  fn finish(&self) -> u64 {
    self.0
  }

  fn write(&mut self, _: &[u8]) {}

  fn write_u64(&mut self, i: u64) {
    self.0 = i
  }
}

#[derive(Default, Clone)]
pub struct ClientHasherBuilder;

impl BuildHasher for ClientHasherBuilder {
  type Hasher = ClientHasher;

  fn build_hasher(&self) -> Self::Hasher {
    ClientHasher::default()
  }
}

// use ClientID as key
pub type ClientMap<V> = HashMap<Client, V, ClientHasherBuilder>;
