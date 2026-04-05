"use client";

import { get, set } from "idb-keyval";

import type { SendMessageRequest } from "@synq/protocol";

const OUTBOX_KEY = "synq-outbox";
let inMemoryQueue: SendMessageRequest[] = [];

export async function getQueuedMessages() {
  try {
    return ((await get(OUTBOX_KEY)) as SendMessageRequest[] | undefined) ?? inMemoryQueue;
  } catch {
    return inMemoryQueue;
  }
}

export async function enqueueMessage(message: SendMessageRequest) {
  const queue = await getQueuedMessages();
  inMemoryQueue = [...queue, message];
  try {
    await set(OUTBOX_KEY, inMemoryQueue);
  } catch {}
}

export async function flushQueuedMessages(
  send: (message: SendMessageRequest) => Promise<unknown>,
) {
  const queue = await getQueuedMessages();
  const survivors: SendMessageRequest[] = [];

  for (const message of queue) {
    try {
      await send(message);
    } catch {
      survivors.push(message);
    }
  }

  inMemoryQueue = survivors;
  try {
    await set(OUTBOX_KEY, survivors);
  } catch {}
  return {
    flushed: queue.length - survivors.length,
    remaining: survivors.length,
  };
}
