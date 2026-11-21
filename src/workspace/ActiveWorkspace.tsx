import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ThumbnailScheduler } from '../engine/ThumbnailScheduler';
import { FullPagePreviewDialog } from './FullPagePreviewDialog';
import { PageCard } from './PageCard';
import { SavePanel, type SaveTarget } from './SavePanel';
import { CropDialog } from './CropDialog';
import type { PdfEngine } from '../engine/PdfEngine';
import type { PdfOutputSettings } from '../domain/exportOptions';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n/i18n';
import { useWorkspaceStore } from './useWorkspaceStore';
import './editor.css';

interface ActiveWorkspaceProps {
  engine: PdfEngine;
  historyActions: ReactNode;
  locked: boolean;
  editLocked: boolean;
  recoveryPending: boolean;
  activePage: string | null;
  setActivePage: (id: string | null) => void;
  exporting: boolean;
  saveButton: RefObject<HTMLButtonElement | null>;
  save: (target: SaveTarget, password?: string, output?: PdfOutputSettings) => Promise<boolean>;
  cancelExport: () => void;
  children: ReactNode;
}

export function ActiveWorkspace({
  engine, historyActions, locked, editLocked, recoveryPending, activePage, setActivePage,
  exporting, saveButton, save, cancelExport, children,
}: ActiveWorkspaceProps) {
  const { t } = useI18n();
  const store = useWorkspaceStore();
  const ws = store.history.present;
  const selected = ws.selectedPageIds.length;
  const [preview, setPreview] = useState<{ pageId: string; opener: HTMLButtonElement } | null>(null);
  const [cropOpener, setCropOpener] = useState<HTMLButtonElement | null>(null);
  const thumbnailScheduler = useMemo(() => new ThumbnailScheduler(2), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return <>
    <div className="page-editing-region">
      <div className="toolbar" role="group" aria-label={t('Page editing tools')}>
        {historyActions}
        <div className="selection-tools" role="group" aria-label={t('Page selection tools')}>
          <button className="btn" onClick={store.selectAll} disabled={editLocked || selected === ws.pages.length}><Icon name="select" />{t('Select all')}</button>
          <button className="btn" onClick={store.deselectAll} disabled={editLocked || !selected}><Icon name="deselect" />{t('Deselect all')}</button>
          <output className="selection-count" role="status" aria-label={t('Selected pages')}>{t('{selected} of {total} selected', { selected, total: ws.pages.length })}</output>
        </div>
        <span className="spacer" />
        <div className="edit-tools">
          <button className="btn" aria-label={t('Rotate left')} onClick={() => store.rotate(-90)} disabled={editLocked || !selected}><Icon name="rotate-left" />{t('Rotate left')}</button>
          <button className="btn" aria-label={t('Rotate right')} onClick={() => store.rotate(90)} disabled={editLocked || !selected}><Icon name="rotate-right" />{t('Rotate right')}</button>
          <button className="btn" onClick={store.duplicate} disabled={editLocked || !selected}><Icon name="copy" />{t('Duplicate')}</button>
          <button className="btn danger" onClick={store.remove} disabled={editLocked || !selected}><Icon name="trash" />{t('Delete')}</button>
          <button className="btn" onClick={event => setCropOpener(event.currentTarget)} disabled={editLocked || !selected}><Icon name="crop" />{t('Crop')}</button>
        </div>
      </div>
      <p className="arrange-hint">{t('Click a page to select it, use Shift for a range, or Ctrl / Command to add pages. The checkbox adds a page on touch and keyboard. Drag the handle or use arrows to reorder.')}</p>
      <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)}
        accessibility={{ screenReaderInstructions: {
          draggable: t('To pick up a page, press Space. While moving, use the arrow keys. Press Space again to drop, or Escape to cancel.'),
        }, announcements: {
          onDragStart: ({ active }) => t('Picked up page {page}.', { page: ws.pages.findIndex(page => page.id === active.id) + 1 }),
          onDragOver: ({ over }) => over ? t('Move to position {position}.', { position: ws.pages.findIndex(page => page.id === over.id) + 1 }) : t('Outside the page area. Drop to cancel.'),
          onDragEnd: ({ over }) => over ? t('Page moved to position {position}.', { position: ws.pages.findIndex(page => page.id === over.id) + 1 }) : t('Page move cancelled.'),
          onDragCancel: () => t('Page move cancelled.'),
        } }}
        onDragStart={event => setActivePage(String(event.active.id))}
        onDragCancel={() => setActivePage(null)}
        onDragEnd={({ active, over }) => {
          if (!locked && over) store.reorder(String(active.id), String(over.id));
          setActivePage(null);
        }}>
        <SortableContext items={ws.pages.map(page => page.id)} strategy={rectSortingStrategy}>
          <section className="grid" aria-label={t('Document pages')}>{ws.pages.map((page, index) => {
            const doc = store.documents.get(page.sourceDocumentId);
            if (!doc) return <div className="notice" role="alert" key={page.id}>{t('The source for page {page} is missing. Undo the last change or add the document again.', { page: index + 1 })}</div>;
            return <PageCard key={page.id} page={page} index={index} doc={doc} engine={engine}
              scheduler={thumbnailScheduler} disabled={locked || recoveryPending} selectionDisabled={editLocked}
              last={index === ws.pages.length - 1}
              onPreview={(pageId, opener) => setPreview({ pageId, opener })} />;
          })}</section>
        </SortableContext>
        <DragOverlay>{activePage ? <div className="drag-overlay">{t('Moving page {page}', { page: ws.pages.findIndex(page => page.id === activePage) + 1 })}</div> : null}</DragOverlay>
      </DndContext>
    </div>
    <SavePanel count={ws.pages.length} selectedCount={selected} locked={editLocked} exporting={exporting} onSave={save} onCancel={cancelExport} saveButtonRef={saveButton}
      engine={engine} workspace={ws} documents={store.documents}>
      {children}
    </SavePanel>
    {preview && <FullPagePreviewDialog pageId={preview.pageId} pages={ws.pages} documents={store.documents}
      engine={engine} opener={preview.opener} onNavigate={pageId => setPreview(current => current ? { ...current, pageId } : null)}
      onRotate={store.rotatePage} onClose={() => setPreview(null)} />}
    {cropOpener && (() => {
      const page = ws.pages.find(page => ws.selectedPageIds.includes(page.id));
      const document = page && store.documents.get(page.sourceDocumentId);
      return page && document ? <CropDialog page={page} document={document} count={selected} engine={engine}
        opener={cropOpener} onApply={store.crop} onClose={() => setCropOpener(null)} /> : null;
    })()}
  </>;
}
