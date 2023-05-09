// use super::Block;
use jwst::Workspace as JwstWorkspace;
use yrs::UpdateSubscription;


#[napi()]
pub struct Workspace {
    pub(crate) workspace: JwstWorkspace,
    pub(crate) _sub: Option<UpdateSubscription>,
}

#[napi()]
impl Workspace {
    #[napi(constructor)]
    pub fn new(id: String) -> Self {
        Self {
            workspace: JwstWorkspace::new(id),
            _sub: None,
        }
    }

    #[napi]
    pub fn id(&self) -> String {
        self.workspace.id()
    }

    #[napi]
    pub fn client_id(&self) -> i64 {
        self.workspace.client_id() as i64
    }

    // #[napi]
    // pub fn get(&self, block_id: String) -> Option<Block> {
    //     let workspace = self.workspace.clone();
    //     self.workspace.with_trx(|mut trx| {
    //         let block = trx
    //             .get_blocks()
    //             .get(&trx.trx, &block_id)
    //             .map(|b| Block::new(workspace, b));
    //         drop(trx);
    //         block
    //     })
    // }

    // #[napi]
    // pub fn create(&self, block_id: String, flavor: String) -> Block {
    //     let workspace = self.workspace.clone();
    //     self.workspace.with_trx(|mut trx| {
    //         let block = Block::new(
    //             workspace,
    //             trx.get_blocks().create(&mut trx.trx, block_id, flavor),
    //         );
    //         drop(trx);
    //         block
    //     })
    // }

    #[napi]
    pub fn search(&self, query: String) -> String {
        self.workspace.search_result(query)
    }

    // #[napi]
    // pub fn get_blocks_by_flavour(&self, flavour: &str) -> Vec<Block> {
    //     self.workspace
    //         .with_trx(|mut trx| trx.get_blocks().get_blocks_by_flavour(&trx.trx, flavour))
    //         .iter()
    //         .map(|block| Block {
    //             workspace: self.workspace.clone(),
    //             block: block.clone(),
    //         })
    //         .collect()
    // }

    #[napi]
    pub fn get_search_index(&self) -> Vec<String> {
        self.workspace.metadata().search_index
    }

    #[napi]
    pub fn set_search_index(&self, fields: Vec<String>) -> bool {
        self.workspace.set_search_index(fields)
    }
}
