// 页面是否在前台可见（document.visibilityState）

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function getSnapshot(): boolean {
  return document.visibilityState !== 'hidden';
}

export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
