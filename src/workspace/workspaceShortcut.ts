type Shortcut = 'undo' | 'redo' | 'selectAll' | 'deselectAll' | 'duplicate' | 'remove' | 'save';
type Key = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing'>;
interface Context { locked: boolean; modal: boolean; editable: boolean; pages: number; selected: number; canUndo: boolean; canRedo: boolean }

export function workspaceShortcut(event: Key, context: Context): Shortcut | null {
  if (context.locked || context.modal || context.editable || event.isComposing || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') return event.shiftKey ? context.canRedo ? 'redo' : null : context.canUndo ? 'undo' : null;
    if (event.shiftKey) return null;
    if (key === 'y' && event.ctrlKey && context.canRedo) return 'redo';
    if (key === 'a' && context.pages) return 'selectAll';
    if (key === 'd' && context.selected) return 'duplicate';
    if (key === 's' && context.pages) return 'save';
    return null;
  }
  if (event.shiftKey) return null;
  if (context.selected && (key === 'delete' || key === 'backspace')) return 'remove';
  if (context.selected && key === 'escape') return 'deselectAll';
  return null;
}
