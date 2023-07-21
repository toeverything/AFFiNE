# A set of provider utilities for Yjs

## createLazyProvider

A factory function to create a lazy provider. It will not download the document from the provider until the first time a document is loaded at the parent doc.

To use it, first define a `DatasourceDocAdapter`.
Then, create a `LazyProvider` with `createLazyProvider(rootDoc, datasource)`.
