# Workspace usability and local recovery

Current plan for the September 19 follow-up. The earlier prototype roadmap remains historical; this plan describes the current work, not completed verification.

## Outcomes and constraints

- Explain supported tasks and PDF/JPG/JPEG/PNG/WebP inputs before import, with one primary file-picker action.
- Reorder pages with a visible drag handle and the existing directional buttons. Reordering must be undoable and preserve export order, source bytes and rotations.
- Separate document saving from selected-page editing controls.
- Add opt-in recovery in IndexedDB. Explain that documents remain on this browser/device, persist until cleared, and are not protected by an app password. Never enable persistence by default.
- Show pending/saved/failed status. Offer restore or discard on returning. Clearing saved work must remove its stored bytes and disable future saving while leaving the open workspace usable.
- Do not store passwords, add telemetry or transmit documents. Keep runtime assets same-origin and retain all existing privacy checks.
- The user also approved password import/export in this round. Import requires the supplied password; export optionally requires a new opening password with AES-256. Original encrypted bytes are retained. Recovery stores originals only and asks for the password again on restore; decrypted copies and passwords remain memory-only.

## Implementation and dependencies

1. Extend the workspace reorder model and test nonadjacent moves, invalid moves and undo.
2. Add capability guidance, a separate save area and accessible drag handles. Use a maintained drag-and-drop library for pointer/touch/keyboard behavior; retain arrows.
3. Add a small IndexedDB snapshot repository and recovery UI. Store referenced source bytes and the current workspace atomically; serialize writes and clearing. Preserve the last good snapshot on failed saves. Do not attempt to serialize preview objects or output passwords. Password-engine implementation runs in an isolated worktree with agreed optional password arguments on PdfEngine import/export; Root integrates the engine and owns all UI/persistence.
4. Exercise refresh recovery, opt-out, clearing, denied/quota failures, desktop/mobile layout and actual PDF export. Check that multi-tab use cannot silently overwrite another tab's saved work.
5. Freeze the change for an independent read-only review of persistence/deletion safeguards and usability; resolve findings.
6. Run the required Node 24 unit, build, Chromium browser and hosting checks on the final revision. Create a scoped PR, verify CI, then publish under the user's existing deployment authorization and rerun live hosting checks.

## Acceptance

The primary import action and supported formats are visible on a 390px viewport. Cards describe only working capabilities. Dragging and arrow moves both produce the expected downloaded page order and work with undo/redo. Recovery is off by default, an enabled snapshot survives reload, disabling/clearing removes it, errors do not falsely claim successful saving, and other tabs cannot overwrite saved work silently. No new external document requests occur. Final reporting distinguishes executed Chromium coverage from untested browsers and crash/storage-eviction limitations.
