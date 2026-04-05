"use client";

import type { Session } from "@synq/protocol";

const STORAGE_KEY = "synq-auth-session";
const CREDENTIAL_KEY = "synq-auth-credential";

function safeGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export interface StoredCredential {
  credentialId: string;
  publicKey: string;
  label: string;
}

export function getStoredSession() {
  const raw = safeGet(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function setStoredSession(session: Session) {
  safeSet(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  safeRemove(STORAGE_KEY);
}

export function getAccessToken() {
  return getStoredSession()?.accessToken ?? null;
}

export function getRefreshToken() {
  return getStoredSession()?.refreshToken ?? null;
}

export function storeCredential(credential: StoredCredential) {
  safeSet(CREDENTIAL_KEY, JSON.stringify(credential));
}

export function getStoredCredential() {
  const raw = safeGet(CREDENTIAL_KEY);
  return raw ? (JSON.parse(raw) as StoredCredential) : null;
}
