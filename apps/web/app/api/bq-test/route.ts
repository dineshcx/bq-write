import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { projectId, query } = (await req.json()) as {
    projectId: string;
    query: string;
  };

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const sql = query?.trim() || "SELECT 1 AS connected";

  try {
    const res = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: sql,
          useLegacySql: false,
          timeoutMs: 30000,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? "BigQuery request failed" },
        { status: res.status }
      );
    }

    // Flatten rows into plain objects using the schema
    const schema = data.schema?.fields ?? [];
    const rows = (data.rows ?? []).map((row: { f: { v: unknown }[] }) =>
      Object.fromEntries(
        row.f.map((cell, i) => [schema[i]?.name ?? `col${i}`, cell.v])
      )
    );

    return NextResponse.json({
      rows,
      totalRows: data.totalRows,
      jobComplete: data.jobComplete,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
