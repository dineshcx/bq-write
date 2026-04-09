import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdminAuth, ok, err } from "@/lib/api";

// DELETE /api/apps/[id]/members/[userId] — remove a member from an app (admin/superadmin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) return auth.response;

  const { error } = await supabase
    .from("app_members")
    .delete()
    .eq("app_id", params.id)
    .eq("user_id", params.userId);

  if (error) return err(error.message, 500);
  return ok({ ok: true });
}
