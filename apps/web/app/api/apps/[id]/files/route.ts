import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

// Patterns that identify entity/model/schema files
const ENTITY_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\.entity\.ts$/, category: "entity" },
  { pattern: /entities\/.*\.ts$/, category: "entity" },
  { pattern: /\.model\.ts$/, category: "model" },
  { pattern: /models\/.*\.ts$/, category: "model" },
  { pattern: /schema\.prisma$/, category: "schema" },
  { pattern: /\.schema\.ts$/, category: "schema" },
  { pattern: /schemas\/.*\.ts$/, category: "schema" },
  { pattern: /\.enum\.ts$/, category: "enum" },
  { pattern: /enums\/.*\.ts$/, category: "enum" },
  { pattern: /db\/schema\.rb$/, category: "schema" },
  { pattern: /app\/models\/.*\.rb$/, category: "model" },
  { pattern: /models\/.*\.go$/, category: "model" },
];

function categorize(filePath: string): string | null {
  for (const { pattern, category } of ENTITY_PATTERNS) {
    if (pattern.test(filePath)) return category;
  }
  return null;
}

function stripZipRoot(filePath: string): string {
  // Remove top-level directory that GitHub/zip exports add
  // e.g. "repo-main/src/entities/user.ts" → "src/entities/user.ts"
  const parts = filePath.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : filePath;
}

// POST /api/apps/[id]/files — upload zip of entity files (admin/superadmin)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "superadmin"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (!file.name.endsWith(".zip")) {
    return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // Delete existing files for this app first
  const { data: existingFiles } = await supabase
    .from("app_files")
    .select("storage_path")
    .eq("app_id", params.id);

  if (existingFiles && existingFiles.length > 0) {
    await supabase.storage
      .from("entity-files")
      .remove(existingFiles.map((f) => f.storage_path));
    await supabase.from("app_files").delete().eq("app_id", params.id);
  }

  const uploaded: Array<{ file_path: string; storage_path: string; category: string | null }> = [];

  for (const [zipPath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    const filePath = stripZipRoot(zipPath);
    if (!filePath) continue;

    const category = categorize(filePath);
    if (!category) continue; // skip non-entity files

    const content = await zipEntry.async("uint8array");
    const storagePath = `${params.id}/${filePath}`;

    const { error } = await supabase.storage
      .from("entity-files")
      .upload(storagePath, content, { upsert: true, contentType: "text/plain" });

    if (error) continue;

    uploaded.push({ file_path: filePath, storage_path: storagePath, category });
  }

  if (uploaded.length === 0) {
    return NextResponse.json(
      { error: "No entity/model files found in the zip. Expected TypeORM .entity.ts, Prisma schema, etc." },
      { status: 400 }
    );
  }

  const { error: dbError } = await supabase.from("app_files").insert(
    uploaded.map((f) => ({ ...f, app_id: params.id }))
  );

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ uploaded: uploaded.length, files: uploaded });
}
