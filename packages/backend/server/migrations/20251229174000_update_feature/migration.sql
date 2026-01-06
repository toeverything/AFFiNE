/*
  Preserve backward compatibility between beta and stable deployments that share a database.
  Newer code no longer writes feature_id, so we keep the legacy columns/table and backfill
  them via triggers instead of dropping them.
*/

-- Ensure a feature row exists and return its id
CREATE OR REPLACE FUNCTION ensure_feature_exists(feature_name TEXT) RETURNS INTEGER AS $$
DECLARE
  feature_record INTEGER;
BEGIN
  SELECT id INTO feature_record FROM "features" WHERE "feature" = feature_name ORDER BY "version" DESC LIMIT 1;

  IF feature_record IS NULL THEN
    INSERT INTO "features" ("feature", "configs")
    VALUES (feature_name, '{}')
    ON CONFLICT ("feature", "version") DO NOTHING
    RETURNING id INTO feature_record;

    IF feature_record IS NULL THEN
      SELECT id INTO feature_record FROM "features" WHERE "feature" = feature_name ORDER BY "version" DESC LIMIT 1;
    END IF;
  END IF;

  RETURN feature_record;
END;
$$ LANGUAGE plpgsql;

-- Fill user_features.feature_id when omitted by newer code
CREATE OR REPLACE FUNCTION set_user_feature_id_from_name() RETURNS trigger AS $$
BEGIN
  IF NEW.feature_id IS NULL THEN
    NEW.feature_id := ensure_feature_exists(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_features_set_feature_id ON "user_features";
CREATE TRIGGER user_features_set_feature_id
BEFORE INSERT OR UPDATE ON "user_features"
FOR EACH ROW EXECUTE FUNCTION set_user_feature_id_from_name();

-- Fill workspace_features.feature_id when omitted by newer code
CREATE OR REPLACE FUNCTION set_workspace_feature_id_from_name() RETURNS trigger AS $$
BEGIN
  IF NEW.feature_id IS NULL THEN
    NEW.feature_id := ensure_feature_exists(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workspace_features_set_feature_id ON "workspace_features";
CREATE TRIGGER workspace_features_set_feature_id
BEFORE INSERT OR UPDATE ON "workspace_features"
FOR EACH ROW EXECUTE FUNCTION set_workspace_feature_id_from_name();
