import React from 'react';
import {
  HeartHandshake,
  LayoutDashboard,
  Sparkles,
  FileText,
  Sliders,
  LogOut,
  ShieldCheck,
  Power
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, adminEmail, onLogout, featureEnabled }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tips', label: 'Tips Management', icon: Sparkles },
    { id: 'content', label: 'Default Content', icon: FileText },
    { id: 'settings', label: 'Feature & Settings', icon: Sliders },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Brand */}
        <div className="brand">
          <div className="brand-icon">
            <HeartHandshake size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="brand-title">HerCare</span>
              <span className="brand-badge">Admin</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`nav-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right side controls */}
        <div className="nav-actions">
          {/* Feature status tag */}
          <span
            className={`badge ${featureEnabled ? 'live' : 'danger'}`}
            style={{ fontSize: '0.74rem' }}
            title={featureEnabled ? 'HerCare feature is active for all users' : 'HerCare feature is currently turned off'}
          >
            <Power size={12} />
            {featureEnabled ? 'App Active' : 'App Disabled'}
          </span>

          {/* Admin Email */}
          <div className="admin-email-tag">
            <ShieldCheck size={14} style={{ color: '#047857' }} />
            <span>{adminEmail || 'admin'}</span>
          </div>

          {/* Logout Button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={onLogout}
            title="Sign out of HerCare Admin"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
