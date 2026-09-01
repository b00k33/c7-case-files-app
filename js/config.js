// Cloud endpoint for sync. This is the Book33 Supabase project — C7's
// tables live beside the personal planner's (her call, 2026-09-01), walled
// off in c7_-prefixed tables with owner-only row security. The publishable
// key is designed to be public; row security is what protects the data.
export const SUPABASE_URL = 'https://mqaswzpuqqlujfhooplm.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_gFBGAJ2dEPN78SEufKtWCw_D1IiDAuJ';

// C7 keeps its OWN auth session slot. Book33 (same origin, same Supabase
// project) stores its session under the default key — using that would
// entangle the two apps' sign-in state (signing out of one would sign out
// the other). Never share or write another app's storage keys.
export const AUTH_STORAGE_KEY = 'c7-sb-auth';
