import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Fee-slice dictionary (FeeBadge): protocol-fee label strings only.
// Static markup carries EN inline + data-i18n; `fee.*` keys are unique to
// this slice — zero overlap with other i18n-*.ts dicts by contract.
// ---------------------------------------------------------------------------

const en: Dict = {
  "fee.label": "0.4% protocol fee",
  "fee.treasury": "treasury",
  "fee.hint": "0.4% of every charge settles to the protocol treasury",
};

const pl: Dict = {
  "fee.label": "0,4% opłata protokołu",
  "fee.treasury": "skarbiec",
  "fee.hint": "0,4% każdej opłaty trafia do skarbca protokołu",
};

registerDict(en, pl);
