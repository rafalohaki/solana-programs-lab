import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Home-slice dictionary (PortHome): Void visual port of the Stitch home
// screens. Static markup carries EN inline + data-i18n*; reactive strings
// use $t(key). `home1.*` only — zero overlap with i18n-static.ts /
// i18n-app.ts / i18n-proofs.ts by contract.
// ---------------------------------------------------------------------------

const en: Dict = {
  "home1.live": "LIVE",
};

const pl: Dict = {
  "home1.live": "LIVE",
};

registerDict(en, pl);
