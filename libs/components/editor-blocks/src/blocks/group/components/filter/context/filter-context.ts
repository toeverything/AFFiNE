import { createContext } from 'react';
import type { Context } from '../types';

const FilterContext = createContext<Context>(null);

export { FilterContext };
