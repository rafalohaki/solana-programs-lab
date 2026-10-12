import { get, writable } from "svelte/store";
import { t } from "./i18n.js";
import "./i18n-app.js";

// ---------------------------------------------------------------------------
// Toasts + clipboard. Tiny, typed, no dependency.
// ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  kind: "ok" | "err" | "info";
  title: string;
  body?: string;
  link?: { label: string; href: string };
}

let nextId = 1;

export const toasts = writable<Toast[]>([]);

function push(kind: Toast["kind"], title: string, opts?: { body?: string; link?: Toast["link"]; ttl?: number }): void {
  const id = nextId++;
  const toast: Toast = { id, kind, title, body: opts?.body, link: opts?.link };
  toasts.update((list) => [...list.slice(-3), toast]);
  const ttl = opts?.ttl ?? 7000;
  window.setTimeout(() => {
    toasts.update((list) => list.filter((t) => t.id !== id));
  }, ttl);
}

export const toast = {
  ok: (title: string, opts?: { body?: string; link?: Toast["link"] }) => push("ok", title, opts),
  err: (title: string, opts?: { body?: string }) => push("err", title, opts),
  info: (title: string, opts?: { body?: string }) => push("info", title, opts),
};

export function dismissToast(id: number): void {
  toasts.update((list) => list.filter((t) => t.id !== id));
}

export async function copyText(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.ok(get(t)("ui.copied"), { body: label });
  } catch {
    toast.err(get(t)("ui.copyFail"), { body: get(t)("ui.copyManual") });
  }
}
