import type { AgentEventType, Channel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

export type LogEventInput = {
  storeId: string;
  type: AgentEventType;
  channel?: Channel | null;
  query?: string;
  resultCount?: number;
  payload?: Prisma.InputJsonObject;
};

/** Record an AgentEvent (powers the live feed). Never throws: logging must not break a tool call. */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    await getDb().agentEvent.create({
      data: {
        storeId: input.storeId,
        type: input.type,
        channel: input.channel ?? null,
        query: input.query,
        resultCount: input.resultCount,
        payload: input.payload ?? {},
      },
    });
  } catch (err) {
    console.error("[events] failed to log", input.type, err);
  }
}
