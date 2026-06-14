import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Entry = {
  id: string;
  created_at: string;
  vorname: string;
  nachname: string;
  guests: string[] | null;
  total_persons: number;
  total_price: number;
  bezahlt: boolean;
  bezahlt_at: string | null;
  sitzwunsch?: string | null;
};
