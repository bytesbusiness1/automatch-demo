from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from .analysis import (
    LISTINGS_BY_ID,
    MODELS_BY_SLUG,
    alternatives,
    analyse,
    model_summary,
    summary,
)
from .data import LISTINGS, MODELS

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="AutoMatch demo API", version="0.1.0")

# Words people type that don't appear literally in the data.
SYNONYMS = {
    "pickup": "bakkie", "pick-up": "bakkie", "truck": "bakkie", "ute": "bakkie",
    "crossover": "suv", "hatch": "hatchback", "secondhand": "used", "second-hand": "used",
    "preowned": "used", "pre-owned": "used", "brandnew": "new", "brand-new": "new",
    "wbc": "webuycars", "autotrader": "autotrader", "cars.co.za": "cars.co.za",
}


def _haystack(l: dict) -> str:
    m = MODELS_BY_SLUG[l["model"]]
    parts = [
        l["title"], l["variant"], str(l["year"]), l["condition"], l["status"], l["dealer"],
        l["source"], l["city"], l["fuel"], l["transmission"], l["colour"],
        m["make"], m["model"], m["type"], m["segment"],
    ]
    if l["condition"] == "Demo":
        parts.append("used")  # demo cars are bought as near-new used stock
    return " ".join(parts).lower()


def _tokens(q: str) -> list[str]:
    out = []
    for t in q.lower().replace(",", " ").split():
        out.append(SYNONYMS.get(t, t))
    return out


def _matches(l: dict, tokens: list[str]) -> bool:
    hay = _haystack(l)
    return all(t in hay for t in tokens)


@app.get("/health")
def health():
    return {"ok": True, "models": len(MODELS), "listings": len(LISTINGS)}


@app.get("/api/models")
def list_models():
    return {"models": [model_summary(m) for m in MODELS]}


@app.get("/api/models/{slug}")
def get_model(slug: str):
    m = MODELS_BY_SLUG.get(slug)
    if not m:
        raise HTTPException(404, "Model not found")
    items = [summary(l) for l in LISTINGS if l["model"] == slug]
    return {"model": model_summary(m), "listings": items}


@app.get("/api/search")
def search(
    q: str = "",
    condition: list[str] = Query(default=[]),
    source: list[str] = Query(default=[]),
    segment: str = "",
    max_price: int | None = None,
    sort: str = "relevance",
):
    tokens = _tokens(q)
    items = [l for l in LISTINGS if _matches(l, tokens)] if tokens else list(LISTINGS)

    if condition:
        wanted = {c.lower() for c in condition}
        items = [l for l in items if l["condition"].lower() in wanted
                 or ("used" in wanted and l["condition"] == "Demo")]
    if source:
        wanted_src = {s.lower() for s in source}
        items = [l for l in items if l["source"].lower() in wanted_src]
    if segment:
        items = [l for l in items if MODELS_BY_SLUG[l["model"]]["segment"] == segment]
    if max_price:
        items = [l for l in items if l["price"] <= max_price]

    results = [summary(l) for l in items]
    if sort == "price_asc":
        results.sort(key=lambda r: r["price"])
    elif sort == "price_desc":
        results.sort(key=lambda r: -r["price"])
    elif sort == "best_value":
        results.sort(key=lambda r: r["verdict"]["pct"])
    elif sort == "mileage":
        results.sort(key=lambda r: r["mileage"])

    matched_slugs = {r["model"] for r in results}
    models = [model_summary(m) for m in MODELS if m["slug"] in matched_slugs]
    return {"query": q, "count": len(results), "models": models, "listings": results}


@app.get("/api/suggest")
def suggest(q: str = ""):
    tokens = _tokens(q)
    if not tokens:
        return {"suggestions": []}
    out: list[dict] = []
    for m in MODELS:
        hay = f"{m['make']} {m['model']} {m['type']}".lower()
        if all(t in hay for t in tokens):
            out.append({"kind": "model", "label": f"{m['make']} {m['model']}",
                        "sub": m["type"], "href": f"#/model/{m['slug']}"})
    for l in LISTINGS:
        if _matches(l, tokens) and len(out) < 7:
            out.append({"kind": "listing", "label": l["title"],
                        "sub": f"{l['dealer']} · {l['source']}", "href": f"#/listing/{l['id']}"})
    return {"suggestions": out[:7]}


@app.get("/api/listings/{listing_id}")
def get_listing(listing_id: str):
    l = LISTINGS_BY_ID.get(listing_id)
    if not l:
        raise HTTPException(404, "Listing not found")
    m = MODELS_BY_SLUG[l["model"]]
    siblings = [summary(o) for o in LISTINGS if o["model"] == l["model"] and o["id"] != l["id"]]
    return {
        "listing": {**l, "make": m["make"], "model_name": m["model"], "type": m["type"],
                    "segment": m["segment"], "model_blurb": m["blurb"]},
        "analysis": analyse(l),
        "alternatives": alternatives(l),
        "siblings": siblings,
    }


# Static front-end (must be mounted last so /api and /health win).
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
