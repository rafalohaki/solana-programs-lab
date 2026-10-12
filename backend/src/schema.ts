import { Schema } from "effect";

/**
 * Effect Schema (v4) gates for backend request bodies.
 *
 * v4 notes:
 * - decoding is `Schema.decodeUnknownResult(schema)(input)` and yields
 *   `{ _tag: "Success" | "Failure", ... }` — there is no `Either` in the
 *   v4 root.
 * - exposed types come from `Schema.Schema.Type<typeof S>`.
 *
 * These schemas are SHAPE gates only: they run BEFORE the domain validation
 * (`parseAddress`, range checks, …) in `routes.ts` / `@subscriptions/actions`,
 * whose own error messages are preserved. On `Failure` the route answers 400
 * with the pre-existing message.
 */

/** One element of POST /api/actions/batch `items`. All base58 addresses. */
export const BatchItemSchema = Schema.Struct({
  plan: Schema.String,
  subscription: Schema.String,
  invoice: Schema.String,
  subscriberAta: Schema.String,
  mint: Schema.String,
});

/**
 * POST /api/actions/batch body: `{ account, items: [BatchItem] }`.
 *
 * v4 has no `Schema.minItems/maxItems` (nor `Schema.filter`), so the 1–8
 * invoice bound is expressed with the verified v4 filters
 * `Schema.isMinLength` / `Schema.isMaxLength` via `Schema.check`.
 *
 * SHAPE GATE ONLY: excess properties are ignored (Effect's default
 * onExcessProperty behaviour), so unknown fields are not rejected here and
 * the actions handler still re-parses the raw body itself — this schema is a
 * guard rail on the known fields, not an allowlist of the body.
 */
export const BatchBodySchema = Schema.Struct({
  account: Schema.String,
  items: Schema.Array(BatchItemSchema).pipe(
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  ),
});

export type BatchBody = Schema.Schema.Type<typeof BatchBodySchema>;

export const decodeBatchBody = Schema.decodeUnknownResult(BatchBodySchema);

const MEMO_HEX_RE = /^[0-9a-fA-F]{64}$/;

/**
 * 64-char lowercase/uppercase hex memo hash.
 * Regex on purpose — simpler and clearer than a TemplateLiteral composition.
 */
export const MemoHexSchema = Schema.String.pipe(Schema.check(Schema.isPattern(MEMO_HEX_RE)));

export type MemoHex = Schema.Schema.Type<typeof MemoHexSchema>;

export const decodeMemoHex = Schema.decodeUnknownResult(MemoHexSchema);

/** Manual regex gate for memo hashes; true iff `value` is 64 hex chars. */
export function isMemoHex(value: unknown): value is MemoHex {
  return typeof value === "string" && MEMO_HEX_RE.test(value);
}
