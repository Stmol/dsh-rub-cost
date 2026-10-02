/**
 * Browser half of the "session cost in rubles" plugin.
 *
 * The cell is added to the conversation dock (`conversation.composer.dock`)
 * next to the built-in token counters. Tokens and the model come from the
 * ready-made host projections — `tokenUsage`, `modelSelection`: the client
 * never folds the session journal itself, otherwise there would be a second
 * source of truth.
 *
 * Prices are DeepSeek's official dollar price list: the account is billed in
 * dollars. The yuan price list from the Chinese page is the very same list in
 * another currency; DeepSeek converts it at the fixed rate 20/3 = 6.6667 ¥/$.
 * For deepseek-flash both lists agree to the digit, for deepseek-v4-pro the
 * dollar one is rounded down (0.66 vs 0.675) and is the contract.
 *
 * In a usage report the amounts can be denominated in CNY while a granted yuan
 * balance is being spent: DeepSeek consumes the granted balance before the
 * topped-up one.
 *
 * The dollar rate is pulled from a mirror of the Central Bank of Russia rates
 * and cached in localStorage, and the wallet balances come from DeepSeek
 * Platform over the account remote. Neither external value is replaced with a
 * guess when unavailable: the panel shows "—" plus the reason.
 */
window.__ModuleLoader__.load({
	id: '@stmol/dsh-rub-cost',
	factory(require) {
		const React = require('react');
		const ReactDOM = require('react-dom');
		const h = React.createElement;

		/** Namespace of the plugin localization dictionaries. */
		const NS = 'dsh-rub-cost';

		/**
		 * Client version for the `x-client-version` header of the requests to
		 * DeepSeek Platform. There is no way to obtain it in the browser:
		 * `DSH_CLIENT_VERSION` is baked into the build at bundling time, no global
		 * variable carries it, the boot manifest does not expose it, and no remote
		 * returns it. The built-in account settings screen (`ui-settings-account`)
		 * hardcodes the same string — we keep it in sync with the installed DSH
		 * build.
		 */
		const CLIENT_VERSION = '0.2.0-rc.2';

		/**
		 * Panel texts. `en` is the out-of-the-box Harness UI language, `ru` is for
		 * an installed Russian language pack; missing keys of the active locale
		 * fall back to `en`, as everywhere else in the shell.
		 */
		const DICTIONARIES = {
			en: {
				'panel.title': 'Session cost',
				'panel.model': 'Model',
				'panel.modelUnknown': 'not chosen yet',
				'panel.tariff': 'Tariff',
				'panel.tariff.peak': 'peak hours ({range})',
				'panel.tariff.offPeak': 'off-peak',
				'panel.tariffSwitch': 'Tariff changes in',
				'panel.tariffError': 'Tariff change time unavailable: {reason}',
				'panel.priceUnknown': 'no price for this model',
				'panel.apiCost': 'API cost ({zone})',
				'panel.rate': 'CBR rate ({date})',
				'panel.withoutCache': 'Without cache',
				'panel.cacheSavings': 'Cache savings',
				'panel.withSubagents': 'Total with subagents',
				'panel.subagentsLoading': 'Subagents: loading…',
				'panel.subagentsUnavailable': 'Subagents: no session controller in this profile',
				'panel.subagentsError': 'Subagent cost unavailable: {reason}',
				'panel.subagentsNoPrice': 'Subagent cost is not priced: another provider or model',
				'panel.balance': 'Balance ({currency})',
				'panel.bonus': 'Bonus ({currency})',
				'panel.balanceUnavailable': 'Balance: no account controller in this profile',
				'panel.balanceSignedOut': 'Balance: no DeepSeek account connected',
				'panel.balanceFailed': 'Balance: Platform did not answer',
				'panel.balanceError': 'Balance unavailable: {reason}',
				'panel.rateMissing': 'Rate unavailable: {reason}',
				'panel.rateError': 'Rate refresh failed, the last known one is shown: {reason}',
				'value.unknown': '—',
			},
			ru: {
				'panel.title': 'Стоимость сессии',
				'panel.model': 'Модель',
				'panel.modelUnknown': 'ещё не выбрана',
				'panel.tariff': 'Тариф',
				'panel.tariff.peak': 'часы пика ({range})',
				'panel.tariff.offPeak': 'вне часов пика',
				'panel.tariffSwitch': 'Тариф сменится через',
				'panel.tariffError': 'Время смены тарифа недоступно: {reason}',
				'panel.priceUnknown': 'нет цены для этой модели',
				'panel.apiCost': 'Стоимость API ({zone})',
				'panel.rate': 'Курс ЦБ ({date})',
				'panel.withoutCache': 'Без кэша',
				'panel.cacheSavings': 'Экономия на кэше',
				'panel.withSubagents': 'Итого с субагентами',
				'panel.subagentsLoading': 'Субагенты: загрузка…',
				'panel.subagentsUnavailable': 'Субагенты: контроллер сессий не смонтирован в этом профиле',
				'panel.subagentsError': 'Стоимость субагентов недоступна: {reason}',
				'panel.subagentsNoPrice': 'Стоимость субагентов не оценена: другой провайдер или модель',
				'panel.balance': 'Баланс ({currency})',
				'panel.bonus': 'Бонус ({currency})',
				'panel.balanceUnavailable': 'Баланс: контроллер аккаунта не смонтирован в этом профиле',
				'panel.balanceSignedOut': 'Баланс: аккаунт DeepSeek не подключён',
				'panel.balanceFailed': 'Баланс: Platform не ответил',
				'panel.balanceError': 'Баланс недоступен: {reason}',
				'panel.rateMissing': 'Курс не получен: {reason}',
				'panel.rateError': 'Курс не обновился, показан последний известный: {reason}',
				'value.unknown': '—',
			},
		};

		/** Panel classes: the prefix rules out collisions with the shell styles. */
		const css = {
			anchor: 'dshRubCost_anchor',
			pill: 'dshRubCost_pill',
			unknown: 'dshRubCost_unknown',
			label: 'dshRubCost_label',
			panel: 'dshRubCost_panel',
			title: 'dshRubCost_title',
			titleLabel: 'dshRubCost_titleLabel',
			titleValue: 'dshRubCost_titleValue',
			titleRule: 'dshRubCost_titleRule',
			details: 'dshRubCost_details',
			section: 'dshRubCost_section',
			skeleton: 'dshRubCost_skeleton',
			divider: 'dshRubCost_divider',
			peak: 'dshRubCost_peak',
			notes: 'dshRubCost_notes',
			note: 'dshRubCost_note',
		};

		/**
		 * The panel styles mirror the built-in dock pills and the "Token usage"
		 * popover card, but under their own prefix: a plugin may not import
		 * Harness Client packages, so the markup and the CSS are copied over, and
		 * the references to theme tokens are kept — light and dark themes work
		 * without a separate rule set.
		 */
		const STYLES = [
			'.dshRubCost_anchor{min-width:0;display:inline-flex;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',
			'.dshRubCost_pill{box-sizing:border-box;corner-shape:round;max-width:100%;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:999px;align-items:center;padding:1px 8px;display:inline-flex}',
			'.dshRubCost_pill:hover,.dshRubCost_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
			'.dshRubCost_unknown{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-secondary))}',
			'.dshRubCost_label{text-overflow:ellipsis;min-width:0;overflow:hidden}',
			'.dshRubCost_panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}',
			'.dshRubCost_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}',
			'.dshRubCost_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}',
			'.dshRubCost_titleValue{font-variant-numeric:tabular-nums}',
			'.dshRubCost_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}',
			'.dshRubCost_details{color:var(--dsw-alias-label-tertiary)}',
			'.dshRubCost_section{grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}',
			'.dshRubCost_section dt,.dshRubCost_section dd{min-width:0;margin:0}',
			'.dshRubCost_section dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}',
			// The peak tariff marks itself: the rate is twice the off-peak one, so the
			// value is highlighted in amber rather than left to blend into the other rows.
			// `state-warn-label` is the theme's text-safe warn colour; the primary one is
			// its fallback where the label alias is not defined.
			'.dshRubCost_peak{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-secondary)))}',
			// The skeleton takes the place of the value while loading: the row keeps
			// the same height, so the card neither resizes nor jumps. The colour is
			// `currentColor` at low opacity, so light and dark themes work on their own.
			'.dshRubCost_skeleton{vertical-align:middle;background:currentColor;border-radius:999px;height:9px;display:inline-block;opacity:.14;animation:dshRubCost_skeletonPulse 1.4s ease-in-out infinite}',
			'@keyframes dshRubCost_skeletonPulse{0%,100%{opacity:.08}50%{opacity:.28}}',
			'@media (prefers-reduced-motion:reduce){.dshRubCost_skeleton{animation:none;opacity:.14}}',
			'.dshRubCost_divider{border-top:.5px solid var(--dsw-alias-border-l2);margin:10px 0}',
			'.dshRubCost_notes{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:10px;padding-top:10px}',
			'.dshRubCost_note{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-tertiary));overflow-wrap:anywhere;margin:0}',
			'.dshRubCost_note + .dshRubCost_note{margin-top:4px}',
		].join('');

		/** Provider ids that follow the official DeepSeek price list. */
		const OFFICIAL_PROVIDERS = ['deepseek-official', 'deepseek-account'];

		/**
		 * Official DeepSeek prices in dollars per 1M tokens
		 * (api-docs.deepseek.com/quick_start/pricing, snapshot of 2026-10-02).
		 *
		 * The provider publishes no separate price for cache writes (there is no
		 * such line in a usage report either), so `cacheWrite` is billed at the
		 * cache miss rate. Peak hours cost exactly twice as much, so the tariff is
		 * picked by the Beijing-time rule at render time.
		 */
		const MODEL_PRICES = {
			'deepseek-flash': {
				offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
				peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
			},
			'deepseek-v4-pro': {
				offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
				peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
			},
		};

		/**
		 * Beijing time, UTC+8. DeepSeek announces its peak hours in Beijing time, so
		 * the tariff rule is stated in this zone; the viewer's own zone only changes
		 * the clock printed in the card, never the tariff itself.
		 */
		const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

		/**
		 * Fallback for the viewer's UTC offset when the browser reports no zone:
		 * Moscow, a fixed UTC+3. Display only — the tariff rule below is unaffected.
		 */
		const DEFAULT_OFFSET_MS = 3 * 60 * 60 * 1000;

		/** One hour in milliseconds: the tariff switch search steps by it. */
		const HOUR_MS = 60 * 60 * 1000;

		/** One minute in milliseconds: turns a UTC offset into a clock. */
		const MINUTE_MS = 60 * 1000;

		/** Mirror of the Central Bank of Russia rates; it sends a CORS header, so the request goes straight from the browser. */
		const RATE_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

		/** Billing currency: the plugin price list and the rate are expressed in the same currency. */
		const BILLING_CURRENCY = 'USD';

		/** Key of the last successfully fetched rate: used when a refresh fails. */
		const RATE_CACHE_KEY = 'dsh-rub-cost:usd-rate:v2';

		/** Card margin from the window edge when the position is applied. */
		const PANEL_MARGIN = 12;

		/** Gap between the button and the card. */
		const PANEL_GAP = 8;

		/**
		 * Poll interval for the subagent spend while the card is open. A live child
		 * keeps growing its `tokenUsage`, and there is no reactive projection for
		 * someone else's session, so polling is what remains.
		 */
		const SUBAGENT_POLL_MS = 15_000;

		/**
		 * How long the balance from DeepSeek Platform is awaited. Without it a hung
		 * request would leave `loading` on forever, and the balance would not be
		 * re-read until the page reloads.
		 */
		const BALANCE_TIMEOUT_MS = 10_000;

		/**
		 * Width of the balance skeleton bars: a value such as `$123.45` and a label
		 * such as `Balance (USD)`. The height is set in CSS and matches half of the
		 * row, so swapping the skeleton for digits does not move the layout.
		 */
		const SKELETON_VALUE_WIDTH = 44;
		const SKELETON_LABEL_WIDTH = 76;

		/**
		 * How many placeholder rows the balance block draws while the first answer
		 * from Platform is still missing and the wallets are unknown: with DeepSeek
		 * that is the account wallet plus two bonus ones (usually USD and CNY). The
		 * row count keeps the same height as the real data.
		 */
		const BALANCE_PLACEHOLDER_ROWS = 3;

		/**
		 * The card before its first measurement: hidden, but laid out, so that its
		 * real size can be measured and it is not shown in the corner of the window
		 * for a single frame.
		 */
		const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

		/**
		 * Peak windows in Beijing time, as `[from, to)` hours. The provider announces
		 * its peak hours in Beijing time (UTC+8): 09:00–12:00 and 14:00–18:00 on
		 * weekdays. The rule is kept in the provider's zone so that the viewer's zone
		 * can only move the printed clock, not the tariff: a window printed as
		 * `04:00–07:00` in Moscow is the very same window printed as `09:00–12:00` in
		 * Beijing. The label prints the window in effect in the viewer's zone, so it
		 * cannot name a range the calculation is not using.
		 */
		const PEAK_WINDOWS = [
			{ from: 9, to: 12 },
			{ from: 14, to: 18 },
		];

		/**
		 * The peak window in effect at a point in time, in Beijing time. Chinese
		 * holidays are not taken into account: the plugin has no holiday calendar, so
		 * on a holiday weekday the cost may come out twice as high.
		 * @param now - point in time in milliseconds.
		 * @returns the peak window, or undefined — on a weekend or outside the windows.
		 */
		function peakWindowAt(now) {
			const beijing = new Date(now + BEIJING_OFFSET_MS);
			const weekday = beijing.getUTCDay();
			if (weekday === 0 || weekday === 6) return undefined;
			const hour = beijing.getUTCHours();
			return PEAK_WINDOWS.find((window) => hour >= window.from && hour < window.to);
		}

		/**
		 * Whether the peak tariff is in effect right now.
		 * @param now - point in time in milliseconds.
		 * @returns true when the peak rate applies.
		 */
		function isPeakTariff(now) {
			return peakWindowAt(now) !== undefined;
		}

		/**
		 * The viewer's UTC offset in milliseconds, taken from the browser zone.
		 * Resolved for the given instant, so a daylight-saving change is seen.
		 * @param at - point in time in milliseconds.
		 * @returns the offset from UTC, or {@link DEFAULT_OFFSET_MS} when the browser
		 *   reports none. This is display data only: the tariff rule stays in Beijing time.
		 */
		function viewerOffsetMs(at) {
			const minutes = new Date(at).getTimezoneOffset();
			return Number.isFinite(minutes) ? -minutes * MINUTE_MS : DEFAULT_OFFSET_MS;
		}

		/**
		 * The UTC offset as it is printed: `UTC+3`, `UTC+5:30`, `UTC-4`.
		 * @param offsetMs - offset from UTC in milliseconds.
		 * @returns the offset label.
		 */
		function utcOffsetLabel(offsetMs) {
			const totalMinutes = Math.round(offsetMs / MINUTE_MS);
			const sign = totalMinutes < 0 ? '-' : '+';
			const absolute = Math.abs(totalMinutes);
			const hours = Math.floor(absolute / 60);
			const minutes = absolute % 60;
			return `UTC${sign}${hours}${minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`}`;
		}

		/**
		 * The window as it is printed in the card: `04:00–07:00`. Only the window in
		 * effect is ever shown — listing both would put a range that is not billed
		 * right now next to the current rate.
		 * @param range - a peak window in Beijing time.
		 * @param offsetMs - the viewer's UTC offset in milliseconds.
		 * @returns the range label, in the viewer's zone.
		 */
		function peakRangeLabel(range, offsetMs) {
			const clock = (hour) => {
				const shifted = hour * 60 + (offsetMs - BEIJING_OFFSET_MS) / MINUTE_MS;
				const minutes = ((shifted % (24 * 60)) + 24 * 60) % (24 * 60);
				return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
			};
			return `${clock(range.from)}–${clock(range.to)}`;
		}

		/**
		 * The nearest tariff switch. The tariff only changes on an hour boundary in
		 * absolute time — Beijing is a whole-hour zone — so UTC hour boundaries are
		 * walked and the viewer's zone does not enter the search.
		 * @param now - point in time in milliseconds.
		 * @returns timestamp of the nearest tariff switch.
		 * @throws if the tariff has not changed within eight days — that means the
		 *   peak-hour rule is broken, and silently showing "in 0" would be worse
		 *   than throwing. The caller catches the exception and shows "—" with a note.
		 */
		function nextTariffSwitch(now) {
			const current = isPeakTariff(now);
			let boundary = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;
			for (let hour = 0; hour < 24 * 8; hour += 1) {
				if (isPeakTariff(boundary) !== current) return boundary;
				boundary += HOUR_MS;
			}
			throw new Error('tariff never changes within 8 days — the peak-hour rule is broken');
		}

		/**
		 * Session cost under a single tariff.
		 * @param usage - the `tokenUsage` projection: full session counters.
		 * @param tariff - tariff rates, billing currency per 1M tokens.
		 * @returns cost in the billing currency.
		 */
		function sessionCost(usage, tariff) {
			const billedMiss = usage.uncachedInputTokens + usage.cacheWriteTokens;
			return (
				(billedMiss * tariff.cacheMiss + usage.cacheReadTokens * tariff.cacheHit + usage.outputTokens * tariff.output) /
				1_000_000
			);
		}

		/** Sum of all session counters: it decides whether there is anything to show. */
		function totalTokens(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
		}

		/**
		 * Key of the set of child sessions. The store and the cell use it to match
		 * the amounts they have read against the current list of children, and to
		 * drop them once the set has changed.
		 */
		function sessionIdsKey(ids) {
			return ids.slice().sort().join(',');
		}

		/**
		 * Duration in the style of the neighbouring status line: "13m 40s",
		 * "1h 05m". The units stay Latin in both locales — just like "tok/s" in the
		 * built-in counters, so that the labels do not drift apart from them.
		 * @param ms - duration in milliseconds.
		 * @returns compact duration label.
		 */
		function formatSpan(ms) {
			const total = Math.max(0, Math.round(ms / 1000));
			const hours = Math.floor(total / 3600);
			const minutes = Math.floor((total % 3600) / 60);
			const seconds = total % 60;
			if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
			if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
			return `${seconds}s`;
		}

		/**
		 * Rubles are formatted with ru-RU: the currency is the ruble, and
		 * "1 234,56 ₽" reads the same regardless of the interface language. All
		 * amounts except the API cost are shown with two decimal places.
		 */
		const RUB_FORMAT = new Intl.NumberFormat('ru-RU', {
			style: 'currency',
			currency: 'RUB',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});

		/**
		 * The CBR rate and the wallet balances also get two decimals: Platform sends
		 * strings with full precision (for example `12.345678901234567`), while the
		 * card needs cents.
		 */
		const RATE_FORMAT = new Intl.NumberFormat('ru-RU', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
		const BALANCE_FORMAT = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});

		/**
		 * The API cost is the only value shown as is, with four decimals: DeepSeek's
		 * daily amounts are measured in tenths of a cent.
		 */
		const USD_FORMAT = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 4,
			maximumFractionDigits: 4,
		});

		/** Wallet currency symbol; an unknown currency is shown as its code rather than as nothing. */
		function currencyMark(currency) {
			if (currency === 'USD') return '$';
			if (currency === 'CNY') return '¥';
			return `${currency} `;
		}

		/**
		 * A wallet balance arrives from Platform as a string with full precision; we
		 * round it to cents. A non-numeric value is passed through as is — showing
		 * the raw string beats a confident "0.00" in place of the real balance.
		 */
		function formatWalletBalance(balance) {
			const value = Number(balance);
			// An empty string is not a number either: `Number('')` yields 0, and the
			// balance would show a confident "0.00" instead of the real remainder,
			// which the response does not contain.
			const isNumeric = typeof balance !== 'string' || balance.trim() !== '';
			return isNumeric && Number.isFinite(value) ? BALANCE_FORMAT.format(value) : String(balance);
		}

		/**
		 * Whether a wallet balance is zero. A non-numeric or empty value is not
		 * treated as zero: an unknown balance is better shown than silently hidden.
		 */
		function isZeroBalance(balance) {
			if (typeof balance !== 'string' && typeof balance !== 'number') return false;
			if (typeof balance === 'string' && balance.trim() === '') return false;
			return Number(balance) === 0;
		}

		/** Formats rubles with two decimal places. */
		function formatRub(value) {
			return RUB_FORMAT.format(value);
		}

		/**
		 * Publication date of the rate in the familiar `DD.MM.YYYY` form. The CBR
		 * mirror sends an ISO string; if its shape unexpectedly changes, we show it
		 * as is rather than invent a date.
		 */
		function formatRateDate(publishedAt) {
			const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(publishedAt);
			return match === null ? publishedAt : `${match[3]}.${match[2]}.${match[1]}`;
		}

		/**
		 * Usability of a rate entry: a finite positive number and a non-empty
		 * publication date. One check for both sources — the CBR mirror response and
		 * the `localStorage` cache.
		 */
		function isValidRateEntry(rate, publishedAt) {
			return (
				typeof rate === 'number' &&
				Number.isFinite(rate) &&
				rate > 0 &&
				typeof publishedAt === 'string' &&
				publishedAt !== ''
			);
		}

		/**
		 * Extracts the billing currency rate from the CBR mirror response.
		 * @throws when the response has the wrong shape or the nominal is not one:
		 *   substituting a "similar" number is not allowed, otherwise the panel would
		 *   show a confident but wrong cost.
		 */
		function parseRatePayload(payload) {
			const entry = payload?.Valute?.[BILLING_CURRENCY];
			if (!isValidRateEntry(entry?.Value, payload?.Date)) {
				throw new Error(`${BILLING_CURRENCY} rate is not usable: ${JSON.stringify(entry ?? null)}`);
			}
			if (entry.Nominal !== 1) {
				throw new Error(`${BILLING_CURRENCY} nominal is not 1: ${JSON.stringify(entry.Nominal)}`);
			}
			return { rate: entry.Value, publishedAt: payload.Date };
		}

		/**
		 * Reads the last successfully fetched rate from localStorage.
		 * @returns the rate entry, or undefined — if there is no cache, it is corrupt, or storage is unavailable.
		 */
		function readCachedRate() {
			let raw;
			try {
				raw = window.localStorage.getItem(RATE_CACHE_KEY);
			} catch (error) {
				console.warn('dsh-rub-cost: localStorage is unavailable, the rate cache cannot be read', error);
				return undefined;
			}
			if (raw === null) return undefined;
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch (error) {
				console.warn('dsh-rub-cost: the rate cache is corrupt and is ignored', error);
				return undefined;
			}
			const rate = parsed?.rate;
			const publishedAt = parsed?.publishedAt;
			if (!isValidRateEntry(rate, publishedAt)) return undefined;
			return { rate, publishedAt };
		}

		/** Caches a successfully fetched rate so it can be used without a network. */
		function writeCachedRate(entry) {
			try {
				window.localStorage.setItem(
					RATE_CACHE_KEY,
					JSON.stringify({ rate: entry.rate, publishedAt: entry.publishedAt }),
				);
			} catch (error) {
				console.warn('dsh-rub-cost: the rate was not cached — localStorage is unavailable', error);
			}
		}

		/**
		 * Shared mechanics of every panel store: the snapshot for
		 * `useSyncExternalStore`, the listener set, and the disposed flag. The three
		 * stores differ only in the shape of their snapshot and in how they refresh,
		 * so this part lives in one place.
		 * @param initial - initial snapshot.
		 */
		function createStore(initial) {
			let state = initial;
			let disposed = false;
			const listeners = new Set();
			return {
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				getSnapshot() {
					return state;
				},
				/** Publishes a new snapshot; calls after disposal are ignored. */
				publish(next) {
					if (disposed) return;
					state = next;
					for (const listener of listeners) listener();
				},
				dispose() {
					disposed = true;
					listeners.clear();
				},
				get disposed() {
					return disposed;
				},
			};
		}

		/**
		 * Reason taken from a remote response: an error carries either a message or
		 * a code. Converting to a string guarantees that a note never ends up with an
		 * empty `{reason}`.
		 */
		function errorReason(error) {
			return error?.message ?? error?.code ?? String(error);
		}

		/**
		 * Waits for a remote response no longer than `ms`. The wait does not cancel
		 * the request itself — `remote` has no abort signal — but it frees the card
		 * from an eternal `loading` and shows the reason.
		 * @param promise - the remote response.
		 * @param ms - wait limit in milliseconds.
		 */
		async function withTimeout(promise, ms) {
			let timer;
			try {
				return await Promise.race([
					promise,
					new Promise((_, reject) => {
						timer = window.setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
					}),
				]);
			} finally {
				window.clearTimeout(timer);
			}
		}

		/**
		 * Rate store: the last known value plus the reason of the last failure.
		 *
		 * It starts from the cache, so the panel does not flicker between "rate
		 * available" and "no rate", and it makes a single request over the lifetime
		 * of the plugin. A failed request does not erase the rate already known — it
		 * only adds the reason to the card.
		 */
		function createRateStore() {
			const store = createStore({ rate: readCachedRate(), error: undefined });
			return {
				subscribe: store.subscribe,
				getSnapshot: store.getSnapshot,
				/** Refreshes the rate; an abort by signal is not counted as a failure. */
				async refresh(signal) {
					try {
						const response = await fetch(RATE_URL, { signal, cache: 'no-store' });
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						const entry = parseRatePayload(await response.json());
						writeCachedRate(entry);
						store.publish({ rate: entry, error: undefined });
					} catch (error) {
						if (signal.aborted) return;
						store.publish({ rate: store.getSnapshot().rate, error: String(error) });
					}
				},
			};
		}

		/**
		 * Store of the DeepSeek Platform account balances.
		 *
		 * It is read through the account remote on demand: when the plugin mounts
		 * and every time the card opens, because the balance changes as you spend.
		 * A missing account controller, a signed-out state, and a Platform refusal
		 * are three different messages rather than a blank: silence reads to the user
		 * as "the feature is broken".
		 * @param accountAccess - mutable cell holding the balance reader; it is
		 *   filled by ctx.inject once the account controller is mounted.
		 */
		function createBalanceStore(accountAccess) {
			const store = createStore({
				wallets: undefined,
				bonuses: undefined,
				loading: false,
				noteKey: undefined,
				noteParams: undefined,
			});
			/**
			 * Publishes a note instead of data. On a temporary failure (`keepWallets`)
			 * the previous wallets stay in place — like the last known rate; when the
			 * account is signed out or the controller is missing, showing them would
			 * be a lie.
			 */
			const fail = (noteKey, noteParams, keepWallets = false) => {
				const state = store.getSnapshot();
				store.publish({
					wallets: keepWallets ? state.wallets : undefined,
					bonuses: keepWallets ? state.bonuses : undefined,
					loading: false,
					noteKey,
					noteParams,
				});
			};
			return {
				subscribe: store.subscribe,
				getSnapshot: store.getSnapshot,
				dispose: store.dispose,
				/** Re-reads the balance; a repeated call while a request is in flight is ignored. */
				async refresh() {
					const state = store.getSnapshot();
					if (store.disposed || state.loading) return;
					const read = accountAccess.read;
					if (read === undefined) {
						fail('panel.balanceUnavailable', undefined);
						return;
					}
					store.publish({ ...state, loading: true });
					try {
						const result = await withTimeout(read(), BALANCE_TIMEOUT_MS);
						if (!result.ok) {
							fail('panel.balanceError', { reason: errorReason(result.error) }, true);
							return;
						}
						const details = result.value;
						if (details === null) {
							fail('panel.balanceSignedOut', undefined);
							return;
						}
						if (details.status === 'failed') {
							fail('panel.balanceFailed', undefined);
							return;
						}
						store.publish({
							wallets: details.value,
							bonuses: details.bonusWallets,
							loading: false,
							noteKey: undefined,
							noteParams: undefined,
						});
					} catch (error) {
						fail('panel.balanceError', { reason: String(error) }, true);
					}
				},
			};
		}

		/**
		 * Store of the session's subagent spend.
		 *
		 * A subagent works in its own session and writes usage to its own journal, so
		 * its spend never lands in the parent's `tokenUsage`. Child ids come from the
		 * `subagentCatalog` projection, and each child's `tokenUsage` and
		 * `modelSelection` are read through `remote.session.projections({ sessionId })`
		 * — the session is not activated by that.
		 *
		 * It is read on demand and polled while the card is open: a live child keeps
		 * spending. A failure reason is kept next to the data so that the card can
		 * show it instead of an incomplete sum.
		 * @param sessionAccess - mutable cell holding the projections reader; it is
		 *   filled by ctx.inject once the client session controller is mounted.
		 */
		function createSubagentStore(sessionAccess) {
			const store = createStore({
				entries: undefined,
				idsKey: undefined,
				noteKey: undefined,
				noteParams: undefined,
			});
			let generation = 0;
			return {
				subscribe: store.subscribe,
				getSnapshot: store.getSnapshot,
				dispose: store.dispose,
				/** Clears the data once no children are left in the session. */
				clear() {
					generation += 1;
					store.publish({
						entries: undefined,
						idsKey: undefined,
						noteKey: undefined,
						noteParams: undefined,
					});
				},
				/**
				 * Re-reads the spend of the listed children. A newer call cancels the
				 * publication of a stale response, so polling never shows an old set;
				 * when the set changes, previous amounts do not stay under the new key.
				 * @param ids - child session ids from `subagentCatalog`.
				 */
				async refresh(ids) {
					if (store.disposed) return;
					const idsKey = sessionIdsKey(ids);
					const read = sessionAccess.read;
					if (read === undefined) {
						store.publish({
							entries: undefined,
							idsKey,
							noteKey: 'panel.subagentsUnavailable',
							noteParams: undefined,
						});
						return;
					}
					const token = ++generation;
					const state = store.getSnapshot();
					const sameSet = state.idsKey === idsKey;
					store.publish({
						entries: sameSet ? state.entries : undefined,
						idsKey,
						noteKey: sameSet ? state.noteKey : undefined,
						noteParams: sameSet ? state.noteParams : undefined,
					});
					const results = await Promise.all(
						ids.map(async (id) => {
							try {
								const result = await read({ sessionId: id });
								if (!result.ok) {
									return {
										id,
										noteKey: 'panel.subagentsError',
										noteParams: { reason: errorReason(result.error) },
									};
								}
								const values = result.value === null ? {} : (result.value.values ?? {});
								return { id, usage: values.tokenUsage, route: values.modelSelection?.lastUsed ?? null };
							} catch (error) {
								return { id, noteKey: 'panel.subagentsError', noteParams: { reason: String(error) } };
							}
						}),
					);
					if (store.disposed || token !== generation) return;
					const entries = [];
					let noteKey;
					let noteParams;
					for (const result of results) {
						if (result.noteKey !== undefined) {
							noteKey = result.noteKey;
							noteParams = result.noteParams;
							continue;
						}
						entries.push({ id: result.id, usage: result.usage, route: result.route });
					}
					store.publish({ entries, idsKey, noteKey, noteParams });
				},
			};
		}

		/**
		 * Keeps the card glued to the button.
		 *
		 * A copy of a shell primitive: a plugin may not import Harness Client
		 * packages, and `position: fixed` inside the conversation panel would not
		 * save us — ancestors with `backdrop-filter` create their own containing
		 * block. So the card is portalled into `document.body`, and the coordinates
		 * are computed here: upwards from the top of the button, clamped to the
		 * window bounds, and recomputed on scroll, on resize, and on the card's own
		 * size change.
		 * @param options - whether the card is open, refs to the button and the card, the gap and the edge margin.
		 * @returns the card coordinates, or null until the first measurement.
		 */
		function usePanelPosition({ open, anchorRef, panelRef, gap, margin }) {
			const [position, setPosition] = React.useState(null);
			React.useLayoutEffect(() => {
				if (!open) {
					setPosition(null);
					return;
				}
				const place = () => {
					const rect = anchorRef.current?.getBoundingClientRect();
					if (rect === undefined) return;
					const panel = panelRef.current;
					const width = panel?.offsetWidth ?? 0;
					const height = panel?.offsetHeight ?? 0;
					let left = rect.left;
					let top = rect.top - gap - height;
					if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin);
					if (height > 0) top = Math.min(Math.max(top, margin), window.innerHeight - height - margin);
					setPosition({ left, top });
				};
				place();
				window.addEventListener('scroll', place, true);
				window.addEventListener('resize', place);
				const panel = panelRef.current;
				let observer = null;
				if (typeof ResizeObserver !== 'undefined' && panel !== null) {
					observer = new ResizeObserver(place);
					observer.observe(panel);
				}
				return () => {
					observer?.disconnect();
					window.removeEventListener('scroll', place, true);
					window.removeEventListener('resize', place);
				};
			}, [open, anchorRef, panelRef, gap, margin]);
			return position;
		}

		/**
		 * Closes the card on a pointer press outside of it.
		 * @param root - element holding the button (the card lives in a portal and is checked separately).
		 * @param panel - the card element inside the portal, which also counts as "inside".
		 */
		function useDismissOnOutsidePointer(root, panel, open, setOpen) {
			React.useEffect(() => {
				if (!open) return;
				const closeOutside = (event) => {
					const target = event.target;
					if (!(target instanceof Node)) return;
					if (root.current?.contains(target) === true) return;
					if (panel.current?.contains(target) === true) return;
					setOpen(false);
				};
				document.addEventListener('pointerdown', closeOutside);
				return () => {
					document.removeEventListener('pointerdown', closeOutside);
				};
			}, [root, panel, open, setOpen]);
		}

		/** Closes the card on Escape, the way the built-in shell menu does. */
		function useDismissOnEscape(open, setOpen) {
			React.useEffect(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === 'Escape') setOpen(false);
				};
				document.addEventListener('keydown', onKeyDown);
				return () => {
					document.removeEventListener('keydown', onKeyDown);
				};
			}, [open, setOpen]);
		}

		/**
		 * The current timestamp. The peak/off-peak tariff depends on the wall clock,
		 * while the projections only change while the agent works — so a tick keeps
		 * the tariff label and the countdown to its switch moving even in an idle
		 * session.
		 *
		 * The clock is refreshed the moment the card opens, not on the next tick:
		 * otherwise a card opened right after a spent minute would show the countdown
		 * of that minute. A background tab throttles timers, so "each time I open the
		 * popup" has to be an explicit refresh rather than a bet on the interval.
		 * @param active - whether the card is open.
		 * @returns the current timestamp.
		 */
		function useCurrentTime(active) {
			const [now, setNow] = React.useState(() => Date.now());
			// The layout effect runs before the browser paints, so the freshly opened
			// card is drawn with the fresh clock and does not flash the stale value.
			React.useLayoutEffect(() => {
				setNow(Date.now());
			}, [active]);
			React.useEffect(() => {
				// An open card shows seconds in the last hour before a switch, so it
				// ticks every second; a closed one only needs the tariff itself to move.
				const id = window.setInterval(() => setNow(Date.now()), active ? 1000 : 1000 * 60);
				return () => window.clearInterval(id);
			}, [active]);
			return now;
		}

		/**
		 * Model price by route. Only the official DeepSeek providers have a price
		 * list, so leaving a foreign route unpriced is more honest than estimating it
		 * with DeepSeek rates.
		 * @param route - the selected route `{ provider, model }`, or null.
		 * @returns the model rates, or undefined — if the route has no price.
		 */
		function priceOf(route) {
			return route !== null && route !== undefined && OFFICIAL_PROVIDERS.includes(route.provider)
				? MODEL_PRICES[route.model]
				: undefined;
		}

		/**
		 * Route rates for the active tariff. Peak hours cost exactly twice as much,
		 * so the tariff is picked by the Beijing-time rule at render time.
		 * @param route - the selected route `{ provider, model }`, or null.
		 * @param peak - whether the peak rate is in effect.
		 * @returns the tariff rates, or undefined — if the route has no price.
		 */
		function tariffOf(route, peak) {
			const price = priceOf(route);
			return price === undefined ? undefined : peak ? price.peak : price.offPeak;
		}

		/**
		 * A skeleton bar in place of a value. While the balance is being read it
		 * takes the place of the digits and holds the row height: a "loading" note
		 * added and removed a row, which made the card change height and the popup
		 * jump.
		 * @param width - bar width in pixels.
		 */
		function skeleton(width) {
			return h('span', {
				className: css.skeleton,
				style: { width: `${width}px` },
				'aria-hidden': true,
			});
		}

		/**
		 * Builds the button label and the card contents from the projections, the
		 * rate, and the balance.
		 * @param peakWindow - the peak window in effect, or undefined during off-peak
		 *   hours; it decides both the rate and the range printed in the tariff row.
		 * @param offsetMs - the viewer's UTC offset, printed with the range and the API cost.
		 * @param tariffSwitchMs - milliseconds until the tariff switch, or undefined —
		 *   if the peak rule failed to compute it (then `tariffError` is not empty).
		 * @returns the label, the semantic row groups, the notes, and the "value unknown" flag.
		 */
		function describeSession({
			t,
			usage,
			route,
			peakWindow,
			offsetMs,
			tariffSwitchMs,
			tariffError,
			rate,
			rateError,
			balance,
			subagents,
		}) {
			const peak = peakWindow !== undefined;
			const price = priceOf(route);
			const tariff = tariffOf(route, peak);
			const billed = tariff === undefined ? undefined : sessionCost(usage, tariff);
			const toRub = (usd) => (rate === undefined ? undefined : usd * rate.rate);
			const rub = billed === undefined ? undefined : toRub(billed);
			const money = (usd) => {
				const value = toRub(usd);
				return value === undefined ? undefined : formatRub(value);
			};

			// Rows go in groups, with a divider drawn between them by the card.
			// An empty group is dropped entirely, so that no dangling rule is left.
			const identityRows = [
				[t('panel.model'), route === null ? t('panel.modelUnknown') : `${route.provider}/${route.model}`],
				[
					t('panel.tariff'),
					price === undefined
						? t('panel.priceUnknown')
						: peak
							? h(
									'span',
									{ className: css.peak },
									t('panel.tariff.peak', { range: peakRangeLabel(peakWindow, offsetMs) }),
								)
							: t('panel.tariff.offPeak'),
				],
				[t('panel.tariffSwitch'), tariffSwitchMs === undefined ? t('value.unknown') : formatSpan(tariffSwitchMs)],
			];

			const costRows = [
				[
					t('panel.apiCost', { zone: utcOffsetLabel(offsetMs) }),
					billed === undefined ? t('value.unknown') : `$${USD_FORMAT.format(billed)}`,
				],
			];
			if (rate !== undefined) {
				costRows.push([
					t('panel.rate', { date: formatRateDate(rate.publishedAt) }),
					`${RATE_FORMAT.format(rate.rate)} ₽`,
				]);
			}

			// Subagents are billed in their own sessions, so their spend is read
			// separately and is not mixed into the session row price: the "total" row
			// shows the cost of the whole session, while the button label stays the
			// spend of this session alone.
			const subagentRows = [];
			let subagentsNote;
			if (subagents.count > 0) {
				if (subagents.noteKey !== undefined) {
					// At least one child was not read: the sum is incomplete, so the row
					// is not shown at all — printing the parent price under it would be a lie.
					subagentsNote = t(subagents.noteKey, subagents.noteParams);
				} else if (subagents.entries === undefined) {
					// No sums yet: show loading even in the frame between a change of the
					// child set and the store response, otherwise the block silently vanishes.
					subagentsNote = t('panel.subagentsLoading');
				} else {
					let childrenUsd = 0;
					let priced = true;
					for (const entry of subagents.entries) {
						const childUsage = entry.usage;
						// A child with no spend of its own needs no price: zero is zero.
						if (childUsage === undefined || totalTokens(childUsage) === 0) continue;
						const childTariff = tariffOf(entry.route ?? route, peak);
						if (childTariff === undefined) {
							priced = false;
							break;
						}
						childrenUsd += sessionCost(childUsage, childTariff);
					}
					const totalRub = priced && billed !== undefined ? toRub(billed + childrenUsd) : undefined;
					if (totalRub !== undefined) {
						subagentRows.push([t('panel.withSubagents'), formatRub(totalRub)]);
					} else {
						subagentsNote = t('panel.subagentsNoPrice');
					}
				}
			}

			// Cache: the price of the same session without a cache, and the difference
			// against the actual one. Both values use the same tariff, so the
			// comparison is fair.
			const cacheRows = [];
			if (tariff !== undefined && usage.cacheReadTokens > 0) {
				const savingsUsd = (usage.cacheReadTokens * (tariff.cacheMiss - tariff.cacheHit)) / 1_000_000;
				const withoutCache = money((billed ?? 0) + savingsUsd);
				const savings = money(savingsUsd);
				if (withoutCache !== undefined) cacheRows.push([t('panel.withoutCache'), withoutCache]);
				if (savings !== undefined) cacheRows.push([t('panel.cacheSavings'), savings]);
			}

			// The balance is re-read every time the card opens, so while the request is
			// in flight a skeleton takes the place of the digits — both when previous
			// wallets are already known and when this is the first answer. The former
			// "loading" note added a row at the bottom of the card and removed it
			// again, and the whole popup jumped up and down. A reason from a previous
			// failure takes precedence: if there is one, a note is shown rather than a
			// skeleton, otherwise the error would flicker as a placeholder.
			const balanceLoading = balance.loading && balance.noteKey === undefined;
			const balanceRows = [];
			// An empty remainder from Platform is not zero: show a dash rather than a
			// bare currency symbol without an amount.
			const walletValue = (wallet) => {
				const balance = formatWalletBalance(wallet.balance);
				return balance === '' ? t('value.unknown') : `${currencyMark(wallet.currency)}${balance}`;
			};
			const pushWalletRows = (wallets, labelKey, skipZero) => {
				for (const wallet of wallets) {
					// An empty bonus wallet is not printed: a "Bonus 0.00" row says
					// nothing beyond the absence of a bonus.
					if (skipZero && isZeroBalance(wallet.balance)) continue;
					balanceRows.push([
						t(labelKey, { currency: wallet.currency }),
						balanceLoading ? skeleton(SKELETON_VALUE_WIDTH) : walletValue(wallet),
					]);
				}
			};
			if (balance.wallets !== undefined) pushWalletRows(balance.wallets, 'panel.balance', false);
			if (balance.bonuses !== undefined) pushWalletRows(balance.bonuses, 'panel.bonus', true);
			// There is no first answer yet, so even the labels are unknown: the
			// placeholder rows repeat the usual set of wallets so that the digits land
			// in their places.
			if (balanceLoading && balance.wallets === undefined && balance.bonuses === undefined) {
				for (let index = 0; index < BALANCE_PLACEHOLDER_ROWS; index += 1) {
					balanceRows.push([skeleton(SKELETON_LABEL_WIDTH), skeleton(SKELETON_VALUE_WIDTH)]);
				}
			}

			const groups = [
				{ key: 'identity', rows: identityRows },
				{ key: 'cost', rows: costRows },
				{ key: 'subagents', rows: subagentRows },
				{ key: 'cache', rows: cacheRows },
				{ key: 'balance', rows: balanceRows },
			].filter((group) => group.rows.length > 0);

			const notes = [];
			if (rateError !== undefined) {
				notes.push(
					rate === undefined
						? t('panel.rateMissing', { reason: rateError })
						: t('panel.rateError', { reason: rateError }),
				);
			}
			if (tariffError !== undefined) notes.push(t('panel.tariffError', { reason: tariffError }));
			if (balance.noteKey !== undefined) notes.push(t(balance.noteKey, balance.noteParams));
			if (subagentsNote !== undefined) notes.push(subagentsNote);

			return {
				label: rub === undefined ? t('value.unknown') : formatRub(rub),
				groups,
				notes,
				unknown: rub === undefined,
			};
		}

		/**
		 * The card with the cost breakdown.
		 * @param props - the assembled row groups, the position relative to the button, and the card ref.
		 */
		function CostPanel({ t, described, pos, panelRef }) {
			return h(
				'div',
				{
					ref: panelRef,
					className: css.panel,
					role: 'dialog',
					'aria-label': t('panel.title'),
					style: pos ?? MEASURE_STYLE,
				},
				h(
					'div',
					{ className: css.title },
					h('span', { className: css.titleLabel }, t('panel.title')),
					h('span', { className: css.titleValue }, described.label),
				),
				h('div', { className: css.titleRule, 'aria-hidden': true }),
				h(
					'div',
					{ className: css.details },
					described.groups.flatMap((group, index) => [
						...(index > 0 ? [h('div', { key: `rule-${group.key}`, className: css.divider, 'aria-hidden': true })] : []),
						h(
							'dl',
							{ key: group.key, className: css.section },
							// The key is the index, not the label text: while loading, the
							// label of a balance row is a skeleton element rather than a string.
							group.rows.flatMap(([label, value], row) => [
								h('dt', { key: `dt-${group.key}-${row}` }, label),
								h('dd', { key: `dd-${group.key}-${row}` }, value),
							]),
						),
					]),
				),
				described.notes.length === 0
					? null
					: h(
							'div',
							{ className: css.notes },
							described.notes.map((note) => h('p', { key: note, className: css.note }, note)),
						),
			);
		}

		/**
		 * The dock cell. The cost is computed from the last used model: the
		 * `tokenUsage` projection holds the whole session total and is not split by
		 * route, so when the model changes mid-session the entire amount is estimated
		 * with the last one — the model is always visible in the card.
		 */
		function RubCostPill({ useProjection, t, rateStore, balanceStore, subagentStore }) {
			const usage = useProjection('tokenUsage');
			const modelSelection = useProjection('modelSelection');
			const catalog = useProjection('subagentCatalog');
			const rateState = React.useSyncExternalStore(rateStore.subscribe, rateStore.getSnapshot);
			const balance = React.useSyncExternalStore(balanceStore.subscribe, balanceStore.getSnapshot);
			const subagentState = React.useSyncExternalStore(subagentStore.subscribe, subagentStore.getSnapshot);
			// The card is opened and closed by the same state that decides whether the
			// clock is refreshed, so `open` is declared before the clock hook.
			const [open, setOpen] = React.useState(false);
			const now = useCurrentTime(open);
			const rootRef = React.useRef(null);
			const panelRef = React.useRef(null);
			const pos = usePanelPosition({ open, anchorRef: rootRef, panelRef, gap: PANEL_GAP, margin: PANEL_MARGIN });
			useDismissOnOutsidePointer(rootRef, panelRef, open, setOpen);
			useDismissOnEscape(open, setOpen);

			// Children come from the projection, their spend from separate requests.
			// The list of children rarely changes, and the data is re-read along with
			// it, while the spend is polled while the card is open: a live child keeps
			// growing it.
			const childIds = catalog === undefined ? [] : catalog.map((child) => child.id);
			const childKey = sessionIdsKey(childIds);
			React.useEffect(() => {
				if (childKey === '') {
					subagentStore.clear();
					return;
				}
				void subagentStore.refresh(childIds);
				if (!open) return;
				const id = window.setInterval(() => void subagentStore.refresh(childIds), SUBAGENT_POLL_MS);
				return () => window.clearInterval(id);
				// childIds is rebuilt on every render, but its content is described by childKey.
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [open, childKey]);

			if (usage === undefined || totalTokens(usage) === 0) return null;

			// The peak rule is the only place where the calculation can throw. The cell
			// must not bring down the conversation dock: the tariff-switch row shows
			// "—", and the reason goes into a note.
			let tariffSwitchMs;
			let tariffError;
			try {
				tariffSwitchMs = nextTariffSwitch(now) - now;
			} catch (error) {
				tariffError = String(error);
			}

			const described = describeSession({
				t,
				usage,
				route: modelSelection?.lastUsed ?? null,
				peakWindow: peakWindowAt(now),
				offsetMs: viewerOffsetMs(now),
				tariffSwitchMs,
				tariffError,
				rate: rateState.rate,
				rateError: rateState.error,
				balance,
				// Amounts are accepted only for the child set they were read for:
				// the projection and the store do not update in the same frame.
				subagents: {
					entries: subagentState.idsKey === childKey ? subagentState.entries : undefined,
					noteKey: subagentState.noteKey,
					noteParams: subagentState.noteParams,
					count: childIds.length,
				},
			});

			return h(
				'span',
				{ ref: rootRef, className: css.anchor },
				h(
					'button',
					{
						type: 'button',
						className: described.unknown ? `${css.pill} ${css.unknown}` : css.pill,
						'aria-haspopup': 'dialog',
						'aria-expanded': open,
						'aria-label': `${t('panel.title')}: ${described.label}`,
						onClick: () => {
							const next = !open;
							setOpen(next);
							// The balance changes as you spend, so it is re-read every time
							// the card opens rather than once over the lifetime of the page.
							if (next) void balanceStore.refresh();
						},
					},
					h('span', { className: css.label }, described.label),
				),
				open ? ReactDOM.createPortal(h(CostPanel, { t, described, pos, panelRef }), document.body) : null,
			);
		}

		/**
		 * Adds the panel styles to the document.
		 * @returns a function that removes the styles when the plugin unloads.
		 */
		function applyStyles() {
			const tag = document.createElement('style');
			tag.dataset.plugin = '@stmol/dsh-rub-cost';
			tag.dataset.pluginCss = '@stmol/dsh-rub-cost/panel.css';
			tag.textContent = STYLES;
			document.head.appendChild(tag);
			return () => tag.remove();
		}

		return {
			inject: ['slots', 'locale'],
			apply(ctx) {
				ctx.effect(() => applyStyles(), 'dsh-rub-cost: styles');
				ctx.effect(() => {
					const disposers = Object.entries(DICTIONARIES).map(([locale, dict]) =>
						ctx.locale.register(NS, locale, dict),
					);
					return () => {
						for (const dispose of disposers) dispose();
					};
				}, 'dsh-rub-cost: dictionaries');

				const rateStore = createRateStore();
				ctx.effect(() => {
					const controller = new AbortController();
					void rateStore.refresh(controller.signal);
					return () => controller.abort();
				}, 'dsh-rub-cost: exchange rate');

				// The account controller is optional: without it the plugin keeps
				// computing the cost, and the card explains why there is no balance.
				//
				// Both names have to be injected: `remote` provides the namespace
				// itself, and `remote.account` provides the readiness of its
				// contribution (the account controller). With `remote.account` alone the
				// callback fires, but touching `scope.remote` throws «cannot get property
				// "remote" without inject», because the namespace was never requested
				// from the container. The built-in client packages
				// (`ui-settings-account`, `ui-chat`) declare their dependencies the same way.
				const accountAccess = { read: undefined };
				const balanceStore = createBalanceStore(accountAccess);
				ctx.inject(['remote', 'remote.account'], (scope) => {
					accountAccess.read = () =>
						scope.remote.account.getBalance({
							version: CLIENT_VERSION,
							locale: ctx.locale.getSnapshot().active,
							timezoneOffsetSeconds: viewerOffsetMs(Date.now()) / 1000,
						});
					scope.effect(() => {
						void balanceStore.refresh();
						return () => {
							accountAccess.read = undefined;
						};
					}, 'dsh-rub-cost: account balance');
				});
				ctx.effect(() => () => balanceStore.dispose(), 'dsh-rub-cost: balance');

				// Subagent capabilities are optional too: without the client session
				// controller the card computes the spend of this session alone and
				// explains why there is no "total with subagents" row. Both names are
				// injected — the namespace and the readiness of the `remote.session`
				// contribution, exactly as for the balance above.
				const sessionAccess = { read: undefined };
				const subagentStore = createSubagentStore(sessionAccess);
				ctx.inject(['remote', 'remote.session'], (scope) => {
					sessionAccess.read = (params) => scope.remote.session.projections(params);
					scope.effect(() => () => {
						sessionAccess.read = undefined;
					}, 'dsh-rub-cost: subagent sessions');
				});
				ctx.effect(() => () => subagentStore.dispose(), 'dsh-rub-cost: subagents');

				ctx.slots.inject('conversation.composer.dock', () =>
					ctx.slots.register(
						{ name: 'conversation.composer.dock', id: 'rub-cost', order: 1, locale: NS },
						(props) => h(RubCostPill, { ...props, rateStore, balanceStore, subagentStore }),
					),
				);
			},
		};
	},
});
