// Precense browser auth — thin wrapper over Supabase JS.
// Loaded on landing + app. Fetches config from /api/config, then exposes window.precenseAuth.

(function () {
  let clientPromise = null;

  async function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      const [cfgRes, sdk] = await Promise.all([
        fetch('/api/config').then((r) => r.json()),
        import('https://esm.sh/@supabase/supabase-js@2.58.0'),
      ]);
      if (!cfgRes.supabase_url || !cfgRes.supabase_anon_key) {
        throw new Error('Supabase config missing on server');
      }
      const client = sdk.createClient(cfgRes.supabase_url, cfgRes.supabase_anon_key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'precense.auth',
        },
      });
      return client;
    })();
    return clientPromise;
  }

  async function getSession() {
    const c = await getClient();
    const { data } = await c.auth.getSession();
    return data.session || null;
  }

  async function signInWith(provider) {
    const c = await getClient();
    const { error } = await c.auth.signInWithOAuth({
      provider, // 'google' | 'apple'
      options: {
        redirectTo: `${window.location.origin}/app/`,
      },
    });
    if (error) throw error;
  }

  async function signOut() {
    const c = await getClient();
    await c.auth.signOut();
    window.location.href = '/';
  }

  async function fetchUserData() {
    const session = await getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch('/api/user-data', { headers });
    return res.json();
  }

  async function linkTelegramHandle(handle) {
    const c = await getClient();
    const { data, error } = await c.rpc('link_telegram_handle', {
      p_handle: handle,
      p_email: (await c.auth.getUser()).data.user?.email || null,
    });
    if (error) throw error;
    return data;
  }

  async function ensureAuthUserRow() {
    const c = await getClient();
    const {
      data: { user },
    } = await c.auth.getUser();
    if (!user) return null;
    const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.user_metadata?.name?.split(' ')[0] || null;
    const { data, error } = await c.rpc('ensure_auth_user_row', {
      p_email: user.email || null,
      p_first_name: firstName,
    });
    if (error) throw error;
    return data;
  }

  async function onAuthChange(cb) {
    const c = await getClient();
    c.auth.onAuthStateChange((event, session) => cb(event, session));
  }

  window.precenseAuth = {
    getClient,
    getSession,
    signInWith,
    signOut,
    fetchUserData,
    linkTelegramHandle,
    ensureAuthUserRow,
    onAuthChange,
  };
})();
