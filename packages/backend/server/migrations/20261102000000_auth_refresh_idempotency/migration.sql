-- Bind delayed retries to the operation persisted by the native client.
ALTER TABLE "auth_refresh_tokens" ADD COLUMN "refresh_request_hash" VARCHAR;
