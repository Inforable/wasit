export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
export function createApi({
  fetcher = (...args) => fetch(...args),
  getCsrfToken = () => null,
  getBearerToken = () => null,
  provider = false,
  onUnauthorized = () => {
    if (provider) return;
    window.dispatchEvent(new Event('wasit:unauthorized'));
    if (window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  },
} = {}) {
  return async function api(path, { method = 'GET', body, signal } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('API requests must use a local /api/ path.');
    if (provider && !path.startsWith('/api/provider/')) throw new Error('Provider tokens are restricted to provider endpoints.');
    method = method.toUpperCase();
    const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
    if (provider) {
      const token = getBearerToken();
      if (token) headers.Authorization = 'Bearer ' + token;
    } else if (!['GET', 'HEAD'].includes(method)) {
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    const response = await fetcher(path, {
      method, credentials: provider ? 'omit' : 'same-origin', signal, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.status === 401) onUnauthorized();
    if (!response.ok) throw new ApiError(response.status, data?.error ?? 'request_failed', data?.message ?? 'The request could not be completed.');
    return data;
  };
}
export const api = createApi();
export const createProviderApi = (options = {}) => createApi({ ...options, provider: true });
