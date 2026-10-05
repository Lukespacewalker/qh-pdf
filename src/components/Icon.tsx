type IconName = 'add' | 'file' | 'lock' | 'undo' | 'redo' | 'select' | 'deselect' | 'rotate-left' | 'rotate-right' | 'copy' | 'trash' | 'eye' | 'left' | 'right' | 'download';

const paths: Record<IconName, string> = {
  add: 'M12 5v14M5 12h14',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 11v6M9 14h6',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM12 14v3',
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'm15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12',
  select: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 12l3 3 5-6',
  deselect: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M9 9l6 6M15 9l-6 6',
  'rotate-left': 'M3 3v6h6M3 9a9 9 0 1 1 0 6',
  'rotate-right': 'M21 3v6h-6M21 9a9 9 0 1 0 0 6',
  copy: 'M9 9h12v12H9zM15 5V3H3v12h2',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  download: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
};

export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
