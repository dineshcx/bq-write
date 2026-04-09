import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAppAuth, sseEvent, sseErr, SSE_HEADERS } from "@/lib/api";
import {
  runAgentTurn,
  buildSystemPrompt,
  readAppMemory,
  type Message,
  type ProgressEvent,
} from "@/lib/agent/runner";

// POST /api/apps/[id]/query — run an agent turn and stream the result via SSE
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth errors are returned as SSE events so the client stream handler can process them uniformly
  const auth = await getAppAuth(params.id);
  if (!auth.ok) return sseErr(auth.error, auth.status);

  const { datasetId, question, history } = (await req.json()) as {
    datasetId: string;
    question: string;
    history?: Message[];
  };

  if (!datasetId || !question?.trim()) {
    return sseErr("datasetId and question are required", 400);
  }

  const { data: dataset } = await supabase
    .from("app_datasets")
    .select("gcp_project_id, dataset_id")
    .eq("id", datasetId)
    .eq("app_id", params.id)
    .single();

  if (!dataset) return sseErr("Dataset not found", 404);

  const { data: files } = await supabase
    .from("app_files")
    .select("file_path, category")
    .eq("app_id", params.id)
    .order("file_path");

  const datasetRef = { projectId: dataset.gcp_project_id, datasetId: dataset.dataset_id };
  const memory = await readAppMemory(params.id);
  const systemPrompt = buildSystemPrompt(datasetRef, files ?? [], memory);
  const messages: Message[] = [...(history ?? []), { role: "user", content: question }];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(enc.encode(sseEvent(data)));

      try {
        const result = await runAgentTurn(messages, {
          appId: params.id,
          datasetRef,
          accessToken: auth.session.accessToken,
          systemPrompt,
          onProgress: (event: ProgressEvent) => send(event),
        });

        if (result.clarification) {
          send({ type: "clarification", question: result.clarification, history: messages, queries: result.queries, steps: result.steps });
        } else {
          send({ type: "done", answer: result.finalText, history: messages, queries: result.queries, steps: result.steps });
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
