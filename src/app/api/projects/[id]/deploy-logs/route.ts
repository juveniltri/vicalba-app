import { type NextRequest } from "next/server";
import { suscribirDeployLogs } from "@/lib/deploy-stream";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const encoder = new TextEncoder();

  let desuscribir: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enviar = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      desuscribir = suscribirDeployLogs(
        id,
        (line) => enviar({ line }),
        (resultado) => {
          enviar({ tipo: "done", resultado });
          controller.close();
          desuscribir?.();
        },
      );

      if (!desuscribir) {
        enviar({ tipo: "sin_deploy" });
        controller.close();
      }
    },
    cancel() {
      desuscribir?.();
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
