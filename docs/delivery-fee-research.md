# Delivery fee research & recommendation

**Date:** 21 October 2026 (updated 22 October 2026)
**Status:** approved and implemented in code — deploy pending
**Decision (22 Oct 2026):** Lagos metro stays at **₦3,500** and is served by local Computer Village dispatch riders (₦1,500–₦3,000 per drop); the other three zones move to **₦6,500 / ₦8,000 / ₦9,000**. 3–5 kg attracts a **₦1,500** manual surcharge; the free-delivery threshold stays at ₦1,000,000.

**Scope:** what it actually costs to deliver a Timeline Global Systems order (courier + packaging + payment fees + handling) and what the store should charge, zone by zone, without overcharging or undercharging customers.

---

## 1. Executive summary

The store currently charges **₦3,500 Lagos / ₦5,500 South West / ₦7,500 everywhere else**, with free delivery from ₦1,000,000 (effectively never).

Lagos is the exception to the interstate cost problem: the store sits in **Computer Village, Ikeja**, surrounded by same-day dispatch riders. A metro drop costs roughly **₦1,500–₦3,000**, so the current **₦3,500 is reasonable and stays unchanged**. Everywhere else, measured against live courier quotes for a realistic 1–2 kg gadget parcel, the current fees lose money before payment processing costs:

| Zone | Current fee | Cost basis | Packaging | Result |
|---|---|---|---|---|
| Lagos metro | ₦3,500 | ~₦2,500 local dispatch (range ₦1,500–3,000) | ~₦400 | **+₦600** |
| South West | ₦5,500 | ₦5,993–6,346 courier | ~₦400 | **−₦893 to −₦1,246** |
| South East / South South / Kwara | ₦7,500 | ₦7,403 courier | ~₦400 | **−₦303** |
| Northern Nigeria | ₦7,500 | ₦8,107–8,460 courier | ~₦400 | **−₦1,007 to −₦1,360** |
| Akwa Ibom / Cross River | ₦7,500 | ₦8,813 courier | ~₦400 | **−₦1,713** |

Recommended replacement (4 zones, parcel up to 2 kg):

| Zone | Included states | Fee | Cost basis | Coverage |
|---|---|---|---|---|
| **Lagos** | Lagos metro | **₦3,500** | ~₦2,500 local dispatch | +₦600 over dispatch + packaging |
| **South West** | Ogun, Oyo, Osun, Ondo, Ekiti (+ Ikorodu, Mowe/Berger) | **₦6,500** | ₦5,993–6,346 | +₦107 (+₦57 Ikorodu*) |
| **South East / South South + Kwara** | Abia, Anambra, Ebonyi, Imo, Enugu, Edo, Delta, Rivers, Bayelsa, Kwara | **₦8,000** | ₦7,403 | +₦197 |
| **North + Akwa Ibom / Cross River** | FCT, Plateau, Kano, Kaduna and all North East/North West/North Central states, Akwa Ibom, Cross River | **₦9,000** | ₦8,107–8,813 | +₦81 average |

\* Ikorodu costs ₦6,346 + ₦400 = ₦6,746; at ₦6,500 the shortfall is ₦246 — accepted as a rounding edge case.

Rules that go with the table:

