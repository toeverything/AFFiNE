BEGIN;
SET LOCAL lock_timeout = '5s';

-- Snapshot writers hold row and search generation locks until their client ends the transaction.
CREATE FUNCTION bound_snapshot_transaction_idle_time() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  idle_limit interval := current_setting('idle_in_transaction_session_timeout')::interval;
BEGIN
  IF idle_limit = interval '0' OR idle_limit > interval '1 minute' THEN
    PERFORM set_config('idle_in_transaction_session_timeout', '60s', true);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER bound_snapshot_transaction_idle_time
BEFORE INSERT OR UPDATE OR DELETE ON snapshots
FOR EACH STATEMENT EXECUTE FUNCTION bound_snapshot_transaction_idle_time();

COMMIT;
