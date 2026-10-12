// Public by design: the publishable key only lets a signed-in user reach their own rows (row-level security).
// Tests can point the page at another project by setting window.PCRM_CONFIG before load.
const o = (typeof window !== "undefined" && window.PCRM_CONFIG) || {};
export const SUPABASE_URL = o.url || "https://nwqpdknxazfeaxdxexry.supabase.co";
export const SUPABASE_KEY = o.key || "sb_publishable_pQfd836lWG23J6nIlUsGVA_gRhh94KW";
