/**
 * HerCare Admin API Client
 * Manages communication with /api/admin/* endpoints with authentication headers and robust error normalization.
 */

const API_BASE = '/api/admin';

// In-session token management per security recommendation
export const getToken = () => {
  return sessionStorage.getItem('hercare_admin_token');
};

export const setToken = (token) => {
  if (token) {
    sessionStorage.setItem('hercare_admin_token', token);
  } else {
    sessionStorage.removeItem('hercare_admin_token');
  }
};

export const clearToken = () => {
  sessionStorage.removeItem('hercare_admin_token');
};

/**
 * Common request wrapper
 */
async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (response.status === 401) {
    clearToken();
    // Dispatch auth expiration event
    window.dispatchEvent(new CustomEvent('hercare:auth-expired'));
  }

  let json = null;
  try {
    json = await response.json();
  } catch (e) {
    // If not json
    json = { success: false, message: response.statusText };
  }

  if (!response.ok || json?.success === false) {
    const error = new Error(json?.error?.message || json?.message || 'Request failed');
    error.status = response.status;
    error.code = json?.error?.code || 'UNKNOWN_ERROR';
    error.details = json?.error?.details || [];
    throw error;
  }

  return json.data;
}

// -------------------------------------------------------------
// 1. Authentication
// -------------------------------------------------------------
export const login = async (identifier, password) => {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
  if (data?.token) {
    setToken(data.token);
  }
  return data;
};

export const getMe = async () => {
  return request('/me');
};

// -------------------------------------------------------------
// 2. Dashboard
// -------------------------------------------------------------
export const getDashboard = async () => {
  return request('/dashboard');
};

// -------------------------------------------------------------
// 3. Tips Management
// -------------------------------------------------------------
export const listTips = async (params = {}) => {
  const query = new URLSearchParams();
  if (params.category) query.append('category', params.category);
  if (params.active !== undefined && params.active !== '') query.append('active', params.active);
  if (params.reviewed !== undefined && params.reviewed !== '') query.append('reviewed', params.reviewed);
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);

  const qs = query.toString();
  return request(`/tips${qs ? `?${qs}` : ''}`);
};

export const getTip = async (id) => {
  return request(`/tips/${id}`);
};

export const createTip = async ({ category, title, text, showWhen }) => {
  return request('/tips', {
    method: 'POST',
    body: JSON.stringify({ category, title, text, showWhen }),
  });
};

export const updateTip = async (id, patch) => {
  return request(`/tips/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
};

export const reviewTip = async (id, { reviewedBy, reviewedAt }) => {
  return request(`/tips/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ reviewedBy, reviewedAt }),
  });
};

export const setActiveTip = async (id, active) => {
  return request(`/tips/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
};

export const deleteTip = async (id) => {
  return request(`/tips/${id}`, {
    method: 'DELETE',
  });
};

// -------------------------------------------------------------
// 4. Default Content & Checklist
// -------------------------------------------------------------
export const getContent = async () => {
  return request('/content');
};

export const updateContent = async (patch) => {
  return request('/content', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
};

// -------------------------------------------------------------
// 5. Settings & Feature Switch
// -------------------------------------------------------------
export const getSettings = async () => {
  return request('/settings');
};

export const updateSettings = async (patch) => {
  return request('/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
};
