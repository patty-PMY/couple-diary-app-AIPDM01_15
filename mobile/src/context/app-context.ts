import { createContext } from 'react';
import type { AppContextValue } from './AppContext';

export const AppContext = createContext<AppContextValue | null>(null);
