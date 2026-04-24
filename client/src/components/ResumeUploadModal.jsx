import { useEffect, useRef, useState } from 'react';
import { X, FileUp, Loader, FileText } from 'lucide-react';
import * as api from '../api.js';

const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = ['pdf', 'doc', 'docx'];
const extOf = (name) => (name.split('.').pop() || '').toLowerCase();
const prettySize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function ResumeUploadModal({ open, company, onClose, onSkip, onMove }) {
  const [file,    setFile]    = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error,   setError]   = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setFile(null); setUploading(false); setError('');
    }
  }, [open]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && open && !uploading) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose, uploading]);

  if (!open) return null;

  const pickFile = (f) => {
    if (!f) return;
    if (!ALLOWED_EXT.includes(extOf(f.name))) {
      setError('Only PDF, DOC, or DOCX files are allowed.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('File is larger than 10 MB.');
      return;
    }
    setError('');
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { url } = await api.uploadResume(company.id, file);
      onMove(url);
    } catch (e) {
      setError(e.message || 'Upload failed. Try again.');
      setUploading(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={uploading ? undefined : onClose} />
      <div
        className="fade-in"
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(540px, 94vw)',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          zIndex: 55,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ marginBottom: '0.25rem' }}>Moving to Applied</div>
            <div className="font-serif" style={{ fontSize: '1.35rem', fontWeight: 400 }}>
              {company?.name || 'Company'}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Upload the resume you're applying with — PDF, DOC, or DOCX
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} disabled={uploading} style={{ padding: '0.3rem' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem' }}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          {!file ? (
            <button
              onClick={() => inputRef.current?.click()}
              style={{
                width: '100%',
                padding: '2rem 1rem',
                border: '1.5px dashed var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                color: 'var(--text-secondary)',
                fontFamily: 'inherit',
              }}
            >
              <FileUp size={24} />
              <div style={{ fontSize: '0.95rem', color: 'var(--text)' }}>Choose a file</div>
              <div style={{ fontSize: '0.78rem' }}>PDF, DOC, DOCX · up to 10 MB</div>
            </button>
          ) : (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.9rem 1rem',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
              }}
            >
              <FileText size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.92rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {prettySize(file.size)}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }}
                disabled={uploading}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
              >
                Change
              </button>
            </div>
          )}

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--danger-bg)', border: '1px solid #E7B3B3' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.9rem 1.5rem', borderTop: '1px solid var(--divider)', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={uploading} style={{ marginRight: 'auto' }}>
            Cancel — revert move
          </button>
          <button className="btn btn-secondary" onClick={onSkip} disabled={uploading}>Skip</button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading}>
            {uploading && <Loader size={14} className="spin" />}
            {uploading ? 'Uploading…' : 'Upload & Move'}
          </button>
        </div>
      </div>
    </>
  );
}
