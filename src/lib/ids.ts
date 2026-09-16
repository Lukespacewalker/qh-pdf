let seq=0;export const newId=()=>globalThis.crypto?.randomUUID?.() ?? `qh-${Date.now()}-${++seq}`;
