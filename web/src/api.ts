export const API_BASE = '/api/plugins/scheduled-messages';

export const fetchApi = async (path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers || {});
  
  if (window.__HERMES_SESSION_TOKEN__) {
    headers.set('Authorization', `Bearer ${window.__HERMES_SESSION_TOKEN__}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMessage = `API Error: ${res.status}`;
    try {
      const errData = await res.json();
      if (errData.error_code) {
        errMessage = errData.message || errData.error_code;
      } else if (errData.error) {
        errMessage = errData.error;
      }
    } catch {
      // Not JSON
    }
    throw new Error(errMessage);
  }

  return res.json();
};
