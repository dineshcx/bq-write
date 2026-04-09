import { supabase } from "@/lib/supabase";
import { getSuperAdminAuth, ok, err } from "@/lib/api";

// GET /api/admin/users — list all users (superadmin only)
export async function GET() {
  const auth = await getSuperAdminAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, role, created_at, last_login_at")
    .order("created_at", { ascending: false });

  if (error) return err(error.message, 500);
  return ok({ users: data });
}
