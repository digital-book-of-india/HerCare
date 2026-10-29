import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Stethoscope } from 'lucide-react';

export default function ReviewModal({
  isOpen,
  tip = null,
  onClose,
  onRecordReview,
  loading = false,
}) {
  const [reviewedBy, setReviewedBy] = useState('');
  const [reviewedAt, setReviewedAt] = useState('');
  const [error, setError] = useState(null);

  // Set default review date to today's UTC YYYY-MM-DD
  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split('T')[0];
      setReviewedAt(tip?.reviewedAt ? new Date(tip.reviewedAt).toISOString().split('T')[0] : today);
      setReviewedBy(tip?.reviewedBy || '');
      setError(null);
    }
  }, [isOpen, tip]);

  if (!isOpen || !tip) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!reviewedBy.trim()) {
      setError("Please provide the clinician's name or credential.");
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (reviewedAt > today) {
      setError('Review date cannot be in the future.');
      return;
    }

    onRecordReview({
      reviewedBy: reviewedBy.trim(),
      reviewedAt,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Stethoscope size={20} color="#047857" />
            <h3 className="modal-title">Record Clinical Review</h3>
          </div>
          <button className="modal-close" onClick={onClose} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                marginBottom: '18px',
                fontSize: '0.84rem',
                color: '#065f46',
                lineHeight: '1.45',
              }}
            >
              <strong>Clinical Review Gate:</strong> In accordance with medical safety policies,
              HerCare tips cannot go live until a qualified health professional verifies the content.
            </div>

            {/* Tip Preview */}
            <div
              style={{
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                marginBottom: '18px',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Tip Being Reviewed
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', marginTop: '2px' }}>
                {tip.title}
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                "{tip.text}"
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  color: '#b91c1c',
                  fontSize: '0.85rem',
                }}
              >
                {error}
              </div>
            )}

            {/* Reviewer Name */}
            <div className="form-group">
              <label className="form-label">
                Clinician Name & Designation <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Dr. Jane Doe, MD (OB/GYN)"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                maxLength={100}
                disabled={loading}
              />
            </div>

            {/* Review Date */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Date of Approval <span className="required">*</span>
              </label>
              <input
                type="date"
                className="form-input"
                value={reviewedAt}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setReviewedAt(e.target.value)}
                disabled={loading}
              />
              <p className="form-hint">Must be today or earlier.</p>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ background: '#059669' }}
            >
              <CheckCircle2 size={16} />
              {loading ? 'Submitting...' : 'Approve & Save Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
