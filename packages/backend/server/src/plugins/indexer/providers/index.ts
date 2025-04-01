import { ElasticsearchProvider } from './elasticsearch';
import { ManticoresearchProvider } from './manticoresearch';

export const SearchProviders = [ManticoresearchProvider, ElasticsearchProvider];

export * from './def';
export * from './elasticsearch';
export * from './manticoresearch';
