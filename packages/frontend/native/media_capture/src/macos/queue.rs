pub(crate) fn create_audio_tap_queue() -> dispatch2::DispatchRetained<dispatch2::DispatchQueue> {
  let queue_attr = dispatch2::DispatchQueueAttr::with_qos_class(
    dispatch2::DispatchQueueAttr::SERIAL,
    dispatch2::DispatchQoS::UserInteractive,
    0,
  );
  dispatch2::DispatchQueue::new("ProcessTapRecorder", Some(&queue_attr))
}
