import React, { useState, useEffect } from 'react';
import { getMe, getToken, clearToken, getSettings } from './services/api';
import Navbar from './components/Navbar';
import SignInPage from './pages/SignInPage';
import DashboardPage from './pages/DashboardPage';
import TipsPage from './pages/TipsPage';
import TextsPage from './pages/TextsPage';
import SettingsPage from './pages/SettingsPage';
import { HeartHandshake } from 'lucide-react';

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [featureEnabled, setFeatureEnabled] = useState(true);

  // Check existing session
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await getMe();
        setAdmin(res.admin);
        // Also fetch initial feature state
        const settingsRes = await getSettings();
        if (settingsRes?.settings) {
          setFeatureEnabled(settingsRes.settings.featureEnabled);
        }
      } catch (err) {
        clearToken();
        setAdmin(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for 401 token expiration
    const handleAuthExpired = () => {
      clearToken();
      setAdmin(null);
    };
    window.addEventListener('hercare:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('hercare:auth-expired', handleAuthExpired);
  }, []);

  const handleLoginSuccess = (adminData) => {
    setAdmin(adminData);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    clearToken();
    setAdmin(null);
  };

  if (loading) {
    return (
      <div className="signin-wrapper">
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              background: 'var(--primary)',
              borderRadius: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              marginBottom: '12px',
            }}
          >
            <HeartHandshake size={24} />
          </div>
          <p style={{ fontWeight: 600 }}>Verifying HerCare admin session...</p>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!admin) {
    return <SignInPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Signed in dashboard shell
  return (
    <div className="app-layout">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        adminEmail={admin.email}
        onLogout={handleLogout}
        featureEnabled={featureEnabled}
      />

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <DashboardPage
            onNavigateToTips={() => setActiveTab('tips')}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}
        {activeTab === 'tips' && <TipsPage />}
        {activeTab === 'content' && <TextsPage />}
        {activeTab === 'settings' && (
          <SettingsPage onFeatureStateChange={(val) => setFeatureEnabled(val)} />
        )}
      </main>
    </div>
  );
}
