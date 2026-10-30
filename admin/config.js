// Public client configuration for the admin. Nothing here is secret: the anon key is designed to
// be public, and every table is locked down by row-level security (only users in `admins` can read
// or write anything). Never put the service key here.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const config = local
  ? { supabaseUrl: `${location.origin}/supabase`, anonKey: 'dev', publicOrigin: location.origin }
  : { supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co', anonKey: 'YOUR-SUPABASE-ANON-KEY', publicOrigin: 'https://cc.braunf.com' };
