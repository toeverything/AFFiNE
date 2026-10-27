LOCK TABLE embedding_sources IN SHARE ROW EXCLUSIVE MODE;

DROP INDEX embedding_projection_claim_idx;
CREATE INDEX embedding_projection_claim_idx
  ON embedding_projections (priority DESC, next_attempt_at NULLS FIRST, updated_at)
  WHERE status IN ('pending', 'retry_wait', 'running');

CREATE FUNCTION enqueue_changed_embedding_source() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE embedding_projections SET status='pending', next_attempt_at=NULL, updated_at=now()
  WHERE source_id=NEW.id AND status='ready';
  RETURN NEW;
END;
$$;

CREATE TRIGGER embedding_source_revision_changed
AFTER UPDATE OF content_revision, descriptor_revision, recipe_revision ON embedding_sources
FOR EACH ROW WHEN (
  OLD.content_revision IS DISTINCT FROM NEW.content_revision
  OR OLD.descriptor_revision IS DISTINCT FROM NEW.descriptor_revision
  OR OLD.recipe_revision IS DISTINCT FROM NEW.recipe_revision
)
EXECUTE FUNCTION enqueue_changed_embedding_source();
