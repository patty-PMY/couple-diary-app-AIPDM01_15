import React from 'react';
import { useApp } from '../context/useApp';
import { LoadingState, Notice } from './Feedback';

export function SharedDataStatus() {
  const { refreshing, error, coupleId } = useApp();
  return <>
    {refreshing ? <LoadingState message="正在更新共享內容…" /> : null}
    {error ? <Notice message={error} tone="error" /> : null}
    {error && coupleId ? <Notice message="目前保留上次載入的內容，可能不是最新版本。請確認網路後重新整理。" /> : null}
  </>;
}
