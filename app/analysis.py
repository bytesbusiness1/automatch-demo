"""Price-verdict engine.

For every listing we estimate a *fair value* from transparent, explainable steps:

  new price of this exact version
    + depreciation for age (model-specific retention rate)
    + mileage vs. the 20,000 km/year average
    + condition adjustments (service history, owners, accident, fleet/rental, warranty)

...then compare the asking price against it. This is a demo heuristic, not a
market valuation: the real product would replace the inputs with scraped
listings and sold-price data, but the *shape* of the output stays the same.
"""
from __future__ import annotations

from .data import LISTINGS, MODELS

CURRENT_YEAR = 2026  # fixed so demo results never drift
EXPECTED_KM_PER_YEAR = 20_000
EXTRAS_RESALE_FACTOR = 0.7  # dealer accessories are worth ~70% of sticker to the next owner
DEMO_EXTRA_AGE = 0.4  # a demo car has effectively lived ~5 months

MODELS_BY_SLUG = {m["slug"]: m for m in MODELS}
LISTINGS_BY_ID = {l["id"]: l for l in LISTINGS}

VERDICTS = {
    "great": {"label": "Great deal", "color": "#2ecc71"},
    "good": {"label": "Good price", "color": "#8bd450"},
    "typical": {"label": "Typical price", "color": "#f5a623"},
    "pricey": {"label": "Pricey", "color": "#f0743a"},
    "overpriced": {"label": "Overpriced", "color": "#e5484d"},
}


def _rand(n: float) -> int:
    return int(round(n))


def fair_breakdown(l: dict) -> tuple[int, list[dict]]:
    """Return (fair_value, steps). Each step: label, amount, kind, note."""
    model = MODELS_BY_SLUG[l["model"]]
    ref = l["ref_new"]
    steps: list[dict] = [
        {"label": "New price of this exact version", "amount": ref, "kind": "base",
         "note": "What the same version costs brand-new today."}
    ]

    if l["condition"] == "New":
        extras = _rand(l.get("extras_value", 0) * EXTRAS_RESALE_FACTOR)
        if extras:
            steps.append({
                "label": "Dealer-fitted extras (at resale value)", "amount": extras, "kind": "adj",
                "note": f"{', '.join(l['extras'])}: sticker value R{l['extras_value']:,}, "
                        f"but worth about 70% to the next owner.".replace(",", " "),
            })
        return ref + extras, steps

    age = CURRENT_YEAR - l["year"]
    eff_age = age + (DEMO_EXTRA_AGE if l["condition"] == "Demo" else 0)

    retained = ref * model["retention"] ** eff_age
    dep = _rand(retained - ref)
    steps.append({
        "label": f"Depreciation ({age} yr{'s' if age != 1 else ''}{', demo' if l['condition'] == 'Demo' else ''})",
        "amount": dep, "kind": "adj",
        "note": f"The {model['model']} keeps about {round(model['retention'] * 100)}% of its value each year.",
    })
    running = ref + dep

    expected_km = eff_age * EXPECTED_KM_PER_YEAR
    diff_km = expected_km - l["mileage"]  # positive = fewer km than average
    pct = max(-0.08, min(0.08, diff_km / 10_000 * 0.005))
    mil = _rand(running * pct)
    if mil:
        steps.append({
            "label": "Mileage vs. average", "amount": mil, "kind": "adj",
            "note": (f"{abs(round(diff_km)):,} km {'below' if diff_km > 0 else 'above'} the "
                     f"{round(expected_km):,} km you'd expect.").replace(",", " "),
        })
    running += mil
    base = running

    def add(label: str, p: float, note: str) -> None:
        nonlocal running
        amt = _rand(base * p)
        if amt:
            steps.append({"label": label, "amount": amt, "kind": "adj", "note": note})
            running += amt

    service = l["service"]
    if service == "full":
        add("Full service history", 0.02, "Documented servicing lowers the risk of hidden problems.")
    elif service == "partial":
        add("Gaps in service history", -0.015, "Missing stamps make the car harder to trust.")
    elif service == "none":
        add("No service history", -0.04, "No records at all.")

    if l["owners"] == 1:
        add("Single owner", 0.015, "Fewer owners usually means more consistent care.")
    elif l["owners"] >= 3:
        add(f"{l['owners']} previous owners", -0.02, "Many owners in a short time is a mild warning sign.")

    if l["history"] == "ex-fleet":
        add("Ex-fleet", -0.02, "Fleet cars see hard use but are often well serviced.")
    elif l["history"] == "ex-rental":
        add("Ex-rental", -0.03, "Many drivers and short trips mean extra wear.")

    if not l["accident_free"]:
        add("Accident repair on record", -0.06, "Buyers and insurers discount repaired cars.")

    if l["warranty_active"]:
        add("Warranty / plan still active", 0.015, "Remaining cover has real value to the next owner.")

    return _rand(running), steps


