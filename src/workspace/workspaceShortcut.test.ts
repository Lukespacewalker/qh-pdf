import { describe, expect, it } from 'vitest';
import { workspaceShortcut } from './workspaceShortcut';

const state = { locked: false, modal: false, editable: false, pages: 3, selected: 2, canUndo: true, canRedo: true };
const key = (value: string, extra = {}) => ({ key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...extra });
describe('workspace keyboard safeguards', () => {
  it.each(['Delete', 'Backspace', 'Escape'])('never changes pages from %s inside an input, dialog, drag or locked workspace', value => {
    for (const field of ['locked', 'modal', 'editable'] as const) expect(workspaceShortcut(key(value), { ...state, [field]: true })).toBeNull();
    expect(workspaceShortcut(key(value, { isComposing: true }), state)).toBeNull();
  });
  it('maps platform shortcuts only when their action can be handled', () => {
    expect(workspaceShortcut(key('z', { ctrlKey: true }), state)).toBe('undo');
    expect(workspaceShortcut(key('Z', { metaKey: true, shiftKey: true }), state)).toBe('redo');
    expect(workspaceShortcut(key('y', { ctrlKey: true }), state)).toBe('redo');
    expect(workspaceShortcut(key('a', { metaKey: true }), state)).toBe('selectAll');
    expect(workspaceShortcut(key('d', { ctrlKey: true }), state)).toBe('duplicate');
    expect(workspaceShortcut(key('s', { ctrlKey: true }), state)).toBe('save');
    expect(workspaceShortcut(key('Delete'), state)).toBe('remove');
    expect(workspaceShortcut(key('Escape'), state)).toBe('deselectAll');
    expect(workspaceShortcut(key('z', { ctrlKey: true }), { ...state, canUndo: false })).toBeNull();
    expect(workspaceShortcut(key('Delete'), { ...state, selected: 0 })).toBeNull();
    expect(workspaceShortcut(key('s', { ctrlKey: true }), { ...state, pages: 0 })).toBeNull();
    expect(workspaceShortcut(key('Delete', { altKey: true }), state)).toBeNull();
    expect(workspaceShortcut(key('d', { ctrlKey: true, shiftKey: true }), state)).toBeNull();
    expect(workspaceShortcut(key('z'), state)).toBeNull();
  });
});
