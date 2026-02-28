use std::convert::TryFrom;

use affine_common::hashcash::Stamp;
use napi::{bindgen_prelude::AsyncTask, Env, Result, Task};
use napi_derive::napi;

pub struct AsyncVerifyChallengeResponse {
  response: String,
  bits: u32,
  resource: String,
}

#[napi]
impl Task for AsyncVerifyChallengeResponse {
  type Output = bool;
  type JsValue = bool;

  fn compute(&mut self) -> Result<Self::Output> {
    Ok(if let Ok(stamp) = Stamp::try_from(self.response.as_str()) {
      stamp.check(self.bits, &self.resource)
    } else {
      false
    })
  }

  fn resolve(&mut self, _: Env, output: bool) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi]
pub fn verify_challenge_response(
  response: String,
  bits: u32,
  resource: String,
) -> AsyncTask<AsyncVerifyChallengeResponse> {
  AsyncTask::new(AsyncVerifyChallengeResponse {
    response,
    bits,
    resource,
  })
}

pub struct AsyncMintChallengeResponse {
  bits: Option<u32>,
  resource: String,
}

#[napi]
impl Task for AsyncMintChallengeResponse {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    Ok(Stamp::mint(self.resource.clone(), self.bits).format())
  }

  fn resolve(&mut self, _: Env, output: String) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi]
pub fn mint_challenge_response(
  resource: String,
  bits: Option<u32>,
) -> AsyncTask<AsyncMintChallengeResponse> {
  AsyncTask::new(AsyncMintChallengeResponse { bits, resource })
}