- **≤ 2 kg included.** 0.5 kg, 1 kg and 2 kg are all quoted at the same price by Fez.
- **3–5 kg: + ₦1,500.** Fez charges ~₦1,060 more at 5 kg and boxed packaging costs ~₦500 extra.
- **Above 5 kg: manual quote** (Fez's public quote endpoint only returns bike rates; oversized items need their dashboard/sales).
- **Store pickup stays free** — it is already implemented and is the best way for price-sensitive Lagos customers to avoid the ₦4,000 fee.
- **Free-delivery threshold: keep ₦1,000,000 for now.** Once real product prices/margins exist, a threshold of ₦300,000 max keeps delivery at ≤3% of order value.
- **Payment processing (Paystack ~1.5% + ₦100) is deliberately not added to the delivery fee** — it is a cost of sales that product margin should carry. If the owner wants delivery to be fully self-funding including payment fees, the table would have to be ₦4,000 (Lagos, local dispatch) / ₦7,500 / ₦9,000 / ₦10,000, which is not competitive.

The single highest-leverage operational move: **formalise a Lagos dispatch partner** (H Express/Zariqo/Kwik) and **negotiate SME/volume rates with Fez** for interstate parcels. Fez's business portal advertises flexible/volume pricing and insurance; a 15% discount makes the three interstate bands fully self-funding including payment fees.

---

## 2. What was measured

### 2.1 Courier quotes — Fez (primary cost basis)

Live quotes were pulled from Fez's public quote endpoint (`POST https://customerapi.fezdelivery.co/v1/getpricesV2`, Lagos origin zone 572 — Surulere/Lagos Mainland Central, `deliveryType: bike`) for **all 36 states + FCT** at 1, 2 and 5 kg, plus 0.5 kg spot checks. The returned totals are **all-in**: base rate + 10% fuel surcharge + 7.5% VAT.

Example build-up (Lagos → Abuja, 1 kg): base ₦6,899.72 + fuel surcharge ₦689.97 + VAT ₦517.48 = **₦8,107.17**.

Costs by destination at 1–2 kg (identical price at 0.5, 1 and 2 kg) and 5 kg:

| Destination band | States | 1–2 kg | 5 kg |
|---|---|---|---|
| Lagos metro | Lagos (Surulere, Island/VI, Ikeja, Lekki, Ajah, Agege, Festac) | ₦3,541 | ₦4,599 |
| Ikorodu | Lagos (Ikorodu) | ₦6,346 | ₦7,403 |
| Ogun axis | Berger/Mowe/Ibafo corridor | ₦5,993 | ₦7,050 |
| South West | Ogun, Oyo, Osun, Ondo, Ekiti | ₦5,993 | ₦7,050 |
| South East + South South + Kwara | Abia, Anambra, Ebonyi, Imo, Enugu, Edo, Delta, Rivers, Bayelsa, Kwara | ₦7,403 | ₦8,460 |
| FCT | Abuja | ₦8,107 | ₦9,165 |
| All northern states + Plateau | Kano, Kaduna, Katsina, Kebbi, Sokoto, Zamfara, Jigawa, Bauchi, Gombe, Borno, Yobe, Adamawa, Taraba, Benue, Kogi, Nasarawa, Niger, Plateau | ₦8,460 | ₦9,518 |
| Akwa Ibom / Cross River | Uyo, Calabar | ₦8,813 | ₦9,870 |

Notes:

- Fez's Individuals plan advertises **insurance + express delivery included**; SME/corporate plans offer flexible/volume pricing. Confirm the insurance ceiling for high-value gadgets (>₦200k) before relying on it.
- `car` and `van` delivery types return 404 on the public quote endpoint — only bike is self-service. Bulky shipments need a manual quote.
- Weights round up to whole-kg tiers; 0.5 kg costs the same as 1 kg.

### 2.2 Courier quotes — GIG Logistics (premium alternative)

GIG's public calculator API (`POST https://agility.giglogistics.com/api/portal/getpricequote`, Lagos station 4) was queried for 35 states at 0.5–5 kg with ₦50,000 declared value. GIG's price includes 1% declared-value insurance (₦500 on ₦50k).

| Band | 1 kg | 5 kg |
|---|---|---|
| South West + Kwara + Edo/Delta/Anambra (GIG's cheapest band) | ₦9,371 | ₦16,325 |
| Abuja, most South East/South South, most of the North | ₦10,499 | ₦17,498 |
| Far north (Kano, Borno, Yobe, Zamfara, Kebbi, Jigawa, Taraba, Plateau) | ₦12,139 | ₦19,202 |

**GIG is ~1.3–1.6× the price of Fez for the same destination.** It is not the right default courier for this catalogue. Keep it only as a fallback for priority or very high-value shipments where the 1% declared-value insurance is worth the premium.

### 2.3 Other couriers and market context

| Provider | Finding | Usable? |
|---|---|---|
| **Konga Logistics** | Third party logistics arm of Konga; public calculator + API integration + nationwide door-to-door. Custom quotes. | **Request a quote** — potential alternative to Fez |
| **Sendbox** | Aggregator connecting multiple couriers; SME/corporate volume pricing; no public rate card. A 2024 citation put Lagos→Abuja 2 kg around ₦5,700 (dated, unverified). | **Request a quote** — compare against Fez |
| **Konga K-Express** | Rate card PDF (intra-city ₦500 first kg + ₦50/kg; intercity ₦1,000 + ₦100/kg; interstate ₦1,500 + ₦200/kg) is from **April 2015** (PDF metadata) — **obsolete, do not use as a 2026 benchmark**. | No |
| **Redstar Express** | B2B/enterprise pricing; no public retail rates. | Low priority |
| **Kwik / H Express / Zariqo** | Lagos on-demand bike dispatch: Computer Village is the densest rider market in Lagos. Metro drops typically ₦1,500–₦3,000; longer trips (Lekki/Ajah/Ikorodu) ₦3,000–₦4,500. Zariqo advertises from ₦600 (24–48 h), H Express from ₦1,000. | **Yes for Lagos metro** — same/next-day, no interstate coverage. Use Fez/GIG for high-value orders where insurance matters. |
| **GIG price-list article (2026)** | Intra-city ₦3,000–₦5,000 (0–2 kg); Lagos→Abuja ₦6,000–₦9,000 small parcels; door-to-door add-on ₦500–₦2,500. | Corroborates Fez retail as mid-market |
| **Marketplace benchmarks** | Jumia merchant shipping contribution 2026 (incl. VAT): ~₦400 / ₦600 / ₦900 / ₦4,300 per shipment by size class (Jumia Express) and ₦650 / ₦1,000 / ₦1,700 / ₦3,800 (Dropship). Jumia/Konga **subsidise** delivery through commissions and volume — an independent store cannot match their customer-facing fees. | Context only |

### 2.4 Packaging

Small-electronics orders ship safely in a padded poly mailer; power banks and ring lights may need a small carton.

| Item | Price | Per order |
|---|---|---|
| Poly mailers, 100 pcs (Jiji, 25×35 cm) | ₦10,000 | ₦100 |
| Poly mailers, 100 pcs (Jiji, 28×42 cm) | ₦13,000 | ₦130 |
| Poly mailers, 100 pcs (Jiji, 35×45 cm) | ₦16,500 | ₦165 |
| Poly mailers, 100 pcs (Jumia, 32×43 cm) | ₦20,000 | ₦200 |
| Custom-printed courier bags (MOQ 100) | ₦182/pc | ₦182 |
| Bubble wrap + tape + label | — | ₦100–200 |
| Small carton for boxed/fragile items | — | +₦500 |

**Assumption used in the model: ₦400 per order for mailer orders, ₦900 for boxed items.** Bulk buying from Jiji at 100+ pieces keeps this at the low end.

### 2.5 Payment processing

| Item | Cost |
|---|---|
| Paystack local cards | **1.5% + ₦100**, ₦100 waived below ₦2,500, **capped at ₦2,000** |
| Cap reached at | order total ≈ ₦126,667 |
| Paystack international cards | ~3.9% + ₦100 (no cap — verify before enabling) |
| Typical fee at AOV ₦50,000 | ₦850–985 per order |

Paystack's fee applies to the whole order (product + delivery). At ₦50,000 AOV the fee is roughly ₦910 with a ₦4,000 delivery fee — comparable to packaging, and larger than the buffer built into any of the recommended zone fees. This is why payment fees belong in product margin, not in the delivery fee.

### 2.6 Cost pressure context (why to review quarterly)

- Petrol: **₦1,355–₦1,435/litre** nationally (Oct 2026), up ~7.4% since Aug 2026; diesel ~₦3,277/litre.
- Fez passes through a **10% fuel surcharge** + 7.5% VAT on every quote, so courier costs track fuel directly.
- USD/NGN ≈ ₦1,332 (Oct 2026), affecting imported gadget costs and packaging prices.

---

## 3. Break-even model

### 3.1 Cost vs current fees (1–2 kg parcel)

| Zone | Cost basis | + packaging | Cost | Current fee | Result | Recommended | Headroom |
|---|---|---|---|---|---|---|---|
| Lagos metro | ~₦2,500 local dispatch | ₦400 | ₦2,900 | ₦3,500 | **+₦600** | ₦3,500 | +₦600 |
| South West | ₦6,043* | ₦400 | ₦6,443 | ₦5,500 | **−₦943** | ₦6,500 | +₦57 |
| SE/SS + Kwara | ₦7,403 | ₦400 | ₦7,803 | ₦7,500 | **−₦303** | ₦8,000 | +₦197 |
| North + AK/CR | ₦8,519* | ₦400 | ₦8,919 | ₦7,500 | **−₦1,419** | ₦9,000 | +₦81 |

\* Averages include the higher-cost edge cases in each band.

If Fez is used for Lagos metro instead of a local rider, the courier cost alone is ₦3,541 and the current ₦3,500 fee loses ₦441 before packaging — which is why local dispatch is part of the recommendation, not just a cost detail.

### 3.2 The one-fee-for-everywhere alternative

Across all 27 non-South-West destinations, the weighted average courier cost is **₦8,081**, i.e. **₦8,481 with packaging** — so a flat **"rest of Nigeria" fee of ₦8,500 is mathematically fair on average** (before payment fees). It overcharges South East/South South customers by ~₦700 and undercharges Uyo/Calabar by ~₦713. If only three zones are wanted (no code change), this is the defensible option; ₦9,000 adds a ~6% fuel buffer.

### 3.3 Fully self-funding fees (including Paystack, AOV ₦50k)

If the owner wants delivery revenue to cover courier + packaging + payment processing entirely:

| Zone | Exact fee | Rounded |
|---|---|---|
| Lagos metro (local dispatch) | ₦3,807 | ₦4,000 |
| South West | ₦7,404 | ₦7,500 |
| SE/SS + Kwara | ₦8,785 | ₦9,000 |
| North + AK/CR | ₦9,918 | ₦10,000 |

(If Lagos were shipped with Fez, the fully self-funding fee would be ₦4,864 / ₦5,000.)

**Not recommended as customer-facing prices** — they are 11–25% above the recommended table, in an already-premium courier market. Keep payment fees in product margin.

### 3.4 Negotiated-rate sensitivity (what a Fez SME discount would do)

| Zone | 0% off | 10% off | 15% off | 20% off |
|---|---|---|---|---|
| South West (Fez) | −₦891 | −₦286 | **+₦16** | **+₦318** |
| SE/SS + Kwara (Fez) | −₦773 | −₦33 | **+₦338** | **+₦708** |
| North + AK/CR (Fez) | −₦904 | −₦52 | **+₦374** | **+₦800** |

Lagos is not in this table because it uses local dispatch: at ₦2,500 the all-in tail is −₦310; at ₦2,250 it is −₦60; at ₦2,125 it turns **+₦65**; at ₦2,000 it is **+₦190**.

("All-in tail" = recommended fee − courier/dispatch − packaging − Paystack at ₦50k AOV. Positive = shipping covers everything.)

**At 15% off Fez retail, all three interstate bands fully fund themselves including payment fees. Lagos needs a dispatch rate of about ₦2,125 or better — comfortably inside the Computer Village market range.** Retail quotes are an upper bound; negotiating is worth more than raising fees further.

### 3.5 Heavy parcels

| Zone | 5 kg courier | + boxed packaging | Fee at ≤2 kg | Shortfall | Fee needed to fund all-in |
|---|---|---|---|---|---|
| Lagos metro | ₦4,599 | ₦5,499 | ₦4,000 | −₦1,499 | ₦6,500 |
| South West | ₦7,101 | ₦8,001 | ₦6,500 | −₦1,501 | ₦9,000 |
| SE/SS + Kwara | ₦8,460 | ₦9,360 | ₦8,000 | −₦1,360 | ₦10,500 |
| North + AK/CR | ₦9,576 | ₦10,476 | ₦9,000 | −₦1,476 | ₦11,500 |

The **+₦1,500 surcharge for 3–5 kg** closes most of the gap; the remainder is covered by product margin. Above 5 kg needs manual quotes.

### 3.6 Free-delivery threshold

Current ₦1,000,000 is effectively "no free delivery." If a real threshold is wanted, the delivery cost should stay ≤3% of order value: ₦4,000 ÷ 3% = ₦133,000 (Lagos), ₦9,000 ÷ 3% = ₦300,000 (north). A single nationwide **₦300,000** threshold keeps the promise affordable everywhere. Recommendation: revisit only after real product prices and margins are loaded — the current catalogue still has ₦1,000 placeholder prices.

---

## 4. Recommendation

### 4.1 Fee table (target: 4 zones)

| Zone | States | Fee (≤2 kg) | 3–5 kg | >5 kg |
|---|---|---|---|---|
| Lagos | Lagos metro | ₦3,500 | +₦1,500 | quote |
| South West | Ogun, Oyo, Osun, Ondo, Ekiti, Ikorodu, Mowe/Berger corridor | ₦6,500 | +₦1,500 | quote |
| South East / South South + Kwara | Abia, Anambra, Ebonyi, Imo, Enugu, Edo, Delta, Rivers, Bayelsa, Kwara | ₦8,000 | +₦1,500 | quote |
| North + Akwa Ibom / Cross River | FCT, Plateau, Kano, Kaduna, Katsina, Kebbi, Sokoto, Zamfara, Jigawa, Bauchi, Gombe, Borno, Yobe, Adamawa, Taraba, Benue, Kogi, Nasarawa, Niger, Akwa Ibom, Cross River | ₦9,000 | +₦1,500 | quote |

The three interstate bands are within 1.5–6% of measured courier + packaging cost. Lagos is priced against local dispatch (~₦2,500) and keeps a ~₦600 buffer. The table is not designed to profit from delivery; it stops the store from subsidising it — and in Lagos it keeps the customer-facing fee unchanged.

### 4.2 Interim option (3 zones, env change only)

`SHIPPING_FEE_LAGOS=3500`, `SHIPPING_FEE_SOUTH_WEST=6500`, `SHIPPING_FEE_DEFAULT=8500` (or `9000` for a fuel buffer). No code changes; only Render environment variables. Trade-off: South East/South South customers overpay ~₦700; Uyo/Calabar underpay ~₦713.

### 4.3 Implementation map (implemented 22 Oct 2026)

| File | Change |
|---|---|
| `backend/config/settings/base.py` | `SHIPPING_FEE_LAGOS=3500`, `SHIPPING_FEE_SOUTH_WEST=6500`, `SHIPPING_FEE_SOUTH_EAST_SOUTH_SOUTH=8000`, `SHIPPING_FEE_NORTH=9000`, `SHIPPING_FEE_DEFAULT=9000` |
| `backend/apps/cart/pricing.py` | Four-zone lookup; Ikorodu city check maps the Ikorodu corridor to the South West band; `city` passed through quotes and order creation |
| `backend/apps/core/store.py` | `SOUTH_EAST_SOUTH_SOUTH_STATES`, `NORTH_STATES` sets; `shipping_settings()` returns the new tiers |
| `backend/apps/ai_chat/knowledge.py` | Shipping fee sentence updated for four zones and the heavy-parcel note |
| `frontend/src/pages/Info/InfoPage.jsx` | Four rate rows |
| `frontend/src/pages/Info/content.js` | Local-dispatch and heavy-parcel copy |
| `frontend/src/pages/ProductDetails/ProductDetails.jsx` | Shipping tab copy |
| `frontend/src/hooks/useQuote.js`, `pages/Checkout/Checkout.jsx` | City (debounced) included in quote/coupon requests |
| `backend/apps/cart/tests/test_shipping_zones.py` | 36 tests covering every band, Ikorodu variants, settings, pickup and free-shipping |
| Render env vars | `SHIPPING_FEE_LAGOS=3500`, `SHIPPING_FEE_SOUTH_WEST=6500`, `SHIPPING_FEE_SOUTH_EAST_SOUTH_SOUTH=8000`, `SHIPPING_FEE_NORTH=9000` (defaults already match) |

The heavy-parcel surcharge is operational for now (admin confirms 3–5 kg orders before dispatch). Automating it needs cart-level total weight, which needs a `weight_grams` field on `Product`/`ProductVariant` — not present today. Phase 2.

### 4.4 Action list

1. **Deploy and verify** the new fees: `GET /api/store/` should return the four zones; place a Lagos test order and an interstate test order.
2. **Formalise a Lagos dispatch partner** (Kwik/H Express/Zariqo) for metro drops; keep Fez/GIG for high-value orders where insurance matters.
3. **Request SME quotes:** Fez business portal (volume/post-paid), Sendbox, Konga Logistics. Use the Fez retail matrix in this report as the comparison baseline.
4. **Add `weight_grams`** to products when real listings replace the ₦1,000 placeholders, then enable the 3–5 kg surcharge automatically.
5. **Review quarterly** — fuel rose 7.4% in two months; every Fez quote already embeds a 10% fuel surcharge.
6. **Do not use the Konga K-Express 2015 rate card** as a 2026 benchmark.

---

## 5. Assumptions and confidence

| Assumption | Value | Confidence |
|---|---|---|
| Fez retail quotes (all states, 1–5 kg, all-in) | see §2.1 | **High** — live API, all destinations |
| GIG retail quotes | see §2.2 | **High** — live API, 35 states |
| Packaging | ₦400/order mailer, ₦900 boxed | Medium-high — 2026 Jiji/Jumia bulk prices |
| Lagos local dispatch | ~₦2,500/order (range ₦1,500–3,500) | Medium — Computer Village market rates; formalise a partner |
| Paystack | 1.5% + ₦100, cap ₦2,000 | High — published fee schedule |
| Parcel weight 0.5–2 kg | most catalogue items (power banks, mics, chargers, ring lights) | Medium — catalogue has no weight field |
| Failed-delivery/return allowance | not included | Low — no order history yet (3 orders, all pickup) |
| Negotiated SME rates | 10–20% below retail assumed in sensitivity | Medium — unverified until quotes are requested |

The 0.5–2 kg weight assumption and the ~₦2,500 Lagos dispatch average are the main soft spots. Both are safe for the current catalogue (small electronics, Computer Village rider market) but should be replaced with real `weight_grams` data and a signed dispatch rate before scaling paid ads.

---

## 6. Sources

- Fez Delivery public quote API — `https://customerapi.fezdelivery.co/v1/getpricesV2` (21 Oct 2026); pricing page `https://www.fezdelivery.co/pricing` (insurance included on Individuals plan; SME volume pricing).
- GIG Logistics calculator API — `https://agility.giglogistics.com/api/portal/getpricequote` (Oct 2026); brands.ng GIG 2026 price-list article.
- Konga Logistics — `https://logistics.konga.com` (calculator, API integration, door-to-door); K-Express rate card `https://shq.konga.com/files/ratesheets/kexpress.pdf` (PDF metadata: April 2015 — obsolete).
- Sendbox — `https://sendbox.co`, `https://docs.sendbox.co` (rate quotes require an account); brands.ng review of Sendbox.
- Jumia vendor fee sheet 2026 — `https://vendorhub.jumia.com.ng/fees/` (shipping cost contribution ranges, incl. VAT); customer shipping page `https://www.jumia.com.ng/sp-shipping-fees/` (empty CMS page — fees are dynamic at checkout).
- Paystack pricing — published Nigerian card fee 1.5% + ₦100, cap ₦2,000, ₦100 waived under ₦2,500 (fee calculator cross-check, Oct 2026).
- Packaging — Jumia polymailer category and Jiji bulk listings (Oct 2026).
- Fuel — NaijaSabi "Fuel Price in Nigeria Today (October 2026)" and live price ticker: PMS ₦1,355–1,435/L, diesel ₦3,277/L, +7.4% since Aug 2026.
- Local dispatch — H Express / Zariqo / 2026 Lagos dispatch price guides.

Raw research data (outside the repo, in `C:\Users\user\AppData\Local\Temp\opencode\`): `fez_rate_matrix.json`, `fez_gapfill.json`, `fez_zones.json`, `gig_rates_weight_matrix.json`, `gig_value_study.json`, `fee_model_final.py`.
