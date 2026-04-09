import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdminAuth, ok, err } from "@/lib/api";
import JSZip from "jszip";

// File categories inferred from path patterns
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

// Remove the top-level directory that GitHub/zip exports prepend
// e.g. "repo-main/src/entities/user.ts" → "src/entities/user.ts"
function stripZipRoot(filePath: string): string {
  const parts = filePath.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : filePath;
}

// POST /api/apps/[id]/files — upload a zip of entity files (admin/superadmin only)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) return auth.response;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return err("No file uploaded", 400);
  if (!file.name.endsWith(".zip")) return err("Only .zip files are accepted", 400);

  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // Replace existing files — delete storage objects and db rows first
  const { data: existingFiles } = await supabase
    .from("app_files")
    .select("storage_path")
    .eq("app_id", params.id);

  if (existingFiles?.length) {
    await supabase.storage.from("entity-files").remove(existingFiles.map((f) => f.storage_path));
    await supabase.from("app_files").delete().eq("app_id", params.id);
  }

  const uploaded: Array<{ file_path: string; storage_path: string; category: string }> = [];

  for (const [zipPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;

    const filePath = stripZipRoot(zipPath);
    if (!filePath) continue;

    const category = categorize(filePath);
    if (!category) continue; // only keep recognised entity/model files

    const content = await entry.async("uint8array");
    const storagePath = `${params.id}/${filePath}`;

    const { error } = await supabase.storage
      .from("entity-files")
      .upload(storagePath, content, { upsert: true, contentType: "text/plain" });

    if (error) continue;

    uploaded.push({ file_path: filePath, storage_path: storagePath, category });
  }

  if (uploaded.length === 0) {
    return err(
      "No entity/model files found in the zip. Expected TypeORM .entity.ts, Prisma schema.prisma, etc.",
      400
    );
  }

  const { error: dbError } = await supabase
    .from("app_files")
    .insert(uploaded.map((f) => ({ ...f, app_id: params.id })));

  if (dbError) return err(dbError.message, 500);
  return ok({ uploaded: uploaded.length, files: uploaded });
}
