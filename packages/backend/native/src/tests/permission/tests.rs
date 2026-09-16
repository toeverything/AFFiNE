use super::*;

#[test]
fn document_identity_mapping_preserves_canonical_pair() {
  let identity = canonicalize_document_identity("other:space:doc".to_string(), Some("workspace".to_string())).unwrap();
  assert_eq!(identity.workspace_id, "workspace");
  assert_eq!(identity.doc_id, "doc");
  assert_eq!(identity.variant, "space");
  assert!(!identity.is_workspace);
}

#[test]
fn malformed_document_identity_is_rejected() {
  assert!(canonicalize_document_identity("/".to_string(), Some("".to_string())).is_err());
  assert!(canonicalize_document_identity("workspace:any:doc".to_string(), None).is_err());
}
