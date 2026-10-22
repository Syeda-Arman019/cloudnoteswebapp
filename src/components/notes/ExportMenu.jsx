/**
 * Export menu — the note export interface.
 *
 * Part 1 ships the UI and the service contract only: choosing a format calls
 * `exportService`, which transparently reports that file generation activates
 * once the Flask API (Part 2) is connected. No placeholder files are ever
 * produced and no fake success is reported.
 */

import { FileCode2, FileDown, FileText, FileType2, Info } from 'lucide-react';
import Dropdown from '@/components/common/Dropdown';
import { exportService } from '@/services/exportService';
import { useNotifications } from '@/context/NotificationContext';

const FORMAT_ICONS = {
  pdf: FileText,
  docx: FileType2,
  txt: FileDown,
  md: FileCode2,
};

/** Shared behaviour for both the dropdown and inline item lists. */
function useExportHandler() {
  const { success, error, info } = useNotifications();

  return async (note, format) => {
    try {
      await exportService.exportNote(note, format.id);
      success('Download started', `“${note.title}” is being exported as ${format.label}.`);
    } catch (err) {
      if (err.code === 'export_unavailable') {
        info('Export not available yet', err.message);
      } else {
        error('Export failed', err.message);
      }
    }
  };
}

export function ExportMenuItems({ note, onChosen = null, compact = false }) {
  const formats = exportService.getFormats();
  const runExport = useExportHandler();

  return (
    <>
      <div className="dropdown-label-cn">Export note</div>
      {formats.map((format) => {
        const Icon = FORMAT_ICONS[format.id] || FileText;
        return (
          <button
            key={format.id}
            type="button"
            className={`dropdown-item-cn export-option ${format.id}`}
            role="menuitem"
            onClick={async () => {
              await runExport(note, format);
              if (onChosen) onChosen();
            }}
          >
            <span className="export-icon">
              <Icon size={16} aria-hidden="true" />
            </span>
            <span>
              {format.label}
              {!compact && <span className="item-meta">{format.description}</span>}
            </span>
          </button>
        );
      })}
    </>
  );
}

export default function ExportMenu({ note, align = 'right' }) {
  const exportReady = exportService.isExportReady();

  return (
    <Dropdown
      align={align}
      menuLabel="Export options"
      trigger={({ toggle, props }) => (
        <button
          type="button"
          className="btn-cn btn-secondary btn-sm"
          onClick={toggle}
          {...props}
          aria-label={`Export “${note.title}”`}
        >
          <FileDown size={15} aria-hidden="true" />
          Export
        </button>
      )}
    >
      {({ close }) => (
        <>
          <ExportMenuItems note={note} onChosen={close} />
          {!exportReady && (
            <>
              <div className="dropdown-divider-cn" />
              <p
                className="item-meta"
                style={{ display: 'flex', gap: '0.4rem', padding: '0.4rem 0.7rem', margin: 0 }}
              >
                <Info size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                File generation arrives with the CloudNotes API in Part 2 — nothing is
                downloaded until real export works.
              </p>
            </>
          )}
        </>
      )}
    </Dropdown>
  );
}
