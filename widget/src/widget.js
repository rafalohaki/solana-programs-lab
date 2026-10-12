/* SolhackPay loader — plain JS, zero deps. No secrets here: the domain
 * bind is enforced server-side on /pay, so a stolen snippet 403s elsewhere.
 * Served as https://solhack.rafal.si/widget.js (copy kept in sync at
 * frontend/public/widget.js — see widget/README.md). */
(function () {
  "use strict";
  var CHECKOUT_ORIGIN = "https://solhack.rafal.si";

  function checkoutUrl(plan, cluster) {
    return (
      CHECKOUT_ORIGIN +
      "/pay?plan=" +
      encodeURIComponent(plan) +
      "&host=" +
      encodeURIComponent(window.location.host) +
      "&cluster=" +
      encodeURIComponent(cluster || "devnet")
    );
  }

  /** Shared popup lifecycle: resolves with the tx signature on solhack:paid,
   *  rejects on solhack:closed or when the popup dies. The event.origin gate
   *  is the only trust anchor — messages from any other origin are ignored. */
  function openCheckout(url) {
    var popup = window.open(url, "solhack-pay", "width=480,height=720,popup=yes");
    if (!popup) return Promise.reject(new Error("SolhackPay: popup blocked — allow popups and retry."));
    return new Promise(function (resolve, reject) {
      var settled = false;
      function done(ok, value) {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMessage);
        window.clearInterval(timer);
        try {
          popup.close();
        } catch (_) {
          /* already closed */
        }
        if (ok) resolve(value);
        else reject(value);
      }
      function onMessage(event) {
        if (event.origin !== CHECKOUT_ORIGIN) return;
        var data = event.data || {};
        if (data.type === "solhack:paid") done(true, data.signature);
        else if (data.type === "solhack:closed") done(false, new Error("SolhackPay: checkout closed."));
      }
      window.addEventListener("message", onMessage);
      var timer = window.setInterval(function () {
        if (settled) return;
        if (popup.closed) done(false, new Error("SolhackPay: checkout closed."));
      }, 500);
    });
  }

  /** Opens the popup checkout; resolves with the tx signature, rejects on close. */
  function subscribe(opts) {
    var plan = (opts && opts.plan) || "";
    if (!plan) return Promise.reject(new Error("SolhackPay.subscribe: plan is required."));
    return openCheckout(checkoutUrl(plan, opts.cluster));
  }

  /** One-time payment popup. Resolves with the tx signature, rejects on close.
   *  opts: { merchant, amount, mint?, label?, memo? } — amount in BASE UNITS
   *  (lamports for native SOL, mint decimals otherwise), same unit the
   *  /api/actions/pay endpoint takes. mint omitted = native SOL. */
  function pay(opts) {
    var merchant = (opts && opts.merchant) || "";
    var amount = opts ? opts.amount : undefined;
    if (!merchant) return Promise.reject(new Error("SolhackPay.pay: merchant is required."));
    if (amount === undefined || amount === null || amount === "") {
      return Promise.reject(new Error("SolhackPay.pay: amount is required (base units)."));
    }
    var url =
      CHECKOUT_ORIGIN +
      "/pay?mode=pay" +
      "&merchant=" +
      encodeURIComponent(merchant) +
      "&amount=" +
      encodeURIComponent(amount) +
      // host powers the solhack:paid postMessage back to THIS origin.
      "&host=" +
      encodeURIComponent(window.location.host);
    if (opts.mint) url += "&mint=" + encodeURIComponent(opts.mint);
    if (opts.label) url += "&label=" + encodeURIComponent(opts.label);
    if (opts.memo) url += "&memo=" + encodeURIComponent(opts.memo);
    return openCheckout(url);
  }

  window.SolhackPay = { subscribe: subscribe, pay: pay, CHECKOUT_ORIGIN: CHECKOUT_ORIGIN };
})();
