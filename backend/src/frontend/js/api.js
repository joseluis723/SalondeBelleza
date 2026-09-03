const API = (() => {
  const BASE = '/api';

  function getToken() {
    return localStorage.getItem('salon_token');
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (res.status === 401) {
      localStorage.removeItem('salon_token');
      localStorage.removeItem('salon_user');
      window.location.reload();
      throw new Error('No autenticado');
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const message = (data && data.error) ? data.error : 'Ocurrió un error inesperado.';
      throw new Error(message);
    }
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path),
    getToken
  };
})();
