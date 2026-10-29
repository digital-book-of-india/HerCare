import React, { useState, useEffect } from 'react';
import {
  listTips,
  createTip,
  updateTip,
  reviewTip,
  setActiveTip,
  deleteTip
} from '../services/api';
import { getTipStatus, formatDate } from '../utils/formatters';
import TipModal from '../components/TipModal';
import ReviewModal from '../components/ReviewModal';
import ConfirmModal from '../components/ConfirmModal';
import {
  Sparkles,
  Plus,
  Filter,
  Stethoscope,
  Trash2,
  Edit2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Utensils,
  Footprints
} from 'lucide-react';

export default function TipsPage() {
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // 'reviewed_false', 'active_true', ''

  // Modals state
  const [isTipModalOpen, setIsTipModalOpen] = useState(false);
  const [editingTip, setEditingTip] = useState(null);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewingTip, setReviewingTip] = useState(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingTip, setDeletingTip] = useState(null);

  const [modalLoading, setModalLoading] = useState(false);

  const loadTips = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter === 'reviewed_false') params.reviewed = false;
      if (statusFilter === 'active_true') params.active = true;

      const res = await listTips(params);
      setTips(res.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load tips catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTips();
  }, [categoryFilter, statusFilter]);

  const showNotification = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // 1. Create or Update Tip
  const handleSaveTip = async (formData) => {
    setModalLoading(true);
    setError(null);
    try {
      if (editingTip) {
        const res = await updateTip(editingTip.id, formData);
        setIsTipModalOpen(false);
        setEditingTip(null);
        showNotification(
          res.reviewReset
            ? 'Tip updated! Content was modified, so clinical review was reset and the tip was taken offline.'
            : 'Tip updated successfully!'
        );
      } else {
        await createTip(formData);
        setIsTipModalOpen(false);
        showNotification('Tip created as Draft. It remains offline until clinically reviewed and activated.');
      }
      loadTips();
    } catch (err) {
      if (err.code === 'CONFLICT' || err.status === 409) {
        setError('A tip with this title already exists in this category.');
      } else {
        setError(err.message || 'Failed to save tip');
      }
    } finally {
      setModalLoading(false);
    }
  };

  // 2. Record Review
  const handleRecordReview = async (reviewData) => {
    if (!reviewingTip) return;
    setModalLoading(true);
    setError(null);
    try {
      await reviewTip(reviewingTip.id, reviewData);
      setIsReviewModalOpen(false);
      setReviewingTip(null);
      showNotification(`Clinical review recorded for "${reviewingTip.title}". You can now activate this tip.`);
      loadTips();
    } catch (err) {
      setError(err.message || 'Failed to record clinical review');
    } finally {
      setModalLoading(false);
    }
  };

  // 3. Toggle Activation
  const handleToggleActive = async (tip) => {
    const nextState = !tip.active;

    // Safety check on client side per clinical rule
    if (nextState && !tip.reviewedAt) {
      setError(`Cannot activate "${tip.title}": Clinical review must be recorded before a tip can go live.`);
      return;
    }

    try {
      await setActiveTip(tip.id, nextState);
      showNotification(nextState ? `"${tip.title}" is now LIVE in the mobile app.` : `"${tip.title}" has been taken offline.`);
      loadTips();
    } catch (err) {
      if (err.code === 'TIP_NOT_REVIEWED' || err.status === 409) {
        setError('A tip must be reviewed by a clinician before it can be activated.');
      } else {
        setError(err.message || 'Failed to update activation status');
      }
    }
  };

  // 4. Delete Tip
  const handleDeleteConfirm = async () => {
    if (!deletingTip) return;
    setModalLoading(true);
    try {
      await deleteTip(deletingTip.id);
      setIsDeleteModalOpen(false);
      setDeletingTip(null);
      showNotification('Tip deleted permanently.');
      loadTips();
    } catch (err) {
      setError(err.message || 'Failed to delete tip');
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Wellness Tips Management</h1>
          <p className="page-subtitle">
            Curate evidence-based food & activity guidance with clinical review enforcement
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingTip(null);
            setIsTipModalOpen(true);
          }}
        >
          <Plus size={16} />
          <span>Write New Tip</span>
        </button>
      </div>

      {/* Clinical Workflow Guide Banner */}
      <div className="workflow-stepper">
        <div className="step-item">
          <span className="step-number">1</span>
          <span>Draft (Hidden)</span>
        </div>
        <ArrowRight size={14} className="step-arrow" />
        <div className="step-item">
          <span className="step-number" style={{ background: '#059669' }}>2</span>
          <span>Clinician Review</span>
        </div>
        <ArrowRight size={14} className="step-arrow" />
        <div className="step-item">
          <span className="step-number" style={{ background: 'var(--primary)' }}>3</span>
          <span>Activate Tip</span>
        </div>
        <ArrowRight size={14} className="step-arrow" />
        <div className="step-item" style={{ color: '#047857' }}>
          <CheckCircle2 size={16} />
          <span>Live in App</span>
        </div>
      </div>

      {/* Notifications / Errors */}
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

      {/* Filter Bar */}
      <div
        className="card"
        style={{
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
            <Filter size={15} />
            <span>Filters:</span>
          </div>

          {/* Category Filter */}
          <select
            className="form-select"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.84rem' }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            <option value="food">Food & Nutrition</option>
            <option value="activity">Activity & Movement</option>
          </select>

          {/* Status Filter */}
          <select
            className="form-select"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.84rem' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="reviewed_false">Waiting for Review</option>
            <option value="active_true">Live in Mobile App</option>
          </select>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={loadTips}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tips Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 10px' }} />
          <p>Loading tips...</p>
        </div>
      ) : tips.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
          <Sparkles size={32} style={{ margin: '0 auto 12px', color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '6px' }}>No tips match your filter</h3>
          <p style={{ fontSize: '0.88rem', marginBottom: '16px' }}>Write a new tip or reset the filters above.</p>
          <button className="btn btn-primary btn-sm" onClick={() => { setCategoryFilter(''); setStatusFilter(''); }}>
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Tip Title & Category</th>
                <th style={{ width: '30%' }}>Guidance Content</th>
                <th style={{ width: '12%' }}>Shows When</th>
                <th style={{ width: '15%' }}>Clinical Status</th>
                <th style={{ width: '18%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tips.map((tip) => {
                const status = getTipStatus(tip);
                const isFood = tip.category === 'food';
                return (
                  <tr key={tip.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: 'var(--radius-sm)',
                            background: isFood ? '#fef3c7' : '#e0f2fe',
                            color: isFood ? '#b45309' : '#0369a1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {isFood ? <Utensils size={14} /> : <Footprints size={14} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{tip.title}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                            {tip.category}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--text-muted)',
                          lineHeight: '1.4',
                          maxHeight: '3.8em',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {tip.text}
                      </div>
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: tip.showWhen === 'period' ? 'var(--primary-light)' : 'var(--surface-alt)',
                          color: tip.showWhen === 'period' ? 'var(--primary)' : 'var(--text-muted)',
                        }}
                      >
                        {tip.showWhen === 'period' ? 'During Period' : 'Always'}
                      </span>
                    </td>

                    <td>
                      <div>
                        <span className={`badge ${status.class}`}>
                          {status.label}
                        </span>
                        {tip.reviewedAt && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            By {tip.reviewedBy || 'Clinician'} on {formatDate(tip.reviewedAt)}
                          </div>
                        )}
                        {!tip.reviewedAt && (
                          <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '4px' }}>
                            Review required
                          </div>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {/* Record Review Button */}
                        <button
                          className="btn btn-outline btn-sm"
                          title="Record Clinical Review"
                          onClick={() => {
                            setReviewingTip(tip);
                            setIsReviewModalOpen(true);
                          }}
                        >
                          <Stethoscope size={13} color="#047857" />
                          <span>Review</span>
                        </button>

                        {/* Activate / Live Toggle Button */}
                        <button
                          className={`btn btn-sm ${tip.active ? 'btn-secondary' : 'btn-outline'}`}
                          title={!tip.reviewedAt ? 'A clinician must review this tip before it can go live' : tip.active ? 'Take offline' : 'Make live'}
                          disabled={!tip.reviewedAt && !tip.active}
                          onClick={() => handleToggleActive(tip)}
                          style={{
                            color: tip.active ? '#dc2626' : tip.reviewedAt ? '#059669' : 'var(--text-subtle)',
                            borderColor: tip.active ? '#fca5a5' : tip.reviewedAt ? '#a7f3d0' : 'var(--border)',
                          }}
                        >
                          {tip.active ? 'Deactivate' : 'Go Live'}
                        </button>

                        {/* Edit Button */}
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Edit Tip"
                          onClick={() => {
                            setEditingTip(tip);
                            setIsTipModalOpen(true);
                          }}
                        >
                          <Edit2 size={13} />
                        </button>

                        {/* Delete Button */}
                        <button
                          className="btn btn-outline-danger btn-sm"
                          title="Delete Tip Permanently"
                          onClick={() => {
                            setDeletingTip(tip);
                            setIsDeleteModalOpen(true);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tip Create/Edit Modal */}
      <TipModal
        isOpen={isTipModalOpen}
        tip={editingTip}
        onClose={() => {
          setIsTipModalOpen(false);
          setEditingTip(null);
        }}
        onSave={handleSaveTip}
        loading={modalLoading}
      />

      {/* Record Review Modal */}
      <ReviewModal
        isOpen={isReviewModalOpen}
        tip={reviewingTip}
        onClose={() => {
          setIsReviewModalOpen(false);
          setReviewingTip(null);
        }}
        onRecordReview={handleRecordReview}
        loading={modalLoading}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="Delete Wellness Tip"
        message={`Are you sure you want to permanently delete "${deletingTip?.title}"? This action cannot be undone.`}
        confirmText="Delete Tip"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setDeletingTip(null);
        }}
        loading={modalLoading}
      />
    </div>
  );
}
