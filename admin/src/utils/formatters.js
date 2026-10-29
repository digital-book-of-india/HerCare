/**
 * Formatting and display helpers for HerCare Admin
 */

export function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    return isoString;
  }
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return isoString;
  }
}

/**
 * Returns user-friendly status badge info for Tips:
 * 1. Live (active === true)
 * 2. Reviewed, hidden (active === false, reviewedAt is present)
 * 3. Draft (active === false, reviewedAt is null)
 */
export function getTipStatus(tip) {
  if (tip.active) {
    return {
      label: 'Live',
      class: 'live',
      hint: 'Visible to users in the app',
    };
  }
  if (tip.reviewedAt) {
    return {
      label: 'Reviewed, hidden',
      class: 'reviewed',
      hint: 'Clinically approved, ready to activate',
    };
  }
  return {
    label: 'Draft',
    class: 'draft',
    hint: 'Needs clinical review before it can be activated',
  };
}
