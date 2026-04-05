"use client";

import { get, set } from "idb-keyval";

const vaultKey = (conversationId: string) => `synq-vault:${conversationId}`;
const inMemoryVault = new Map<string, Record<string, string>>();

export async function getConversationVault(conversationId: string) {
  try {
    return (
      ((await get(vaultKey(conversationId))) as Record<string, string> | undefined) ??
      inMemoryVault.get(vaultKey(conversationId)) ??
      {}
    );
  } catch {
    return inMemoryVault.get(vaultKey(conversationId)) ?? {};
  }
}

export async function putVaultMessage(
  conversationId: string,
  ref: string,
  plaintext: string,
) {
  const vault = await getConversationVault(conversationId);
  vault[ref] = plaintext;
  inMemoryVault.set(vaultKey(conversationId), vault);
  try {
    await set(vaultKey(conversationId), vault);
  } catch {}
}

export async function rekeyVaultMessage(
  conversationId: string,
  fromRef: string,
  toRef: string,
) {
  const vault = await getConversationVault(conversationId);
  if (!vault[fromRef]) {
    return;
  }

  vault[toRef] = vault[fromRef];
  delete vault[fromRef];
  inMemoryVault.set(vaultKey(conversationId), vault);
  try {
    await set(vaultKey(conversationId), vault);
  } catch {}
}
