import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextRequest } from "next/server";
import { runAgentTurn, buildSystemPrompt, readAppMemory, type Message, type ProgressEvent } from "@/lib/agent/runner";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response(sseEvent({ type: "error", message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", session.user!.email!)
    .single();

  if (!user) {
    return new Response(sseEvent({ type: "error", message: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  if (user.role === "member") {
    const { data: membership } = await supabase
      .from("app_members")
      .select("app_id")
      .eq("app_id", params.id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(sseEvent({ type: "error", message: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
  }

  const { datasetId, question, history } = (await req.json()) as {
    datasetId: string;
    question: string;
    history?: Message[];
  };

  if (!datasetId || !question?.trim()) {
    return new Response(sseEvent({ type: "error", message: "datasetId and question are required" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const { data: dataset } = await supabase
    .from("app_datasets")
    .select("gcp_project_id, dataset_id")
    .eq("id", datasetId)
    .eq("app_id", params.id)
    .single();

  if (!dataset) {
    return new Response(sseEvent({ type: "error", message: "Dataset not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const { data: files } = await supabase
    .from("app_files")
    .select("file_path, category")
    .eq("app_id", params.id)
    .order("file_path");

  const datasetRef = {
    projectId: dataset.gcp_project_id,
    datasetId: dataset.dataset_id,
  };

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
          accessToken: session.accessToken,
          systemPrompt,
          onProgress: (event: ProgressEvent) => send(event),
        });

        if (result.clarification) {
          send({ type: "clarification", question: result.clarification, history: messages, queries: result.queries, steps: result.steps });
        } else {
          send({ type: "done", answer: result.finalText, history: messages, queries: result.queries, steps: result.steps });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
