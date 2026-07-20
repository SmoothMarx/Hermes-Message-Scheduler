export const API_BASE = '/api';

export const fetchApi = async (path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers || {});

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
      } else if (errData.detail) {
        errMessage = Array.isArray(errData.detail)
          ? errData.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
          : errData.detail;
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
