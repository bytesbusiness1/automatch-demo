# AutoMatch (demo)

Search a car, see whether the price is justified, and find better second-hand alternatives.
Early-stage demo: 7 popular South African models x 3 listings each (different dealers, sources,
mileage, condition and status). All listings and dealers are **illustrative demo data**.

Stack: Python, FastAPI, vanilla HTML/CSS/JS. Deploys to Render.com from GitHub.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000

## Deploy on Render (free tier)

1. Push this folder to a GitHub repo.
2. In Render: **New > Blueprint** (it reads `render.yaml`), or **New > Web Service** with
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. The free tier sleeps after inactivity, so open the URL a minute before a demo.

## Layout

```
app/data.py       7 models + 21 listings (edit prices/stories here)
app/analysis.py   fair-value engine, verdicts, flags, alternatives
app/main.py       FastAPI routes + serves /static
static/           index.html, style.css, app.js (hash-routed single page)
```

## API

| Route | What it returns |
| --- | --- |
| `GET /api/models` | the 7 models with from-price and verdict dots |
| `GET /api/models/{slug}` | one model and its 3 listings |
| `GET /api/search?q=&condition=&source=&segment=&max_price=&sort=` | filtered listings |
| `GET /api/suggest?q=` | typeahead suggestions |
| `GET /api/listings/{id}` | listing, price analysis, alternatives, sibling versions |
| `GET /health` | health check for Render |

## How the verdict works

Fair value starts from the **new price of the same version**, then adds:
age depreciation (per-model retention rate), mileage vs. 20,000 km/year, and adjustments for
service history, owners, accident repairs, ex-fleet/ex-rental use, and remaining warranty.
For new cars it adds 70% of any dealer-fitted extras. The asking price is compared with the result:

| Asking vs. fair | Verdict |
| --- | --- |
| 6% or more below | Great deal |
| 2-6% below | Good price |
| within -2% to +5% | Typical price |
| 5-12% above | Pricey |
| more than 12% above | Overpriced |

A "great deal" with red flags (accident repair, ex-fleet, high mileage) is shown with a caution.

Alternatives are other available, accident-free listings in the same body segment that cost no
more than 8% extra and have a clearly better verdict.

## Swapping in real data later

Replace `LISTINGS` in `app/data.py` with a loader (scrapers or a DB). Keep the same fields and the
rest of the app keeps working. The only fields the engine truly needs are `ref_new`, `year`,
`mileage`, `price`, `condition`, `service`, `owners`, `accident_free`, `history`, `warranty_active`.
