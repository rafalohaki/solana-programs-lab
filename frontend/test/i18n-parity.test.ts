import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { lookup, registeredKeys } from "../src/lib/i18n.js";

// ---------------------------------------------------------------------------
// Dictionary-parity + data-i18n contract guard.
// Importing a dictionary module registers it in the shared i18n parts table
// (side effect), so every slice file must be imported here — the
// "every i18n-*.ts dictionary is imported" test counts the files on disk
// and fails when a new i18n-*.ts was added without an import line below.
// ---------------------------------------------------------------------------

import "../src/lib/i18n-admin.js";
import "../src/lib/i18n-app.js";
import "../src/lib/i18n-fee.js";
import "../src/lib/i18n-flows2.js";
import "../src/lib/i18n-home2.js";
import "../src/lib/i18n-manage2.js";
import "../src/lib/i18n-merch2.js";
import "../src/lib/i18n-pay.js";
import "../src/lib/i18n-port1.js";
import "../src/lib/i18n-port2.js";
import "../src/lib/i18n-port3.js";
import "../src/lib/i18n-port4.js";
import "../src/lib/i18n-proofs.js";
import "../src/lib/i18n-static.js";

const I18N_MODULE_COUNT = 14; // i18n-*.ts files in src/lib (see list above)

function dataI18nKeys(dir: string, into: Set<string>): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      dataI18nKeys(path, into);
      continue;
    }
    if (!/\.(astro|svelte|ts)$/.test(entry)) continue;
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/data-i18n(?:-ph|-title|-aria)?="([^"]+)"/g)) {
      into.add(match[1] ?? "");
    }
  }
}

describe("i18n dictionary parity", () => {
  test("every i18n-*.ts dictionary in src/lib is imported above", () => {
    const files = readdirSync(join(import.meta.dir, "..", "src", "lib")).filter((f) =>
      /^i18n-.+\.ts$/.test(f),
    );
    // A new dictionary file without an import line above is untested here.
    expect(files.length).toEqual(I18N_MODULE_COUNT);
    const { en, pl } = registeredKeys();
    expect(en.length).toBeGreaterThan(0);
    expect(pl.length).toBeGreaterThan(0);
  });

  test("every EN key has a PL translation and vice versa", () => {
    const { en, pl } = registeredKeys();
    const missingPl = en.filter((key) => lookup("pl", key) === undefined);
    const missingEn = pl.filter((key) => lookup("en", key) === undefined);
    expect(missingPl).toEqual([]);
    expect(missingEn).toEqual([]);
  });
});

describe("data-i18n contract", () => {
  test("every data-i18n key in markup resolves in the EN dictionary", () => {
    const used = new Set<string>();
    dataI18nKeys(join(import.meta.dir, "..", "src"), used);
    expect(used.size).toBeGreaterThan(0);
    const unresolved = [...used].filter((key) => lookup("en", key) === undefined);
    expect(unresolved).toEqual([]);
  });
});
