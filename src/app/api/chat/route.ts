import { NextRequest } from "next/server";
import { ragChat } from "@/lib/rag";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      sessionId,
      history = [],
    } = body as {
      message: string;
      sessionId: string;
      history: { role: "user" | "assistant"; content: string }[];
    };

    if (!message || typeof message !== "string") {
      return Response.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    if (!sessionId || typeof sessionId !== "string") {
      return Response.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of ragChat(message, history, sessionId)) {
            const data = JSON.stringify(chunk) + "\n";
            controller.enqueue(encoder.encode(data));
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          const data = JSON.stringify({ type: "error", error: errorMsg }) + "\n";
          controller.enqueue(encoder.encode(data));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return Response.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
