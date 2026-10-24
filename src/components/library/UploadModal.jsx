/**
 * UploadModal — drag-and-drop + file picker + live upload queue.
 *
 * Backed by FilesContext's global queue: progress, per-file errors, retry,
 * and cancel all work here while the header button, dashboard, and library
 * pages simply call startUpload(). One request per file keeps progress and
 * failure messages precise.
 */

import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, RotateCw, Upload, X, XCircle } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import { useFilesStore } from '@/context/FilesContext';
import { ACCEPT_ATTR, ACCEPT_HELP, formatBytes } from '@/utils/files';

export default function UploadModal() {
  const {
    isUploadOpen,
    closeUpload,
    uploads,
    startUpload,
    retryUpload,
    cancelUpload,
    clearFinishedUploads,
    uploadFolderId,
    folders,
  } = useFilesStore();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const targetFolder = folders.find((folder) => folder.id === String(uploadFolderId));

  const handleFiles = (fileList) => {
    if (fileList?.length) startUpload(fileList, { folderId: uploadFolderId });
  };

  const activeCount = uploads.filter(
    (item) => item.status === 'uploading' || item.status === 'queued'
  ).length;

  return (
    <Modal
      open={isUploadOpen}
      onClose={closeUpload}
      title="Upload study materials"
      size="md"
      icon={
        <span className="modal-icon" aria-hidden="true">
          <Upload size={20} />
        </span>
      }
      footer={
        <>
          {uploads.length > 0 && activeCount === 0 && (
            <Button variant="ghost" onClick={clearFinishedUploads}>
              Clear list
            </Button>
          )}
          <Button variant="secondary" onClick={closeUpload}>
            {activeCount > 0 ? 'Keep uploading in background' : 'Close'}
          </Button>
          <Button
            icon={<FileUp size={16} />}
            onClick={() => inputRef.current?.click()}
            disabled={activeCount > 0}
          >
            Choose files
          </Button>
        </>
      }
    >
      <p className="upload-target">
        Uploading to:{' '}
        <strong>{targetFolder ? targetFolder.name : 'Study Library root'}</strong>
        {' — '}
        <span className="form-hint-cn">{ACCEPT_HELP}</span>
      </p>

      <div
        className={`dropzone${isDragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <FileUp size={28} aria-hidden="true" />
        <p>
          <strong>Drag &amp; drop files here</strong>
        </p>
        <p className="form-hint-cn">or use the button below to browse this device.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          hidden
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="upload-queue" aria-label="Upload queue">
          {uploads.map((item) => (
            <li key={item.id} className={`upload-row upload-row--${item.status}`}>
              <div className="upload-row-head">
                <span className="upload-name" title={item.name}>
                  {item.status === 'done' && (
                    <CheckCircle2 size={15} className="upload-status-icon done" aria-hidden="true" />
                  )}
                  {item.status === 'error' && (
                    <XCircle size={15} className="upload-status-icon error" aria-hidden="true" />
                  )}
                  {item.name}
                </span>
                <span className="upload-size">{formatBytes(item.size)}</span>
              </div>

              {(item.status === 'uploading' || item.status === 'queued') && (
                <div className="progress-track" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${item.name}`}>
                  <div className="progress-fill" style={{ width: `${item.progress}%` }} />
                </div>
              )}

              {item.status === 'uploading' && (
                <p className="upload-hint">{item.progress}%</p>
              )}
              {item.status === 'queued' && <p className="upload-hint">Waiting…</p>}
              {item.status === 'error' && (
                <p className="upload-error" role="alert">
                  {item.error}
                </p>
              )}

              <div className="upload-row-actions">
                {item.status === 'error' && (
                  <button type="button" className="link-btn" onClick={() => retryUpload(item.id)}>
                    <RotateCw size={13} aria-hidden="true" /> Retry
                  </button>
                )}
                {(item.status === 'uploading' || item.status === 'queued' || item.status === 'error') && (
                  <button type="button" className="link-btn danger" onClick={() => cancelUpload(item.id)}>
                    <X size={13} aria-hidden="true" /> Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
