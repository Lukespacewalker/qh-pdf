import { assertCrop, rotateCrop, type CropMargins } from './crop';
export type Rotation=0|90|180|270;
export interface WorkspacePage{id:string;sourceDocumentId:string;sourcePageIndex:number;rotation:Rotation;crop?:CropMargins}
export interface WorkspaceState{pages:WorkspacePage[];selectedPageIds:string[]}
export const emptyWorkspace=():WorkspaceState=>({pages:[],selectedPageIds:[]});
export const appendPages=(s:WorkspaceState,p:WorkspacePage[]):WorkspaceState=>({...s,pages:[...s.pages,...p]});
export function rotatePages(s:WorkspaceState,ids:string[],delta:90|-90):WorkspaceState{const set=new Set(ids);return{...s,pages:s.pages.map(p=>set.has(p.id)?{...p,rotation:((p.rotation+delta+360)%360) as Rotation,...(p.crop ? {crop:rotateCrop(p.crop,delta)} : {})}:p)}}
export function cropPages(s: WorkspaceState, ids: string[], crop?: CropMargins): WorkspaceState {
  if (crop !== undefined) assertCrop(crop);
  const selected = new Set(ids);
  return { ...s, pages: s.pages.map(page => {
    if (!selected.has(page.id)) return page;
    const next = { ...page };
    if (crop && Object.values(crop).some(value => value > 0)) next.crop = { ...crop };
    else delete next.crop;
    return next;
  }) };
}
export function deletePages(s:WorkspaceState,ids:string[]):WorkspaceState{const set=new Set(ids);return{pages:s.pages.filter(p=>!set.has(p.id)),selectedPageIds:s.selectedPageIds.filter(id=>!set.has(id))}}
export function duplicatePages(s:WorkspaceState,ids:string[],makeId:()=>string):WorkspaceState{const set=new Set(ids);return{...s,pages:s.pages.flatMap(p=>set.has(p.id)?[p,{...p,id:makeId()}]:[p])}}
export function movePage(s:WorkspaceState,id:string,d:-1|1):WorkspaceState{const from=s.pages.findIndex(p=>p.id===id),to=from+d;if(from<0||to<0||to>=s.pages.length)return s;const pages=[...s.pages];[pages[from],pages[to]]=[pages[to],pages[from]];return{...s,pages}}
export function reorderPage(state: WorkspaceState, id: string, targetId: string): WorkspaceState {
  const from = state.pages.findIndex(page => page.id === id);
  const to = state.pages.findIndex(page => page.id === targetId);
  if (from < 0 || to < 0 || from === to) return state;
  const pages = [...state.pages];
  const [page] = pages.splice(from, 1);
  pages.splice(to, 0, page);
  return { ...state, pages };
}
export function toggleSelection(s: WorkspaceState, id: string, additive: boolean): WorkspaceState {
  const validIds = new Set(s.pages.map(page => page.id));
  const selected = new Set(s.selectedPageIds.filter(selectedId => validIds.has(selectedId)));
  if (!validIds.has(id)) return { ...s, selectedPageIds: [...selected] };
  if (!additive) return { ...s, selectedPageIds: [id] };
  selected.has(id) ? selected.delete(id) : selected.add(id);
  return { ...s, selectedPageIds: [...selected] };
}

export function selectPageRange(s: WorkspaceState, anchorId: string, targetId: string, additive: boolean): WorkspaceState {
  const anchor = s.pages.findIndex(page => page.id === anchorId);
  const target = s.pages.findIndex(page => page.id === targetId);
  if (anchor < 0 || target < 0) return s;
  const [from, to] = anchor < target ? [anchor, target] : [target, anchor];
  const range = s.pages.slice(from, to + 1).map(page => page.id);
  if (!additive) return { ...s, selectedPageIds: range };
  const validIds = new Set(s.pages.map(page => page.id));
  const selected = new Set(s.selectedPageIds.filter(id => validIds.has(id)));
  for (const id of range) selected.add(id);
  return { ...s, selectedPageIds: [...selected] };
}

export const selectAllPages = (s: WorkspaceState): WorkspaceState => ({
  ...s, selectedPageIds: s.pages.map(page => page.id),
});
export const deselectAllPages = (s: WorkspaceState): WorkspaceState => ({ ...s, selectedPageIds: [] });

export function sanitizeSelection(s: WorkspaceState): WorkspaceState {
  const validIds = new Set(s.pages.map(page => page.id));
  const selectedPageIds = [...new Set(s.selectedPageIds.filter(id => validIds.has(id)))];
  return { ...s, selectedPageIds };
}

export function createSelectedExportWorkspace(s: WorkspaceState): WorkspaceState {
  const requested = s.selectedPageIds;
  const selected = new Set(requested);
  const validIds = new Set(s.pages.map(page => page.id));
  if (requested.length === 0 || selected.size !== requested.length || requested.some(id => !validIds.has(id))) {
    throw new Error('The selected pages are no longer available. Select them again and retry.');
  }
  const pages = s.pages.filter(page => selected.has(page.id)).map(page => ({ ...page, ...(page.crop && { crop: { ...page.crop } }) }));
  if (pages.length !== selected.size) {
    throw new Error('The selected pages are no longer available. Select them again and retry.');
  }
  return { pages, selectedPageIds: pages.map(page => page.id) };
}
