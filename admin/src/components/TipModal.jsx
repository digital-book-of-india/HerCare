import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Sparkles, HelpCircle } from 'lucide-react';

export default function TipModal({
  isOpen,
  tip = null, // null for create, object for edit
  onClose,
  onSave,
  loading = false,
}) {
  const isEditing = Boolean(tip && tip.id);

  const [category, setCategory] = useState('food');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [showWhen, setShowWhen] = useState('always');
  const [error, setError] = useState(null);

  // Initialize form when tip changes
  useEffect(() => {
    if (tip) {
      setCategory(tip.category || 'food');
      setTitle(tip.title || '');
      setText(tip.text || '');
      setShowWhen(tip.showWhen || 'always');
    } else {
      setCategory('food');
      setTitle('');
      setText('');
      setShowWhen('always');
    }
    setError(null);
  }, [tip, isOpen]);

  if (!isOpen) return null;

  const isReviewedOrLive = isEditing && (tip.reviewedAt || tip.active);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required (1-100 characters).');
      return;
    }
    if (title.length > 100) {
      setError('Title cannot exceed 100 characters.');
      return;
    }
    if (!text.trim()) {
      setError('Tip content is required (1-500 characters).');
      return;
    }
    if (text.length > 500) {
      setError('Tip content cannot exceed 500 characters.');
      return;
    }

    onSave({
      category,
      title: title.trim(),
      text: text.trim(),
      showWhen,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} color="var(--primary)" />
            <h3 className="modal-title">
              {isEditing ? 'Edit Wellness Tip' : 'Create New Tip (Draft)'}
            </h3>
          </div>
          <button className="modal-close" onClick={onClose} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Warning if editing an already-reviewed or live tip */}
            {isReviewedOrLive && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <AlertTriangle size={18} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '0.84rem', color: '#991b1b', lineHeight: '1.4' }}>
                  <strong>Clinical Review Reset Warning:</strong> Changing the title, text, or category
                  will clear clinical approval and take this tip offline. It will need to be reviewed by a
                  clinician again before it can go live.
                </div>
              </div>
            )}

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

            {/* Category */}
            <div className="form-group">
              <label className="form-label">
                Category <span className="required">*</span>
              </label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={loading}
              >
                <option value="food">Food & Nutrition</option>
                <option value="activity">Activity & Movement</option>
              </select>
            </div>

            {/* Title */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">
                  Title <span className="required">*</span>
                </label>
                <span className="form-hint">{title.length}/100</span>
              </div>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Warm ginger or chamomile tea"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                disabled={loading}
              />
              <p className="form-hint">Must be unique within the selected category.</p>
            </div>

            {/* Text */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">
                  Tip Advice / Text <span className="required">*</span>
                </label>
                <span className="form-hint">{text.length}/500</span>
              </div>
              <textarea
                className="form-textarea"
                rows={4}
                placeholder="Short, evidence-based guidance to help user feel better..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                disabled={loading}
              />
              <p className="form-hint">Keep advice practical, warm, and medically grounded.</p>
            </div>

            {/* Show When */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">When Should This Show in Mobile App?</label>
              <select
                className="form-select"
                value={showWhen}
                onChange={(e) => setShowWhen(e.target.value)}
                disabled={loading}
              >
                <option value="always">Always (Any cycle day)</option>
                <option value="period">Period only (While user has an active period logged)</option>
              </select>
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
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
