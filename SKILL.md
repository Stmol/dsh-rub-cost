---
name: dsh-rub-cost
description: Explain and read the current DeepSeek Harness session cost in rubles shown in the composer dock. Use when the user asks what the running session or its subagents cost, how the peak/off-peak tariff and its countdown work, which CBR USD/RUB rate was used, how much the cache saved, or why the shown amount differs from the DeepSeek Platform bill.
---

# dsh-rub-cost

A display-only plugin for the DeepSeek Harness Web UI. It adds a pill to the
composer dock, next to the built-in token counters, and a popover card behind
it. It registers no tools, no slash commands and no model context, so an agent
never sees the amounts unless the user shows them.

## What the card shows

- The last used model and the tariff in effect (`peak hours (…)` in amber, or
  `off-peak`) with a countdown to the next switch.
- The API cost in dollars at the tariff in effect, and the same cost in rubles.
- The CBR USD/RUB rate with its publication date.
- The cost of the current session, the same session without a cache, and the
  savings; a separate row sums subagents.
- The DeepSeek Platform wallet balances.

The pill shows the session total in rubles; clicking it opens the card.

## How the amount is built

`cost = (uncachedInput + cacheWrite) × cacheMiss + cacheRead × cacheHit + output × output`

Tokens come from the host `tokenUsage` projection and the model from
`modelSelection.lastUsed`; the plugin never folds the session journal itself.
The dollar list is DeepSeek's official price list per 1M tokens, converted at
the CBR rate. Peak hours are Beijing weekdays 09:00-12:00 and 14:00-18:00,
printed in the browser's timezone but computed on the Beijing rule, so the
amount is the same wherever the card is opened.

## Limitations worth repeating

- PRC statutory holidays are not modelled: a holiday weekday is priced as a peak
  day, so the amount and the countdown are both too high until the holiday ends.
- `tokenUsage` is a whole-session total with no per-route split, so after a
  mid-session model change everything is estimated with the last used model.
- Cache writes are billed at the cache miss rate; DeepSeek publishes no separate
  price.
- Subagents use their own last used model at the current tariff; a child without
  a route yet falls back to the parent's. If any child cannot be read, the total
  row is hidden rather than shown incomplete.
- The rate is cached in `localStorage`. With no network the last known rate is
  used; with no cache the cell shows a dash and the reason in a tooltip.
- The balance request pins a hardcoded `x-client-version` in `client.js`, which
  has to be updated by hand after a DSH upgrade.

## Where to change things

`MODEL_PRICES`, `BILLING_CURRENCY` and `RATE_URL` sit at the top of `client.js`;
`DEFAULT_OFFSET_MS` next to them is the fallback clock offset (UTC+3) for a
browser that reports no timezone. After an edit the bundle has to be
reinstalled.
