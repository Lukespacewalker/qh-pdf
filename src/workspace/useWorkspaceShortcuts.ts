import { useEffect } from 'react';
import { useWorkspaceStore } from './useWorkspaceStore';

export function useWorkspaceShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handle = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.altKey || (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], dialog'))) return;
      const store = useWorkspaceStore.getState();
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === 'a') { event.preventDefault(); store.selectAll(); }
      else if (modifier && key === 'z') { event.preventDefault(); event.shiftKey ? store.redo() : store.undo(); }
      else if (modifier && key === 'y') { event.preventDefault(); store.redo(); }
      else if (!modifier && event.key === 'Escape') { store.clearSelection(); }
      else if (!modifier && (event.key === 'Delete' || event.key === 'Backspace') && store.history.present.selectedPageIds.length) {
        event.preventDefault(); store.remove();
      }
      else if (!modifier && key === 'r' && store.history.present.selectedPageIds.length) { event.preventDefault(); store.rotate(event.shiftKey ? -90 : 90); }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [enabled]);
}
