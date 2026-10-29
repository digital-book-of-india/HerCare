import React, { useState, useEffect } from 'react';
import { getDashboard } from '../services/api';
import {
  Users,
  Calendar,
  Activity,
  CheckSquare,
  Droplets,
  Bell,
  Sparkles,
  RefreshCw,
  Shield,
  Clock,
  AlertCircle,
  Power
} from 'lucide-react';

export default function DashboardPage({ onNavigateToTips, onNavigateToSettings }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const stats = await getDashboard();
      setData(stats);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const renderValue = (val) => {
    if (val === '<5') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span>&lt;5</span>
          <span className="stat-privacy-badge">Masked</span>
        </span>
      );
    }
    return val !== undefined && val !== null ? val : '—';
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard Overview</h1>
            <p className="page-subtitle">Real-time aggregate platform statistics</p>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin" size={28} style={{ margin: '0 auto 12px' }} />
          <p>Loading aggregate platform numbers...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">
            Aggregate usage and health logging totals &bull; Generated{' '}
            {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : 'now'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => loadData(true)}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Numbers'}</span>
          </button>
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="privacy-banner">
        <Shield size={20} className="privacy-banner-icon" />
        <div style={{ flex: 1 }}>
          <strong>Privacy Enforced:</strong> {data?.privacyNote || 'Aggregates only. Counts of 1 to 4 are shown as "<5" to protect individual identity.'}
          <div style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: '2px' }}>
            The admin backend strictly returns no personal period dates, symptom notes, or individual identifiers.
          </div>
        </div>
      </div>

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
          <span>{error}</span>
        </div>
      )}

      {/* Feature Status Card */}
      <div
        className="card"
        style={{
          marginBottom: '24px',
          borderLeft: `4px solid ${data?.feature?.enabled ? '#10b981' : '#ef4444'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: data?.feature?.enabled ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: data?.feature?.enabled ? 'var(--success-text)' : 'var(--danger-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Power size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
              HerCare Feature Status: {data?.feature?.enabled ? 'Online & Available' : 'Offline / Disabled'}
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              {data?.feature?.enabled
                ? 'All mobile endpoints are active and accessible to users.'
                : 'Users will see FEATURE_DISABLED across all app screens.'}
            </div>
          </div>
        </div>

        <button
          className="btn btn-outline btn-sm"
          onClick={onNavigateToSettings}
        >
          Manage Settings & Defaults
        </button>
      </div>

      {/* Group 1: Users */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          User Engagement
        </h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon primary">
              <Users size={22} />
            </div>
            <div className="stat-details">
              <div className="stat-label">Total Users</div>
              <div className="stat-value">{renderValue(data?.users?.total)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Ever logged records in HerCare
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon info">
              <Clock size={22} />
            </div>
            <div className="stat-details">
              <div className="stat-label">Active (Last 7 Days)</div>
              <div className="stat-value">{renderValue(data?.users?.activeLast7Days)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Activity recorded in past week
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon success">
              <Activity size={22} />
            </div>
            <div className="stat-details">
              <div className="stat-label">Active (Last 30 Days)</div>
              <div className="stat-value">{renderValue(data?.users?.activeLast30Days)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Monthly active tracking users
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Group 2: Logged Records */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Logged Wellness Records
        </h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon primary">
              <Calendar size={22} />
            </div>
            <div className="stat-details">
              <div className="stat-label">Period Cycles Logged</div>
              <div className="stat-value">{renderValue(data?.records?.periods)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Non-deleted period entries
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon warning">
              <Activity size={22} />
            </div>
            <div className="stat-details">
              <div className="stat-label">Symptom Logs</div>
              <div className="stat-value">{renderValue(data?.records?.symptomLogs)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Flow, mood, cramps & energy marks
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon success">
              <CheckSquare size={22} />
            </div>
            <div className="stat-details">
              <div className="stat-label">Checklist Tasks Done</div>
              <div className="stat-value">{renderValue(data?.records?.checklistItemsCompleted)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Self-care daily tasks checked off
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon info">
              <Droplets size={22} />
            </div>
            <div className="stat-details">
              <div className="stat-label">Hydration Marks</div>
              <div className="stat-value">{renderValue(data?.records?.hydrationRemindersDone)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Glasses of water tracked
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Group 3: Reminders & Tips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Active Reminders Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Bell size={18} color="var(--primary)" />
              <span>Active User Reminders</span>
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Period Notifications</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{renderValue(data?.activeReminders?.period)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Daily Health Log Prompts</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{renderValue(data?.activeReminders?.daily_log)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Hydration Reminders</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{renderValue(data?.activeReminders?.hydration)}</span>
            </div>
          </div>
        </div>

        {/* Tips Summary Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Sparkles size={18} color="var(--primary)" />
              <span>Tips Clinical Workflow</span>
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={onNavigateToTips}>
              Manage Tips
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Total Tips In Catalog</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{data?.tips?.total ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--success-text)' }}>Live in Mobile App</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--success-text)' }}>{data?.tips?.active ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--warning-text)' }}>Awaiting Clinical Review</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--warning-text)' }}>{data?.tips?.awaitingReview ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
