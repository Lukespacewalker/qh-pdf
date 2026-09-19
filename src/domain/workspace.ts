export type Rotation=0|90|180|270;
export interface WorkspacePage{id:string;sourceDocumentId:string;sourcePageIndex:number;rotation:Rotation}
export interface WorkspaceState{pages:WorkspacePage[];selectedPageIds:string[]}
export const emptyWorkspace=():WorkspaceState=>({pages:[],selectedPageIds:[]});
export const appendPages=(s:WorkspaceState,p:WorkspacePage[]):WorkspaceState=>({...s,pages:[...s.pages,...p]});
export function rotatePages(s:WorkspaceState,ids:string[],delta:90|-90):WorkspaceState{const set=new Set(ids);return{...s,pages:s.pages.map(p=>set.has(p.id)?{...p,rotation:((p.rotation+delta+360)%360) as Rotation}:p)}}
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
export function toggleSelection(s:WorkspaceState,id:string,additive:boolean):WorkspaceState{if(!additive)return{...s,selectedPageIds:[id]};const set=new Set(s.selectedPageIds);set.has(id)?set.delete(id):set.add(id);return{...s,selectedPageIds:[...set]}}
