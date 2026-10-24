/**
 * PreviewModal — in-app preview for supported formats only:
 *   PDF   → <iframe> served from the authenticated preview endpoint
 *   Image → <img>
 *   Text/Markdown → fetched UTF-8 content in a scrollable <pre>
 *   Office/other → an honest "not previewable" panel with a Download action
 *
 * Nothing here fabricates a preview: the bytes come from the same
 * ownership-checked routes the download uses.
 */

import { useEffect, useState } from 'react';
import { Download, FileQuestion, FolderOpen } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import FileIcon from './FileIcon';
import { API_URL } from '@/services/apiClient';
import { formatBytes, getFileInfo, previewKind } from '@/utils/files';
import { formatDateTime } from '@/utils/dates';
import filesService, { saveBlob } from '@/services/filesService';
import { useNotifications } from '@/context/NotificationContext';

export default function PreviewModal({ open, onClose, file, onDownload }) {
  const { error: notifyError } = useNotifications();
  const [textContent, setTextContent] = useState(null);
  const [textError, setTextError] = useState(null);
  const [isLoadingText, setIsLoadingText] = useState(false);

  const kind = file ? previewKind(file) : 'none';
  const previewSrc = file ? `${API_URL}/files/${file.id}/preview` : '';

  useEffect(() => {
    if (!open || !file || kind !== 'text') {
      setTextContent(null);
      setTextError(null);
      return undefined;
    }
    let cancelled = false;
    setIsLoadingText(true);
    filesService
      .previewText(file.id)
      .then((content) => {
        if (!cancelled) setTextContent(content);
      })
      .catch((err) => {
        if (!cancelled) setTextError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, file, kind]);

  if (!file) return null;

  const handleDownload = async () => {
    try {
      const blob = await filesService.fetchBlob(file.id, { kind: 'download' });
      saveBlob(blob, file.name);
      onDownload?.(file);
    } catch (err) {
      notifyError('Download failed', err.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={file.name}
      size="lg"
      icon={<FileIcon extension={file.extension} size="md" />}
      footer={
        <>
          <span className="modal-footer-meta">
            {getFileInfo(file.extension).label} · {formatBytes(file.sizeBytes)} · added{' '}
            {formatDateTime(file.createdAt)}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon={<Download size={15} />} onClick={handleDownload}>
            Download
          </Button>
        </>
      }
    >
      <div className="preview-frame">
        {kind === 'pdf' && (
          <iframe
            src={previewSrc}
            title={`Preview of ${file.name}`}
            className="preview-pdf"
          />
        )}

        {kind === 'image' && (
          <img
            src={previewSrc}
            alt={file.name}
            className="preview-image"
          />
        )}

        {kind === 'text' && (
          <div className="preview-text">
            {isLoadingText && <p className="form-hint-cn">Loading preview…</p>}
            {textError && (
              <p className="upload-error" role="alert">
                {textError}
              </p>
            )}
            {textContent !== null && <pre>{textContent}</pre>}
          </div>
        )}

        {kind === 'unsupported' && (
          <div className="preview-unsupported">
            <FileQuestion size={30} aria-hidden="true" />
            <h3>Preview isn’t available for {getFileInfo(file.extension).label} files</h3>
            <p>
              CloudNotes never pretends to render a format it can’t display safely. Download the
              file to open it in {file.extension === 'doc' || file.extension === 'docx' ? 'Word' : file.extension === 'ppt' || file.extension === 'pptx' ? 'PowerPoint' : file.extension === 'xls' || file.extension === 'xlsx' ? 'Excel' : 'its native app'}.
            </p>
            <Button icon={<Download size={15} />} onClick={handleDownload}>
              Download {file.name}
            </Button>
          </div>
        )}
      </div>

      {file.folderName && (
        <p className="preview-folder-line">
          <FolderOpen size={13} aria-hidden="true" /> In {file.folderName}
        </p>
      )}
    </Modal>
  );
}