def verdict_for(price: int, fair: int) -> dict:
    pct = (price - fair) / fair
    if pct <= -0.06:
        key = "great"
    elif pct <= -0.02:
        key = "good"
    elif pct <= 0.05:
        key = "typical"
    elif pct <= 0.12:
        key = "pricey"
    else:
        key = "overpriced"
    return {"key": key, "pct": round(pct, 4), **VERDICTS[key]}


def gauge_for(price: int, fair: int) -> dict:
    lo_axis, hi_axis = fair * 0.80, fair * 1.25
    low, high = fair * 0.95, fair * 1.05

    def pos(x: float) -> float:
        return round(max(0.0, min(100.0, (x - lo_axis) / (hi_axis - lo_axis) * 100)), 2)

    return {
        "low": _rand(low), "high": _rand(high),
        "low_pct": pos(low), "high_pct": pos(high),
        "marker_pct": max(2.0, min(98.0, pos(price))),
    }


def flags_for(l: dict) -> list[dict]:
    flags: list[dict] = []
    age = CURRENT_YEAR - l["year"]
    expected = age * EXPECTED_KM_PER_YEAR

    if not l["accident_free"]:
        flags.append({"severity": "warn", "label": "Accident repaired",
                      "detail": "Ask for the repair invoice and an independent inspection."})
    if l["history"] == "ex-fleet":
        flags.append({"severity": "info", "label": "Ex-fleet",
                      "detail": "Hard working life, but fleet cars are usually serviced on schedule."})
    if l["history"] == "ex-rental":
        flags.append({"severity": "warn", "label": "Ex-rental",
                      "detail": "Many drivers. Check tyres, clutch and interior wear carefully."})
    if l["owners"] >= 3:
        flags.append({"severity": "warn", "label": f"{l['owners']} owners",
                      "detail": "Frequent changes of owner can hide recurring problems."})
    if l["service"] in ("partial", "none"):
        flags.append({"severity": "warn", "label": "Service gaps" if l["service"] == "partial" else "No service history",
                      "detail": "Ask the dealer for any records they have."})
    if l["condition"] == "Used" and l["mileage"] > 100_000 and l["mileage"] > expected * 1.25:
        flags.append({"severity": "warn", "label": "High mileage",
                      "detail": f"{l['mileage']:,} km is well above average for its age.".replace(",", " ")})

    if l["owners"] == 1:
        flags.append({"severity": "good", "label": "One owner", "detail": "A single previous owner."})
    if l["service"] == "full":
        flags.append({"severity": "good", "label": "Full service history", "detail": "Complete, documented servicing."})
    if l["warranty_active"] and l["condition"] != "New":
        flags.append({"severity": "good", "label": "Cover remaining", "detail": l["warranty"] or "Warranty or service plan active."})
    if l["condition"] == "Used" and age > 0 and l["mileage"] < expected * 0.8:
        flags.append({"severity": "good", "label": "Low mileage", "detail": "Fewer kilometres than average for its age."})
    return flags


