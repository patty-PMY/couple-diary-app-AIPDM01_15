import { useContext } from 'react';
import { AppContext } from './app-context';

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp 必須在 AppProvider 內使用');
  return context;
}
