import type{WorkspaceState}from'./workspace';
export interface HistoryState{past:WorkspaceState[];present:WorkspaceState;future:WorkspaceState[]}
export const createHistory=(present:WorkspaceState):HistoryState=>({past:[],present,future:[]});
export const commit=(h:HistoryState,next:WorkspaceState):HistoryState=>({past:[...h.past,h.present].slice(-100),present:next,future:[]});
export const undo=(h:HistoryState):HistoryState=>h.past.length?{past:h.past.slice(0,-1),present:h.past.at(-1)!,future:[h.present,...h.future]}:h;
export const redo=(h:HistoryState):HistoryState=>h.future.length?{past:[...h.past,h.present].slice(-100),present:h.future[0],future:h.future.slice(1)}:h;
