use chrono::NaiveDateTime;
use sqlx::Row;

use super::{BlobRecord, ListedBlob, SetBlob, SqliteDocStorage, millis_to_naive_utc};
use crate::error::StoreResult;

impl SqliteDocStorage {
    /// Read a non-deleted blob by key.
    pub async fn get_blob(&self, key: &str) -> StoreResult<Option<BlobRecord>> {
        let row = sqlx::query(
            "SELECT key, data, size, mime, created_at FROM blobs \
             WHERE key = ? AND deleted_at IS NULL",
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;

        row.map(|r| {
            Ok(BlobRecord {
                key: r.try_get("key")?,
                data: r.try_get("data")?,
                mime: r.try_get("mime")?,
                size: r.try_get("size")?,
                created_at: r.try_get("created_at")?,
            })
        })
        .transpose()
    }

    /// Insert or replace a blob and clear any previous soft-delete timestamp.
    pub async fn set_blob(&self, blob: SetBlob) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO blobs (key, data, mime, size) VALUES ($1, $2, $3, $4) \
             ON CONFLICT(key) DO UPDATE SET data = $2, mime = $3, size = $4, deleted_at = NULL;",
        )
        .bind(&blob.key)
        .bind(&blob.data)
        .bind(&blob.mime)
        .bind(blob.data.len() as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Soft-delete or permanently delete a blob using an explicit deterministic timestamp.
    pub async fn delete_blob(&self, key: &str, permanently: bool, now_ms: i64) -> StoreResult<()> {
        if permanently {
            sqlx::query("DELETE FROM blobs WHERE key = ?")
                .bind(key)
                .execute(&self.pool)
                .await?;
        } else {
            let deleted_at = millis_to_naive_utc(now_ms);
            sqlx::query("UPDATE blobs SET deleted_at = ? WHERE key = ?")
                .bind(deleted_at)
                .bind(key)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    /// Permanently purge all soft-deleted blobs.
    pub async fn release_blobs(&self) -> StoreResult<()> {
        sqlx::query("DELETE FROM blobs WHERE deleted_at IS NOT NULL;")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// List all non-deleted blobs ordered by `created_at DESC`.
    pub async fn list_blobs(&self) -> StoreResult<Vec<ListedBlob>> {
        let rows = sqlx::query(
            "SELECT key, size, mime, created_at FROM blobs \
             WHERE deleted_at IS NULL ORDER BY created_at DESC;",
        )
        .fetch_all(&self.pool)
        .await?;

        rows.iter()
            .map(|r| {
                Ok(ListedBlob {
                    key: r.try_get("key")?,
                    size: r.try_get("size")?,
                    mime: r.try_get("mime")?,
                    created_at: r.try_get("created_at")?,
                })
            })
            .collect()
    }

    /// Record or clear the `uploaded_at` timestamp for `(peer, blob_id)` in `peer_blob_sync`.
    pub async fn set_blob_uploaded_at(
        &self,
        peer: &str,
        blob_id: &str,
        uploaded_at: Option<NaiveDateTime>,
    ) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO peer_blob_sync (peer, blob_id, uploaded_at) VALUES ($1, $2, $3) \
             ON CONFLICT(peer, blob_id) DO UPDATE SET uploaded_at = $3;",
        )
        .bind(peer)
        .bind(blob_id)
        .bind(uploaded_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Read the `uploaded_at` timestamp for `(peer, blob_id)` from `peer_blob_sync`.
    pub async fn get_blob_uploaded_at(
        &self,
        peer: &str,
        blob_id: &str,
    ) -> StoreResult<Option<NaiveDateTime>> {
        let row =
            sqlx::query("SELECT uploaded_at FROM peer_blob_sync WHERE peer = ? AND blob_id = ?")
                .bind(peer)
                .bind(blob_id)
                .fetch_optional(&self.pool)
                .await?;

        match row {
            Some(r) => Ok(r.try_get("uploaded_at")?),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn blob_crud_soft_delete_release_and_peer_sync_clock() {
        let storage = SqliteDocStorage::new(":memory:");
        storage.connect().await.unwrap();

        storage
            .set_blob(SetBlob {
                key: "k1".into(),
                data: vec![10, 20, 30],
                mime: "image/png".into(),
            })
            .await
            .unwrap();
        storage
            .set_blob(SetBlob {
                key: "k2".into(),
                data: vec![40, 50],
                mime: "text/plain".into(),
            })
            .await
            .unwrap();

        assert_eq!(storage.list_blobs().await.unwrap().len(), 2);
        storage.delete_blob("k1", false, 1_000).await.unwrap();
        assert!(storage.get_blob("k1").await.unwrap().is_none());
        assert_eq!(storage.list_blobs().await.unwrap().len(), 1);
        storage.release_blobs().await.unwrap();

        let ts = millis_to_naive_utc(5_000);
        storage
            .set_blob_uploaded_at("cloud", "k2", Some(ts))
            .await
            .unwrap();
        assert_eq!(
            storage.get_blob_uploaded_at("cloud", "k2").await.unwrap(),
            Some(ts)
        );
        storage
            .set_blob_uploaded_at("cloud", "k2", None)
            .await
            .unwrap();
        assert_eq!(
            storage.get_blob_uploaded_at("cloud", "k2").await.unwrap(),
            None
        );
    }
}
