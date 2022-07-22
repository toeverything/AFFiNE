// import type {
//     ArrayOperation,
//     BlockClientInstance,
//     BlockImplInstance,
//     MapOperation,
// } from '@toeverything/datasource/jwt';
// import { getDateIsoStringWithTimezone } from '@toeverything/utils';

// export async function getRecentPages(
//     db: BlockClientInstance,
//     userId: string
// ): Promise<string[]> {
//     try {
//         const config = await db.getWorkspaceConfig<MapOperation<string>>();
//         const recent_pages = config.get('recent_pages');
//         if (recent_pages?.get(userId)) {
//             return [recent_pages.get(userId) as string];
//         }
//     } catch (e) {
//         console.error(e);
//     }

//     return [''];
// }

// /** Mark the article corresponding to pageId as the most recently accessed article */
// export async function setRecentPages(
//     db: BlockClientInstance,
//     userId: string,
//     pageId: string
// ): Promise<void> {
//     try {
//         const config = await db.getWorkspaceConfig<MapOperation<string>>();
//         const recent_pages = config.get('recent_pages');
//         if (recent_pages && recent_pages.get(userId)) {
//             recent_pages.set(userId, pageId);
//         } else {
//             const map = config.createMap<string>();
//             map.set(userId, pageId);
//             config.set('recent_pages', map);
//         }
//     } catch (e) {
//         console.error(e);
//     }
// }

// export async function setPageTree<TreeItem>(
//     db: BlockClientInstance,
//     treeData: TreeItem[]
// ): Promise<void> {
//     try {
//         const config = await db.getWorkspaceConfig();
//         const array = config.createArray<TreeItem>();
//         array.push((treeData as any[]) || []);
//         config.set('page_tree', array);
//     } catch (e) {
//         console.error(e);
//     }
// }

// async function update_tree_items_title<
//     TreeItem extends { id: string; title: string; children: TreeItem[] }
// >(
//     db: BlockClientInstance,
//     items: TreeItem[],
//     cache: Record<string, string>
// ): Promise<TreeItem[]> {
//     for (const item of items) {
//         if (cache[item.id]) {
//             item.title = cache[item.id];
//         } else {
//             const page = await db.get(item.id as 'page');
//             item.title =
//                 page.getDecoration<Array<{ text: string }>>('text')?.[0]
//                     ?.text ||
//                 'Untitled ' +
//                     getDateIsoStringWithTimezone(page.created)
//                         .slice(11)
//                         .replace('T', ' ');
//             cache[item.id] = item.title;
//         }

//         if (item.children.length) {
//             item.children = await update_tree_items_title(
//                 db,
//                 item.children,
//                 cache
//             );
//         }
//     }

//     return [...items];
// }

// export async function getPageTree<TreeItem>(
//     db: BlockClientInstance
// ): Promise<TreeItem[]> {
//     try {
//         const config = await db.getWorkspaceConfig();
//         const page_tree = config.get('page_tree') as ArrayOperation<TreeItem>;
//         const page_tree_items = page_tree?.slice();
//         if (page_tree && page_tree_items?.length) {
//             const pages = await update_tree_items_title(
//                 db,
//                 page_tree_items as [],
//                 {}
//             );
//             return pages;
//         }
//     } catch (e) {
//         console.error(e);
//     }

//     return [];
// }

// export async function getWorkspaceConfig(
//     db: BlockClientInstance,
//     userId: string,
//     name: string
// ): Promise<string> {
//     try {
//         // const config = await db.getWorkspaceConfig();
//         // const map = config.get_map<string>(name);
//         // if (map && map.get(userId)) {
//         //     return map.get(userId)!;
//         // }
//     } catch (e) {
//         console.error(e);
//     }

//     return '';
// }

// export async function setWorkspaceConfig(
//     db: BlockClientInstance,
//     userId: string,
//     name: string,
//     value: string
// ): Promise<void> {
//     try {
//         // const config = await db.getWorkspaceConfig();
//         // const map = config.get_map<string>(name);
//         // map.set(userId, value === undefined || value === null ? '' : value);
//     } catch (e) {
//         console.error(e);
//     }
// }

// export async function createPage(
//     db: BlockClientInstance,
//     title?: string,
//     content?: string,
//     metadata?: Record<string, string>
// ): Promise<BlockImplInstance | undefined> {
//     if (db) {
//         const page: BlockImplInstance = await db.get('page');
//         if (title) {
//             page.getContent<string>().set('title', title);
//         }
//         if (metadata) {
//             Object.keys(metadata).forEach(property =>
//                 page.getContent<string>().set(property, metadata[property])
//             );
//         }
//         return page;
//     }

//     return undefined;
// }
