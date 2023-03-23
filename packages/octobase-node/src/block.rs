use super::DynamicValue;
use jwst::{Block as JwstBlock, Workspace};
use lib0::any::Any;

#[napi()]
pub struct Block {
    pub workspace: Workspace,
    pub block: JwstBlock,
}

#[napi()]
impl Block {
    #[napi(constructor)]
    pub fn new(workspace: Workspace, block: JwstBlock) -> Self {
        Self { workspace, block }
    }

    #[napi]
    pub fn get(&self, key: String) -> Option<DynamicValue> {
        self.workspace
            .with_trx(|trx| self.block.get(&trx.trx, &key).map(DynamicValue::new))
    }

    #[napi]
    pub fn children(&self) -> Vec<String> {
        self.workspace.with_trx(|trx| self.block.children(&trx.trx))
    }

    #[napi]
    pub fn push_children(&self, block: &Block) {
        self.workspace
            .with_trx(|mut trx| self.block.push_children(&mut trx.trx, &block.block));
    }

    #[napi]
    pub fn insert_children_at(&self, block: &Block, pos: u32) {
        self.workspace.with_trx(|mut trx| {
            self.block
                .insert_children_at(&mut trx.trx, &block.block, pos)
        });
    }

    #[napi]
    pub fn insert_children_before(&self, block: &Block, reference: &str) {
        self.workspace.with_trx(|mut trx| {
            self.block
                .insert_children_before(&mut trx.trx, &block.block, reference)
        });
    }

    #[napi]
    pub fn insert_children_after(&self, block: &Block, reference: &str) {
        self.workspace.with_trx(|mut trx| {
            self.block
                .insert_children_after(&mut trx.trx, &block.block, reference)
        });
    }

    #[napi]
    pub fn remove_children(&self, block: &Block) {
        self.workspace
            .with_trx(|mut trx| self.block.remove_children(&mut trx.trx, &block.block));
    }

    #[napi]
    pub fn exists_children(&self, block_id: &str) -> i32 {
        self.workspace
            .with_trx(|trx| self.block.exists_children(&trx.trx, block_id))
            .map(|i| i as i32)
            .unwrap_or(-1)
    }

    #[napi]
    pub fn parent(&self) -> String {
        self.workspace
            .with_trx(|trx| self.block.parent(&trx.trx).unwrap())
    }

    #[napi]
    pub fn updated(&self) -> u64 {
        self.workspace.with_trx(|trx| self.block.updated(&trx.trx))
    }

    #[napi]
    pub fn id(&self) -> String {
        self.block.block_id()
    }

    #[napi]
    pub fn flavor(&self) -> String {
        self.workspace.with_trx(|trx| self.block.flavor(&trx.trx))
    }

    #[napi]
    pub fn version(&self) -> String {
        self.workspace.with_trx(|trx| {
            let [major, minor] = self.block.version(&trx.trx);
            format!("{major}.{minor}")
        })
    }

    #[napi]
    pub fn created(&self) -> u64 {
        self.workspace.with_trx(|trx| self.block.created(&trx.trx))
    }

    #[napi]
    pub fn set_bool(&self, key: String, value: bool) {
        self.workspace
            .with_trx(|mut trx| self.block.set(&mut trx.trx, &key, value));
    }

    #[napi]
    pub fn set_string(&self, key: String, value: String) {
        self.workspace
            .with_trx(|mut trx| self.block.set(&mut trx.trx, &key, value));
    }

    #[napi]
    pub fn set_float(&self, key: String, value: f64) {
        self.workspace
            .with_trx(|mut trx| self.block.set(&mut trx.trx, &key, value));
    }

    #[napi]
    pub fn set_integer(&self, key: String, value: i64) {
        self.workspace
            .with_trx(|mut trx| self.block.set(&mut trx.trx, &key, value));
    }

    #[napi]
    pub fn set_null(&self, key: String) {
        self.workspace
            .with_trx(|mut trx| self.block.set(&mut trx.trx, &key, Any::Null));
    }

    #[napi]
    pub fn is_bool(&self, key: String) -> bool {
        self.workspace.with_trx(|trx| {
            self.block
                .get(&trx.trx, &key)
                .map(|a| matches!(a, Any::Bool(_)))
                .unwrap_or(false)
        })
    }

    #[napi]
    pub fn is_string(&self, key: String) -> bool {
        self.workspace.with_trx(|trx| {
            self.block
                .get(&trx.trx, &key)
                .map(|a| matches!(a, Any::String(_)))
                .unwrap_or(false)
        })
    }

    #[napi]
    pub fn is_float(&self, key: String) -> bool {
        self.workspace.with_trx(|trx| {
            self.block
                .get(&trx.trx, &key)
                .map(|a| matches!(a, Any::Number(_)))
                .unwrap_or(false)
        })
    }

    #[napi]
    pub fn is_integer(&self, key: String) -> bool {
        self.workspace.with_trx(|trx| {
            self.block
                .get(&trx.trx, &key)
                .map(|a| matches!(a, Any::BigInt(_)))
                .unwrap_or(false)
        })
    }

    #[napi]
    pub fn get_bool(&self, key: String) -> Option<i64> {
        self.workspace.with_trx(|trx| {
            self.block.get(&trx.trx, &key).and_then(|a| match a {
                Any::Bool(i) => Some(i.into()),
                _ => None,
            })
        })
    }

    #[napi]
    pub fn get_string(&self, key: String) -> Option<String> {
        self.workspace.with_trx(|trx| {
            self.block.get(&trx.trx, &key).and_then(|a| match a {
                Any::String(i) => Some(i.into()),
                _ => None,
            })
        })
    }

    #[napi]
    pub fn get_float(&self, key: String) -> Option<f64> {
        self.workspace.with_trx(|trx| {
            self.block.get(&trx.trx, &key).and_then(|a| match a {
                Any::Number(i) => Some(i),
                _ => None,
            })
        })
    }

    #[napi]
    pub fn get_integer(&self, key: String) -> Option<i64> {
        self.workspace.with_trx(|trx| {
            self.block.get(&trx.trx, &key).and_then(|a| match a {
                Any::BigInt(i) => Some(i),
                _ => None,
            })
        })
    }
}
