import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CheckRequest } from "@quanta/shared";

import { apiRequest, ApiError, NetworkError } from "./api";

const QUEUE_KEY = "quanta.offlineQueue";

interface QueuedCheck {
  body: CheckRequest;
  queuedAt: number;
}

async function readQueue(): Promise<QueuedCheck[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedCheck[]) : [];
}

async function writeQueue(queue: QueuedCheck[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueCheck(body: CheckRequest): Promise<void> {
  const queue = await readQueue();
  queue.push({ body, queuedAt: Date.now() });
  await writeQueue(queue);
}

export async function queueLength(): Promise<number> {
  return (await readQueue()).length;
}

/**
 * Sends queued checks. The server judges validity by challenge TTL — stale
 * entries will be rejected with 403 and are dropped (the employee must
 * re-scan); only network failures keep an entry queued.
 */
export async function flushQueue(): Promise<{ sent: number; rejected: number; remaining: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { sent: 0, rejected: 0, remaining: 0 };

  const remaining: QueuedCheck[] = [];
  let sent = 0;
  let rejected = 0;
  for (const item of queue) {
    try {
      await apiRequest("/attendance/check", { method: "POST", body: item.body });
      sent++;
    } catch (error) {
      if (error instanceof NetworkError) {
        remaining.push(item); // still offline — keep it
      } else if (error instanceof ApiError) {
        rejected++; // expired challenge / replay — drop, user must re-scan
      }
    }
  }
  await writeQueue(remaining);
  return { sent, rejected, remaining: remaining.length };
}
