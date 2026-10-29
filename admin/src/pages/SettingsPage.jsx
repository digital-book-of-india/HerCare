import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import {
  Sliders,
  Power,
  Calendar,
  Clock,
  Save,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Info
} from 'lucide-react';

export default function SettingsPage({ onFeatureStateChange }) {
  const [settings, setSettings] = useState(null);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [defaultCycleLength, setDefaultCycleLength] = useState(28);
  const [defaultPeriodDuration, setDefaultPeriodDuration] = useState(5);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Safety confirmation dialog for disabling the feature
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSettings();
      setSettings(data.settings);
      setFeatureEnabled(data.settings.featureEnabled);
      setDefaultCycleLength(data.settings.defaultCycleLength || 28);
      setDefaultPeriodDuration(data.settings.defaultPeriodDuration || 5);
      if (onFeatureStateChange) {
        onFeatureStateChange(data.settings.featureEnabled);
      }
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const showNotification = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // Toggle Feature Switch handler
  const handleFeatureToggle = (e) => {
    const nextVal = e.target.checked;
    if (!nextVal) {
      // Disabling requires confirmation
      setIsDisableModalOpen(true);
    } else {
      // Enabling can be applied directly
      setFeatureEnabled(true);
    }
  };

  const confirmDisableFeature = () => {
    setFeatureEnabled(false);
    setIsDisableModalOpen(false);
  };

  // Save Settings
  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);

    const cycle = parseInt(defaultCycleLength, 10);
    const period = parseInt(defaultPeriodDuration, 10);

    if (isNaN(cycle) || cycle < 15 || cycle > 60) {
      setError('Default cycle length must be between 15 and 60 days.');
      return;
    }

    if (isNaN(period) || period < 1 || period > 15) {
      setError('Default period duration must be between 1 and 15 days.');
      return;
    }

    setSaving(true);
    try {
      const res = await updateSettings({
        featureEnabled,
        defaultCycleLength: cycle,
        defaultPeriodDuration: period,
      });
      setSettings(res.settings);
      if (onFeatureStateChange) {
        onFeatureStateChange(res.settings.featureEnabled);
      }
      showNotification('Settings updated successfully. Changes propagate across active backend clusters in ~10 seconds.');
    } catch (err) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
        <RefreshCw className="animate-spin" size={28} style={{ margin: '0 auto 12px' }} />
        <p>Loading platform settings...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Feature Switch & Default Cycle Settings</h1>
          <p className="page-subtitle">
            Global emergency switches and baseline cycle parameters for new users
          </p>
        </div>

        <button className="btn btn-secondary" onClick={loadSettings} disabled={loading || saving}>
          <RefreshCw size={15} />
          <span>Reload</span>
        </button>
      </div>

      {/* Notifications */}
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

      <form onSubmit={handleSave}>
        {/* 1. Master Feature Switch Card */}
        <div
          className="card"
          style={{
            marginBottom: '24px',
            borderColor: featureEnabled ? 'var(--border)' : '#fca5a5',
            background: featureEnabled ? 'var(--surface)' : '#fff5f5',
          }}
        >
          <div className="card-header" style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-md)',
                  background: featureEnabled ? 'var(--success-bg)' : 'var(--danger-bg)',
                  color: featureEnabled ? 'var(--success-text)' : 'var(--danger-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Power size={18} />
              </div>
              <div>
                <h3 className="card-title" style={{ fontSize: '1.05rem' }}>
                  HerCare Master Feature Switch
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Controls whether HerCare endpoints and screens are available in the mobile app
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <label className="switch-control">
              <input
                type="checkbox"
                checked={featureEnabled}
                onChange={handleFeatureToggle}
                disabled={saving}
              />
              <span className="switch-slider"></span>
            </label>
          </div>

          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: featureEnabled ? 'var(--surface-alt)' : '#fee2e2',
              fontSize: '0.86rem',
              color: featureEnabled ? 'var(--text-main)' : '#991b1b',
              lineHeight: '1.5',
            }}
          >
            {featureEnabled ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} color="#059669" />
                <span>
                  <strong>Feature is currently ACTIVE.</strong> All mobile users can track periods,
                  log symptoms, mark checklist items, and receive reminders.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertTriangle size={16} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span>
                  <strong>Feature is currently DISABLED.</strong> Every user screen in the mobile app
                  will return <code>FEATURE_DISABLED</code>. Users retain the ability to export or
                  permanently erase their data.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Default Cycle & Period Defaults */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 className="card-title">
              <Calendar size={18} color="var(--primary)" />
              <span>Cycle Prediction Baseline Defaults</span>
            </h3>
          </div>

          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
            These values are used as initial defaults for newly registered users before they customize
            their own cycle lengths in app settings or log multiple periods.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            {/* Default Cycle Length */}
            <div className="form-group">
              <label className="form-label">
                Default Cycle Length (Days) <span className="required">*</span>
              </label>
              <input
                type="number"
                className="form-input"
                min={15}
                max={60}
                value={defaultCycleLength}
                onChange={(e) => setDefaultCycleLength(e.target.value)}
                disabled={saving}
                required
              />
              <p className="form-hint">Accepted range: 15 to 60 days (standard default: 28 days).</p>
            </div>

            {/* Default Period Duration */}
            <div className="form-group">
              <label className="form-label">
                Default Period Duration (Days) <span className="required">*</span>
              </label>
              <input
                type="number"
                className="form-input"
                min={1}
                max={15}
                value={defaultPeriodDuration}
                onChange={(e) => setDefaultPeriodDuration(e.target.value)}
                disabled={saving}
                required
              />
              <p className="form-hint">Accepted range: 1 to 15 days (standard default: 5 days).</p>
            </div>
          </div>
        </div>

        {/* Server Propagation Footnote */}
        <div
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.84rem',
            color: 'var(--text-muted)',
          }}
        >
          <Clock size={16} />
          <span>
            Server Cache Notice: Changes to the feature switch or cycle defaults take effect across
            all backend server instances within <strong>10 seconds</strong>.
          </span>
        </div>

        {/* Save Button */}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving}
          style={{ padding: '12px 24px' }}
        >
          <Save size={16} />
          <span>{saving ? 'Saving Settings...' : 'Save Settings & Defaults'}</span>
        </button>
      </form>

      {/* Confirmation Modal when Disabling Feature */}
      <ConfirmModal
        isOpen={isDisableModalOpen}
        title="Disable HerCare Feature Platform-Wide?"
        message="Warning: Disabling HerCare will immediately pause period tracking, reminder notifications, and wellness tips across the entire mobile application. Users will see a 'FEATURE_DISABLED' banner on their screens. Are you sure you want to turn this off?"
        confirmText="Yes, Disable Feature"
        isDanger={true}
        onConfirm={confirmDisableFeature}
        onCancel={() => setIsDisableModalOpen(false)}
      />
    </div>
  );
}