def analyse(l: dict) -> dict:
    fair, steps = fair_breakdown(l)
    v = verdict_for(l["price"], fair)
    flags = flags_for(l)
    warn = any(f["severity"] == "warn" for f in flags)
    caution = None
    if v["pct"] <= -0.06 and warn:
        caution = "Priced well below fair value, but check the flags first. A cheap price is sometimes cheap for a reason."
    elif v["pct"] <= -0.06:
        caution = "Well below fair value with a clean history. Good deals like this don't usually last."
    elif v["key"] in ("pricey", "overpriced"):
        caution = f"About R{abs(l['price'] - fair):,} more than we'd expect to pay for this car.".replace(",", " ")
    return {
        "fair_value": fair,
        "diff": l["price"] - fair,
        "verdict": v,
        "gauge": gauge_for(l["price"], fair),
        "breakdown": steps,
        "flags": flags,
        "caution": caution,
    }


def summary(l: dict) -> dict:
    """Listing + compact analysis, for grids."""
    a = analyse(l)
    m = MODELS_BY_SLUG[l["model"]]
    return {
        **l,
        "make": m["make"], "model_name": m["model"], "type": m["type"], "segment": m["segment"],
        "fair_value": a["fair_value"], "verdict": a["verdict"], "flags": a["flags"],
    }


def _reasons(cur: dict, alt: dict) -> list[str]:
    out: list[str] = []
    dp = cur["price"] - alt["price"]
    if dp > 0:
        out.append(f"R{dp:,} cheaper".replace(",", " "))
    elif dp < 0:
        out.append(f"{'R' + format(-dp, ',').replace(',', ' ')} more, but better value")
    if cur["condition"] != "New" and alt["condition"] != "New":
        dk = cur["mileage"] - alt["mileage"]
        if dk >= 10_000:
            out.append(f"{dk:,} km fewer".replace(",", " "))
    dy = alt["year"] - cur["year"]
    if dy >= 1:
        out.append(f"{dy} year{'s' if dy > 1 else ''} newer")
    if alt["service"] == "full" and cur["service"] not in ("full", "n/a"):
        out.append("full service history")
    if alt["owners"] == 1 and cur["owners"] != 1:
        out.append("single owner")
    if alt["warranty_active"] and not cur["warranty_active"]:
        out.append("warranty or plan still active")
    if cur["condition"] == "New" and alt["condition"] != "New" and alt["year"] >= CURRENT_YEAR - 2:
        out.append("nearly new, without the new-car depreciation hit")
    return out


UNAVAILABLE = {"Reserved", "Sale pending"}


def alternatives(l: dict, limit: int = 3) -> list[dict]:
    cur_a = analyse(l)
    seg = MODELS_BY_SLUG[l["model"]]["segment"]
    found: list[tuple[float, dict]] = []
    for o in LISTINGS:
        if o["id"] == l["id"] or MODELS_BY_SLUG[o["model"]]["segment"] != seg:
            continue
        if o["status"] in UNAVAILABLE or not o["accident_free"]:
            continue
        oa = analyse(o)
        gain = cur_a["verdict"]["pct"] - oa["verdict"]["pct"]  # how much better the value is
        if gain < 0.03:
            continue
        # Normally stay within +8% of the price; allow up to +20% when the value gain is large.
        cap = 1.20 if gain >= 0.15 else 1.08
        if o["price"] > l["price"] * cap:
            continue
        s = summary(o)
        s["reasons"] = _reasons(l, o)
        found.append((oa["verdict"]["pct"], s))
    found.sort(key=lambda t: (t[0], t[1]["price"]))
    return [s for _, s in found[:limit]]


def model_summary(m: dict) -> dict:
    items = [summary(l) for l in LISTINGS if l["model"] == m["slug"]]
    prices = [i["price"] for i in items]
    return {
        **m,
        "count": len(items),
        "from_price": min(prices),
        "verdicts": [i["verdict"]["key"] for i in items],
        "colours": [i["colour_hex"] for i in items],
        "conditions": sorted({i["condition"] for i in items}),
    }
