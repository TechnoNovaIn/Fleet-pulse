import React, { useState } from 'react';
import { Camera, Image, X, UploadCloud, Eye } from 'lucide-react';

export default function PhotoUpload({ currentPhoto, onPhotoUploaded, label = 'Attach Incident / Activity Photo' }) {
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check size < 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be under 5 MB');
      return;
    }

    setError('');
    setUploading(true);

    const formData = new FormData();
    formData.append('photo', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload photo');
      }
      onPhotoUploaded(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onPhotoUploaded(null);
  };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>

      {error && (
        <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '2px' }}>{error}</p>
      )}

      {currentPhoto ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 14px', backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0', borderRadius: '10px'
        }}>
          <img
            src={currentPhoto}
            alt="Attachment preview"
            style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }}
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', display: 'block' }}>
              Photo Attached
            </span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Saved to secure company storage
            </span>
          </div>

          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: '12px' }}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={14} /> View
          </button>

          <button
            type="button"
            className="btn-danger"
            style={{ padding: '6px 10px', fontSize: '12px' }}
            onClick={handleRemove}
          >
            <X size={14} /> Remove
          </button>
        </div>
      ) : (
        <div style={{
          border: '2px dashed #cbd5e1', borderRadius: '10px',
          padding: '16px', textAlign: 'center', backgroundColor: '#f8fafc',
          position: 'relative', cursor: 'pointer'
        }}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              opacity: 0, cursor: 'pointer', width: '100%', height: '100%'
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              backgroundColor: '#eff6ff', color: '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {uploading ? <UploadCloud size={18} className="animate-spin" /> : <Camera size={18} />}
            </div>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
              {uploading ? 'Uploading image...' : 'Click or tap to capture / upload photo'}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Supports JPG, PNG, WebP up to 5MB (Optional)
            </span>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewOpen && currentPhoto && (
        <div className="modal-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Attached Photo</h3>
              <button className="modal-close-btn" onClick={() => setPreviewOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ alignItems: 'center', padding: '16px' }}>
              <img
                src={currentPhoto}
                alt="Enlarged preview"
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
