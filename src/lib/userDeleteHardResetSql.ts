/** Tam migration metni — silme RLS/RPC yaması (Supabase SQL editörüne yapıştırılır). */
import sql from '../../supabase/migrations/20260504120000_profiles_delete_match_turkish_role_names.sql?raw';

export const USER_DELETE_HARD_RESET_SQL = sql as string;
