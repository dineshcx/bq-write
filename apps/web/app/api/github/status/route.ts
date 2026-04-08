import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  const { data } = await supabase
    .from("users")
    .select("github_access_token")
    .eq("email", session.user!.email!)
    .single();

  return NextResponse.json({ connected: !!data?.github_access_token });
}
