import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export type UserRole = "member" | "admin" | "superadmin";

export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  google_id: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface DbApp {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAppDataset {
  id: string;
  app_id: string;
  label: string;
  gcp_project_id: string;
  dataset_id: string;
  created_at: string;
}

export interface DbAppFile {
  id: string;
  app_id: string;
  file_path: string;
  storage_path: string;
  category: string | null;
  created_at: string;
}
