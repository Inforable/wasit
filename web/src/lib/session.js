import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createApi } from './api.js';

export function useSession() {
  const [profile, setProfile] = useState(null), [profileLoading, setProfileLoading] = useState(false), [profileError, setProfileError] = useState(null);
  const [session, setSession] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(null);
  const current = useRef(null), pending = useRef(null), mounted = useRef(true), authRevision = useRef(0), authAttempt = useRef(0), loadedProfileActor = useRef(null), profileRequest = useRef(null), initialRead = useRef(null);
  const api = useMemo(() => {
    const transport = createApi({ getCsrfToken: () => current.current?.csrf_token ?? null, onUnauthorized: () => {} });
    return async (path, options) => {
      const method = options?.method?.toUpperCase() ?? 'GET';
      const authenticating = method === 'POST' && ['/api/auth/login', '/api/auth/register', '/api/demo/session'].includes(path);
      const signingOut = method === 'POST' && path === '/api/auth/logout';
      const actorAtStart = current.current?.actor_id, revisionAtStart = authRevision.current, attempt = authenticating || signingOut ? ++authAttempt.current : null;
      let value;
      try { value = await transport(path, options); }
      catch (reason) {
        if (reason.status === 401 && !authenticating && actorAtStart === current.current?.actor_id && revisionAtStart === authRevision.current) {
          authRevision.current++; current.current = null; loadedProfileActor.current = null; profileRequest.current?.controller.abort();
          if (mounted.current) { setSession(null); setProfile(null); setProfileLoading(false); setProfileError(null); setLoading(false); }
        }
        throw reason;
      }
      if ((authenticating || signingOut) && attempt !== authAttempt.current) return value;
      if (authenticating || signingOut) authRevision.current++;
      if (authenticating) {
        const user = value.user ?? (current.current?.actor_id === value.actor_id ? current.current.user : null);
        if (current.current?.actor_id !== value.actor_id) {
          loadedProfileActor.current = null; profileRequest.current?.controller.abort();
          if (mounted.current) { setProfile(null); setProfileLoading(true); setProfileError(null); }
        }
        current.current = { ...value, user };
        if (mounted.current) { setSession(current.current); setError(null); }
      }
      if (signingOut) {
        current.current = null; loadedProfileActor.current = null; profileRequest.current?.controller.abort();
        if (mounted.current) { setSession(null); setProfile(null); setProfileLoading(false); setProfileError(null); setLoading(false); }
      }
      if (path === '/api/profile' && mounted.current && actorAtStart === current.current?.actor_id && revisionAtStart === authRevision.current) {
        loadedProfileActor.current = actorAtStart; setProfile(value); setProfileError(null);
        if (method === 'PUT') {
          setProfileLoading(false);
          if (current.current?.user) { current.current = { ...current.current, user: { ...current.current.user, display_name: value.display_name } }; setSession(current.current); }
        }
      }
      return value;
    };
  }, []);
  const bootstrap = useCallback(async () => {
    if (pending.current) return pending.current;
    if (mounted.current) { setLoading(true); setError(null); }
    pending.current = api('/api/demo/session', { method: 'POST', body: {} }).catch(reason => { if (mounted.current) setError(reason.message); throw reason; }).finally(() => { pending.current = null; if (mounted.current) setLoading(false); });
    return pending.current;
  }, [api]);
  const logout = useCallback(() => api('/api/auth/logout', { method: 'POST', body: {} }), [api]);
  const login = useCallback(body => api('/api/auth/login', { method: 'POST', body }), [api]);
  const register = useCallback(body => api('/api/auth/register', { method: 'POST', body }), [api]);
  useEffect(() => {
    mounted.current = true; let alive = true; const revision = authRevision.current;
    if (!initialRead.current) {
      const controller = new AbortController();
      initialRead.current = { controller, subscribers: 0, promise: api('/api/auth/session', { signal: controller.signal }) };
    }
    const request = initialRead.current; request.subscribers++;
    request.promise.then(result => {
      if (!alive || !mounted.current || request.controller.signal.aborted || revision !== authRevision.current) return;
      if (result?.user?.role === 'consumer' && result.actor_id) {
        const { profile: restoredProfile, ...restored } = result;
        current.current = restored; loadedProfileActor.current = restored.actor_id;
        setProfile(restoredProfile ?? null); setProfileError(null); setProfileLoading(false); setSession(restored);
      }
    }).catch(reason => { if (reason.name !== 'AbortError' && alive && mounted.current && revision === authRevision.current) setError(reason.message); }).finally(() => { if (alive && mounted.current && !request.controller.signal.aborted && revision === authRevision.current) setLoading(false); });
    return () => {
      alive = false; mounted.current = false; request.subscribers--;
      queueMicrotask(() => { if (!request.subscribers) { request.controller.abort(); profileRequest.current?.controller.abort(); } });
    };
  }, [api]);
  const refreshProfile = useCallback(() => {
    const actorId = current.current?.actor_id, revision = authRevision.current;
    if (!actorId) return Promise.resolve(null);
    if (profileRequest.current?.actorId === actorId && profileRequest.current.revision === revision) return profileRequest.current.promise;
    profileRequest.current?.controller.abort(); const controller = new AbortController();
    if (mounted.current) { setProfileLoading(true); setProfileError(null); }
    const promise = api('/api/profile', { signal: controller.signal }).catch(reason => { if (reason.name !== 'AbortError' && mounted.current && current.current?.actor_id === actorId && authRevision.current === revision) setProfileError(reason.message); throw reason; }).finally(() => {
      if (profileRequest.current?.promise === promise) profileRequest.current = null;
      if (mounted.current && current.current?.actor_id === actorId && authRevision.current === revision) setProfileLoading(false);
    });
    profileRequest.current = { actorId, revision, controller, promise }; return promise;
  }, [api]);
  useEffect(() => {
    if (!session?.actor_id) { setProfile(null); setProfileLoading(false); return; }
    if (loadedProfileActor.current === session.actor_id) { setProfileLoading(false); return; }
    refreshProfile().catch(() => {});
  }, [refreshProfile, session]);
  return { session, profile, profileLoading, profileError, refreshProfile, api, bootstrap, login, register, logout, loading, error };
}
