use super::*;

pub fn encode_awareness_as_message(awareness: AwarenessStates) -> JwstCodecResult<Vec<u8>> {
  let mut buffer = Vec::new();
  write_sync_message(&mut buffer, &SyncMessage::Awareness(awareness))
    .map_err(|e| JwstCodecError::InvalidWriteBuffer(e.to_string()))?;

  Ok(buffer)
}

pub fn encode_update_as_message(update: Vec<u8>) -> JwstCodecResult<Vec<u8>> {
  let mut buffer = Vec::new();
  write_sync_message(&mut buffer, &SyncMessage::Doc(DocMessage::Update(update)))
    .map_err(|e| JwstCodecError::InvalidWriteBuffer(e.to_string()))?;

  Ok(buffer)
}

pub fn merge_updates_v1<V: AsRef<[u8]>, I: IntoIterator<Item = V>>(
  updates: I,
) -> JwstCodecResult<Update> {
  let updates = updates
    .into_iter()
    .map(Update::decode_v1)
    .collect::<JwstCodecResult<Vec<_>>>()?;

  Ok(Update::merge(updates))
}
