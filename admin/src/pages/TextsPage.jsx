import React, { useState, useEffect } from 'react';
import { getContent, updateContent } from '../services/api';
import {
  FileText,
  Shield,
  CheckSquare,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Info
} from 'lucide-react';

export default function TextsPage() {
  const [content, setContent] = useState(null);
  const [disclaimerText, setDisclaimerText] = useState('');
  const [privacyText, setPrivacyText] = useState('');
  const [checklistItems, setChecklistItems] = useState([]);

  // New item inputs
  const [newItemId, setNewItemId] = useState('');
  const [newItemLabel, setNewItemLabel] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const loadContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getContent();
      setContent(data.content);
      setDisclaimerText(data.content.disclaimerText || '');
      setPrivacyText(data.content.privacyText || '');
      setChecklistItems(data.content.defaultChecklistItems || []);
    } catch (err) {
      setError(err.message || 'Failed to load default content');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, []);

  const showNotification = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // 1. Save Disclaimers & Privacy Text
  const handleSaveTexts = async () => {
    setError(null);

    // Validation
    if (!disclaimerText.trim() || disclaimerText.trim().length < 20 || disclaimerText.trim().length > 2000) {
      setError('Disclaimer text must be between 20 and 2000 characters and cannot be blank.');
      return;
    }
    if (!privacyText.trim() || privacyText.trim().length < 20 || privacyText.trim().length > 4000) {
      setError('Privacy text must be between 20 and 4000 characters.');
      return;
    }

    setSaving(true);
    try {
      const res = await updateContent({
        disclaimerText: disclaimerText.trim(),
        privacyText: privacyText.trim(),
      });
      setContent(res.content);
      showNotification('Legal & health texts saved successfully.');
    } catch (err) {
      setError(err.message || 'Failed to update texts');
    } finally {
      setSaving(false);
    }
  };

  // 2. Checklist items management
  const handleAddChecklistItem = () => {
    setError(null);

    if (checklistItems.length >= 20) {
      setError('A maximum of 20 checklist items is allowed.');
      return;
    }

    const cleanId = newItemId.trim().toLowerCase();
    const cleanLabel = newItemLabel.trim();

    if (!cleanId || !/^[a-z0-9-]{1,40}$/.test(cleanId)) {
      setError('Item ID must be 1-40 characters consisting only of lowercase letters, numbers, and hyphens (e.g., warm-bath).');
      return;
    }

    if (!cleanLabel || cleanLabel.length > 80) {
      setError('Item label must be 1-80 characters.');
      return;
    }

    if (checklistItems.some((item) => item.id === cleanId)) {
      setError(`Item ID "${cleanId}" is already used in the checklist.`);
      return;
    }

    setChecklistItems([...checklistItems, { id: cleanId, label: cleanLabel }]);
    setNewItemId('');
    setNewItemLabel('');
  };

  const handleRemoveChecklistItem = (idToRemove) => {
    setChecklistItems(checklistItems.filter((i) => i.id !== idToRemove));
  };

  const handleSaveChecklist = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await updateContent({
        defaultChecklistItems: checklistItems,
      });
      setContent(res.content);
      showNotification('Default self-care checklist saved. New users will receive this updated checklist upon registration.');
    } catch (err) {
      setError(err.message || 'Failed to save default checklist');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
        <RefreshCw className="animate-spin" size={28} style={{ margin: '0 auto 12px' }} />
        <p>Loading default texts and checklist...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Default Texts & Checklist</h1>
          <p className="page-subtitle">
            Configure system medical disclaimer, privacy disclosure, and starter self-care habits
          </p>
        </div>

        <button className="btn btn-secondary" onClick={loadContent} disabled={loading || saving}>
          <RefreshCw size={15} />
          <span>Reload</span>
        </button>
      </div>

      {/* Clinical & Scope Notice */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <Info size={18} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
        <div style={{ fontSize: '0.86rem', color: '#1e40af', lineHeight: '1.45' }}>
          <strong>Clinical Governance Note:</strong> While edits to disclaimer and privacy texts take
          effect immediately, ensure any medical wording adjustments are aligned with your clinical advisory board.
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#065f46',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CheckCircle2 size={18} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{successMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertCircle size={18} />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px' }}>
        {/* Section 1: Disclaimers & Privacy */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FileText size={18} color="var(--primary)" />
              <span>Medical Disclaimer & Privacy Notice</span>
            </h3>
          </div>

          {/* Disclaimer Text */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">
                Medical Disclaimer (Cannot be blank) <span className="required">*</span>
              </label>
              <span className="form-hint">{disclaimerText.length}/2000</span>
            </div>
            <textarea
              className="form-textarea"
              rows={5}
              placeholder="HerCare is a wellness and estimation tracking tool, not a medical diagnosis device..."
              value={disclaimerText}
              onChange={(e) => setDisclaimerText(e.target.value)}
              disabled={saving}
              maxLength={2000}
            />
            <p className="form-hint">Displayed in the mobile app drawer and onboarding (20–2000 chars).</p>
          </div>

          {/* Privacy Notice */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">
                Privacy Disclosure Statement <span className="required">*</span>
              </label>
              <span className="form-hint">{privacyText.length}/4000</span>
            </div>
            <textarea
              className="form-textarea"
              rows={6}
              placeholder="Your cycle and symptom logs are confidential..."
              value={privacyText}
              onChange={(e) => setPrivacyText(e.target.value)}
              disabled={saving}
              maxLength={4000}
            />
            <p className="form-hint">Explains data confidentiality, encryption, and zero-PII admin access (20–4000 chars).</p>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveTexts}
            disabled={saving}
            style={{ width: '100%' }}
          >
            <Save size={16} />
            <span>{saving ? 'Saving Texts...' : 'Save Disclaimer & Privacy Texts'}</span>
          </button>
        </div>

        {/* Section 2: Default Self-Care Checklist */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <CheckSquare size={18} color="var(--primary)" />
                <span>Default Self-Care Checklist</span>
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Starter tasks for new accounts ({checklistItems.length}/20 items)
              </p>
            </div>
          </div>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              marginBottom: '16px',
            }}
          >
            <strong>Note:</strong> Changes to this list only affect <em>new user accounts created in the future</em>.
            Existing users maintain their custom personal checklist items.
          </div>

          {/* Checklist Items List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', maxHeight: '300px', overflowY: 'auto' }}>
            {checklistItems.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--surface-alt)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.label}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    id: {item.id}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => handleRemoveChecklistItem(item.id)}
                  title="Remove item"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Add New Item Form */}
          <div
            style={{
              background: 'var(--surface-alt)',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-strong)',
              marginBottom: '20px',
            }}
          >
            <div style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: '10px' }}>
              Add Item to Default Checklist
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', alignItems: 'flex-start' }}>
              <div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="id: warm-bath"
                  value={newItemId}
                  onChange={(e) => setNewItemId(e.target.value)}
                  style={{ fontSize: '0.84rem', padding: '8px 10px' }}
                />
              </div>

              <div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Label: Take a warm soothing bath"
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  style={{ fontSize: '0.84rem', padding: '8px 10px' }}
                />
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAddChecklistItem}
                style={{ padding: '8px 14px' }}
                disabled={checklistItems.length >= 20}
              >
                <Plus size={15} />
                <span>Add</span>
              </button>
            </div>
            <p className="form-hint" style={{ marginTop: '6px' }}>
              ID: lowercase letters, numbers & hyphens (1-40 chars). Label: 1-80 chars.
            </p>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveChecklist}
            disabled={saving}
            style={{ width: '100%' }}
          >
            <Save size={16} />
            <span>{saving ? 'Saving Checklist...' : 'Save Default Checklist'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
