import { derived, writable } from "svelte/store";

// ---------------------------------------------------------------------------
// Micro-i18n: English default, optional Polish. Static markup uses
// `data-i18n="key"` (EN text inline = default); Svelte islands use the
// reactive `$t(key)` store. Dictionaries live in `i18n-static.ts` (Astro
// pages/layout) and `i18n-app.ts` (Svelte islands) to avoid merge conflicts.
// ---------------------------------------------------------------------------
// RULE: never put data-i18n* on an element whose textContent is also set
// from JS (live-checks, tab states, countdowns) — applyStaticLang would
// clobber the live text on every dict load / language event. Such elements
// get their bilingual strings from JS (documentElement.lang) instead.

export type Lang = "en" | "pl";

const STORAGE_KEY = "solhack-lang";
/** Cookie mirror of STORAGE_KEY so SSR can render the right language at
 * first paint (localStorage is invisible to the server). */
const LANG_COOKIE = "solhack-lang";

function readLangCookie(): Lang | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${LANG_COOKIE}=`));
  if (hit === undefined) return null;
  const value = hit.slice(LANG_COOKIE.length + 1);
  return value === "en" || value === "pl" ? value : null;
}

function initialLang(): Lang {
  if (typeof localStorage !== "undefined") {
    if (localStorage.getItem(STORAGE_KEY) === "pl") return "pl";
  }
  return readLangCookie() ?? "en";
}

export const lang = writable<Lang>(initialLang());

let current: Lang = initialLang();

export function getLang(): Lang {
  return current;
}

export function setLang(next: Lang): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode — session-only */
  }
  if (typeof document !== "undefined") {
    try {
      // Readable by the server so the next SSR pass paints the same language.
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      /* cookie write refused — localStorage still carries the choice */
    }
    document.documentElement.lang = next;
    document.dispatchEvent(new CustomEvent("solhack:lang", { detail: next }));
  }
  applyStaticLang(next);
}

export type Dict = Record<string, string>;

// Filled by i18n-static.ts / i18n-app.ts via registerDict (split files so
// parallel edits never collide).
const parts: Array<{ en: Dict; pl: Dict }> = [];

export function registerDict(en: Dict, pl: Dict): void {
  parts.push({ en, pl });
  // Dict chunks arrive with lazy island JS — re-apply so late lookups heal
  // any key that an earlier pass could not resolve yet. Idempotent.
  if (typeof document !== "undefined" && document.readyState !== "loading") {
    applyStaticLang(current);
  }
}

/**
 * Dictionary lookup — returns undefined when NO registered dictionary has
 * the key, so callers can keep their inline EN instead of printing raw key
 * names. Exported for the dictionary-parity test.
 */
export function lookup(l: Lang, key: string): string | undefined {
  for (const p of parts) {
    const hit = p[l][key] ?? p.en[key];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Union of every registered dictionary key per language (parity test). */
export function registeredKeys(): { en: string[]; pl: string[] } {
  const en = new Set<string>();
  const pl = new Set<string>();
  for (const p of parts) {
    for (const key of Object.keys(p.en)) en.add(key);
    for (const key of Object.keys(p.pl)) pl.add(key);
  }
  return { en: [...en], pl: [...pl] };
}

const warnedKeys = new Set<string>();

/** Dev-only one-shot warning for a key no dictionary provides. */
function warnMissing(key: string): void {
  if (!import.meta.env.DEV || warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(`[i18n] missing key "${key}" — inline EN kept`);
}

/** Reactive translator for Svelte: `{$t("nav.plans")}`. */
export const t = derived(lang, ($l) => (key: string): string => {
  const hit = lookup($l, key);
  if (hit === undefined) warnMissing(key);
  return hit ?? key;
});

/**
 * Translate with an inline EN fallback — for keys whose dictionary entry
 * lives in another slice's i18n file (or has not shipped yet): renders the
 * fallback now and switches to the registered translation automatically.
 */
export function tOr(key: string, fallbackEn: string): string {
  const hit = lookup(getLang(), key);
  if (hit === undefined) warnMissing(key);
  return hit ?? fallbackEn;
}

/** Translate static markup: text, placeholders, titles, aria-labels. */
export function applyStaticLang(l: Lang): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = l;
  const text = document.querySelectorAll<HTMLElement>("[data-i18n]");
  for (const el of text) {
    const key = el.getAttribute("data-i18n");
    if (key === null) continue;
    // Missing key → keep the inline EN text; never clobber it with the key.
    const value = lookup(l, key);
    if (value === undefined) warnMissing(key);
    else el.textContent = value;
  }
  const ph = document.querySelectorAll<HTMLElement>("[data-i18n-ph]");
  for (const el of ph) {
    const key = el.getAttribute("data-i18n-ph");
    if (key === null) continue;
    const value = lookup(l, key);
    if (value === undefined) warnMissing(key);
    else el.setAttribute("placeholder", value);
  }
  const title = document.querySelectorAll<HTMLElement>("[data-i18n-title]");
  for (const el of title) {
    const key = el.getAttribute("data-i18n-title");
    if (key === null) continue;
    const value = lookup(l, key);
    if (value === undefined) warnMissing(key);
    else el.setAttribute("title", value);
  }
  const aria = document.querySelectorAll<HTMLElement>("[data-i18n-aria]");
  for (const el of aria) {
    const key = el.getAttribute("data-i18n-aria");
    if (key === null) continue;
    const value = lookup(l, key);
    if (value === undefined) warnMissing(key);
    else el.setAttribute("aria-label", value);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("solhack:lang", (e) => {
    applyStaticLang((e as CustomEvent<Lang>).detail);
  });
}
