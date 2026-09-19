import type { WorkspaceState } from './workspace';

export function rangeSelection(state: WorkspaceState, anchorId: string | null, targetId: string, additive: boolean): WorkspaceState {
  const target = state.pages.findIndex(page => page.id === targetId);
  if (target < 0) return state;
  const foundAnchor = state.pages.findIndex(page => page.id === anchorId);
  const anchor = foundAnchor < 0 ? target : foundAnchor;
  const selected = new Set(additive ? state.selectedPageIds : []);
  for (let i = Math.min(anchor, target); i <= Math.max(anchor, target); i++) selected.add(state.pages[i].id);
  return { ...state, selectedPageIds: state.pages.filter(page => selected.has(page.id)).map(page => page.id) };
}

/** Output composition only. Never alter the editable workspace or its recovery snapshot. */
export function selectedWorkspace(state: WorkspaceState): WorkspaceState {
  const selected = new Set(state.selectedPageIds);
  return { pages: state.pages.filter(page => selected.has(page.id)).map(page => ({ ...page })), selectedPageIds: [] };
}
