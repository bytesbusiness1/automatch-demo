/* AutoMatch demo front-end: vanilla JS, hash router, talks to the FastAPI /api. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const qInput = $("#q");
  const suggestBox = $("#suggest");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Number(n).toLocaleString("en-ZA");
  const rand = (n) => "R" + num(n);
  const km = (l) => (l.condition === "New" ? "New · 0 km" : num(l.mileage) + " km");

  async function api(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(r.status === 404 ? "Not found" : "Request failed");
    return r.json();
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  /* ---------- car illustrations (inline SVG, tinted per listing colour) ---------- */
  let svgN = 0;
  function mix(hex, to, amt) {
    const h = hex.replace("#", "");
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const t = to === "w" ? 255 : 0;
    return "#" + c.map((v) => Math.round(v + (t - v) * amt).toString(16).padStart(2, "0")).join("");
  }
  const SHAPES = {
    hatchback: {
      body: "M38 142 L38 118 Q38 106 54 103 L112 97 Q132 66 164 62 L248 62 Q284 64 304 97 L352 103 Q366 107 366 124 L366 142 Z",
      glass: ["M136 97 Q150 73 170 70 L206 70 L206 97 Z", "M216 70 L246 70 Q270 73 286 97 L216 97 Z"],
      wheels: [112, 292], r: 25,
    },
    suv: {
      body: "M34 142 L34 114 Q34 101 52 98 L100 93 Q114 58 144 55 L290 55 Q314 58 324 93 L356 99 Q371 103 371 122 L371 142 Z",
      glass: ["M124 93 Q136 68 158 64 L204 64 L204 93 Z", "M214 64 L288 64 Q304 68 312 93 L214 93 Z"],
      wheels: [108, 298], r: 27,
    },
    bakkie: {
      body: "M28 144 L28 114 Q28 103 46 101 L104 97 Q120 65 152 62 L214 62 Q238 64 248 97 L250 101 L372 101 L372 144 Z",
      glass: ["M130 97 Q142 73 160 70 L206 70 L206 97 Z", "M214 70 L226 70 Q240 74 244 97 L214 97 Z"],
      wheels: [98, 312], r: 28,
      bed: "M256 101 L372 101 L372 88 L256 88 Z",
    },
  };
  function carSvg(seg, hex) {
    const s = SHAPES[seg] || SHAPES.hatchback;
    const id = "g" + ++svgN;
    const top = mix(hex, "w", 0.22), bot = mix(hex, "k", 0.28);
    const wheels = s.wheels
      .map((x) => `<circle cx="${x}" cy="146" r="${s.r}" fill="#0b0b0c"/><circle cx="${x}" cy="146" r="${s.r - 12}" fill="#9a9ea4"/><circle cx="${x}" cy="146" r="${s.r - 21}" fill="#2b2d31"/>`)
      .join("");
    return `<svg viewBox="0 0 400 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(seg)} illustration">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>
      <ellipse cx="200" cy="172" rx="168" ry="9" fill="#000" opacity=".45"/>
      ${s.bed ? `<path d="${s.bed}" fill="${mix(hex, "k", 0.45)}"/>` : ""}
      <path d="${s.body}" fill="url(#${id})"/>
      ${s.glass.map((g) => `<path d="${g}" fill="#bcd3e6" opacity=".82"/>`).join("")}
      <rect x="352" y="112" width="14" height="7" rx="3" fill="#ffe9a8" opacity=".9"/>
      <rect x="30" y="112" width="9" height="7" rx="3" fill="#e5484d" opacity=".9"/>
      ${wheels}
    </svg>`;
  }

  /* ---------- reusable pieces ---------- */
  const vpill = (v) => `<span class="vpill ${v.key}"><i></i>${esc(v.label)}</span>`;
  const UNAVAIL = new Set(["Reserved", "Sale pending"]);

  function listingCard(l, extra = "") {
    const unav = UNAVAIL.has(l.status);
    return `<a class="card ${unav ? "unavail" : ""}" href="#/listing/${l.id}">
      <div class="media">
        <span class="badge-src">${esc(l.source)}</span>
        <span class="badge-cond ${esc(l.condition)}">${esc(l.condition)}</span>
        ${carSvg(l.segment, l.colour_hex)}
      </div>
      <div class="name">${esc(l.title)}</div>
      <div class="sub">${esc(l.dealer)} · ${esc(l.city)}</div>
      <div class="row">
        <div class="price">${rand(l.price)}${l.was_price ? `<span class="strike">${rand(l.was_price)}</span>` : ""}</div>
        ${vpill(l.verdict)}
      </div>
      <div class="status s-${esc(l.status)}">${esc(l.status)} · ${km(l)} · ${esc(l.transmission)}</div>
      ${extra}
    </a>`;
  }

  function modelCard(m) {
    const dots = m.verdicts.map((k) => `<span class="dot ${k}"></span>`).join("");
    return `<a class="card" href="#/model/${m.slug}">
      <div class="media">${carSvg(m.segment, m.colours[0])}</div>
      <div class="name">${esc(m.make)} ${esc(m.model)}</div>
      <div class="sub">${esc(m.type)}</div>
      <div class="price">From ${rand(m.from_price)}</div>
      <div class="dots">${dots}<span>${m.count} listings</span></div>
    </a>`;
  }

  const loading = () => (app.innerHTML = `<div class="loading">Loading…</div>`);
  const errorView = (msg) => (app.innerHTML = `<div class="empty"><h2>Something went wrong</h2><p>${esc(msg)}</p><p><a class="chip" href="#/">Back home</a></p></div>`);

  /* ---------- pages ---------- */
  async function homePage() {
    loading();
    const [mods, best] = await Promise.all([api("/api/models"), api("/api/search?sort=best_value")]);
    const avail = best.listings.filter((l) => !UNAVAIL.has(l.status));
    const deals = avail.filter((l) => ["great", "good"].includes(l.verdict.key) && l.accident_free).slice(0, 4);
    const warn = [...avail].reverse().filter((l) => ["overpriced", "pricey"].includes(l.verdict.key)).slice(0, 4);
    app.innerHTML = `
      <section class="hero">
        <h1>Know if the price is <em>right</em> before you buy.</h1>
        <p>Search any popular car in South Africa. We compare listings from Webuycars, AutoTrader and Cars.co.za, tell you whether the asking price is justified, and surface better second-hand alternatives.</p>
        <div class="chips">
          ${[["Hilux", "#/search?q=hilux"], ["Bakkies", "#/search?q=bakkie"], ["Used hatchbacks", "#/search?q=used%20hatchback"], ["Corolla Cross", "#/model/corolla-cross"], ["Best deals first", "#/search?q=&sort=best_value"]]
            .map(([t, h]) => `<a class="chip" href="${h}">${t}</a>`).join("")}
        </div>
      </section>
      <div class="section-h"><h2>Popular in South Africa</h2><span>7 models · 3 versions each</span></div>
      <div class="grid">${mods.models.map(modelCard).join("")}</div>
      <div class="section-h"><h2>Best deals right now</h2><span>Priced below our fair-value estimate</span></div>
      <div class="grid">${deals.map((l) => listingCard(l)).join("")}</div>
      <div class="section-h"><h2>Think twice</h2><span>Asking more than we'd expect to pay</span></div>
      <div class="grid">${warn.map((l) => listingCard(l)).join("")}</div>`;
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs = ""] = raw.split("?");
    return { path, params: new URLSearchParams(qs) };
  }
  function setParams(params) {
    location.hash = "#/search?" + params.toString();
  }

  const SOURCES = ["Webuycars", "AutoTrader", "Cars.co.za"];
  const CONDITIONS = ["New", "Used", "Demo"];
  const SEG_LABEL = { bakkie: "Bakkies", hatchback: "Hatchbacks", suv: "SUVs" };

  async function searchPage(params) {
    loading();
    const q = params.get("q") || "";
    qInput.value = q;
    const qs = new URLSearchParams();
    qs.set("q", q);
    ["condition", "source"].forEach((k) => params.getAll(k).forEach((v) => qs.append(k, v)));
    ["segment", "max_price", "sort"].forEach((k) => params.get(k) && qs.set(k, params.get(k)));
    const d = await api("/api/search?" + qs.toString());
    const maxP = Number(params.get("max_price") || 0);
    const sort = params.get("sort") || "relevance";
    const conds = params.getAll("condition"), srcs = params.getAll("source");
    const seg = params.get("segment") || "";

    const title = q ? `Results for “${esc(q)}”` : seg ? SEG_LABEL[seg] : "All cars";
    app.innerHTML = `
      <div class="crumbs"><a href="#/">Home</a><span>/</span><span>Search</span></div>
      <h1 class="page-title">${title}</h1>
      <p class="page-sub">${d.count} listing${d.count === 1 ? "" : "s"} across ${d.models.length} model${d.models.length === 1 ? "" : "s"}.</p>
      <div class="layout">
        <aside class="side" id="side">
          <h3>Condition</h3>
          <div class="fg">${CONDITIONS.map((c) => `<label><input type="checkbox" data-k="condition" value="${c}" ${conds.includes(c) ? "checked" : ""}>${c}</label>`).join("")}</div>
          <h3>Source</h3>
          <div class="fg">${SOURCES.map((s) => `<label><input type="checkbox" data-k="source" value="${s}" ${srcs.includes(s) ? "checked" : ""}>${s}</label>`).join("")}</div>
          <h3>Max price</h3>
          <div class="fg">
            <input type="range" id="maxp" min="100000" max="700000" step="10000" value="${maxP || 700000}">
            <div class="range-val" id="maxpv">${maxP ? "Up to " + rand(maxP) : "No limit"}</div>
          </div>
          <h3>Sort by</h3>
          <div class="fg">
            <select id="sort">
              ${[["relevance", "Relevance"], ["best_value", "Best value first"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["mileage", "Lowest mileage"]]
                .map(([v, t]) => `<option value="${v}" ${sort === v ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </div>
        </aside>
        <section>
          ${d.listings.length
            ? `<div class="grid three">${d.listings.map((l) => listingCard(l)).join("")}</div>`
            : `<div class="empty"><h2>No cars match that</h2><p>Try fewer filters, or search a model like “Hilux” or “Swift”.</p></div>`}
        </section>
      </div>`;

    const side = $("#side");
    const apply = () => {
      const p = new URLSearchParams();
      p.set("q", qInput.value.trim() || q);
      if (seg) p.set("segment", seg);
      side.querySelectorAll("input[type=checkbox]:checked").forEach((c) => p.append(c.dataset.k, c.value));
      const mp = Number($("#maxp").value);
      if (mp < 700000) p.set("max_price", mp);
      const s = $("#sort").value;
      if (s !== "relevance") p.set("sort", s);
      setParams(p);
    };
    side.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", apply));
    $("#sort").addEventListener("change", apply);
    $("#maxp").addEventListener("input", (e) => ($("#maxpv").textContent = Number(e.target.value) >= 700000 ? "No limit" : "Up to " + rand(e.target.value)));
    $("#maxp").addEventListener("change", apply);
  }

  async function modelPage(slug) {
    loading();
    const d = await api("/api/models/" + encodeURIComponent(slug));
    const m = d.model;
    const rows = d.listings.map((l) => `<tr>
        <td><a class="t" href="#/listing/${l.id}">${esc(l.variant)}</a><div class="status">${esc(l.year)} · ${esc(l.condition)}</div></td>
        <td>${esc(l.dealer)}<div class="status">${esc(l.city)}</div></td>
        <td>${esc(l.source)}</td>
        <td>${km(l)}</td>
        <td><span class="status s-${esc(l.status)}">${esc(l.status)}</span></td>
        <td><b>${rand(l.price)}</b>${l.was_price ? `<span class="strike">${rand(l.was_price)}</span>` : ""}</td>
        <td>${vpill(l.verdict)}</td></tr>`).join("");
    app.innerHTML = `
      <div class="crumbs"><a href="#/">Home</a><span>/</span><a href="#/search?q=&segment=${m.segment}">${esc(SEG_LABEL[m.segment])}</a><span>/</span><span>${esc(m.make)} ${esc(m.model)}</span></div>
      <h1 class="page-title">${esc(m.make)} ${esc(m.model)}</h1>
      <p class="page-sub">${esc(m.blurb)}${m.starting_price ? ` New from ${rand(m.starting_price)}.` : ""}</p>
      <div class="table-wrap"><table class="cmp">
        <thead><tr><th>Version</th><th>Dealer</th><th>Source</th><th>Mileage</th><th>Status</th><th>Price</th><th>Verdict</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="section-h"><h2>${d.listings.length} versions compared</h2><span>Open one to see if its price is justified</span></div>
      <div class="grid three">${d.listings.map((l) => listingCard(l)).join("")}</div>`;
  }

  const HEADLINE = {
    great: (c) => `This is a <span class="c" style="color:${c}">great deal</span>.`,
    good: (c) => `This is a <span class="c" style="color:${c}">good price</span>.`,
    typical: (c) => `This price is <span class="c" style="color:${c}">typical</span>.`,
    pricey: (c) => `This price is <span class="c" style="color:${c}">on the high side</span>.`,
    overpriced: (c) => `This car is <span class="c" style="color:${c}">overpriced</span>.`,
  };
  const FLAG_ICON = { warn: "⚠", good: "✓", info: "ℹ" };

  async function listingPage(id) {
    loading();
    const d = await api("/api/listings/" + encodeURIComponent(id));
    const l = d.listing, a = d.analysis, v = a.verdict, g = a.gauge;
    const color = v.color;
    const thumbs = [l, ...d.siblings].sort((x, y) => x.id.localeCompare(y.id));
    const diff = a.diff;
    const steps = a.breakdown
      .map((s) => {
        if (s.kind === "base") return `<div class="step"><div><div class="sl">${esc(s.label)}</div><div class="sn">${esc(s.note)}</div></div><div class="sa">${rand(s.amount)}</div></div>`;
        const cls = s.amount >= 0 ? "pos" : "neg";
        return `<div class="step"><div><div class="sl">${esc(s.label)}</div><div class="sn">${esc(s.note)}</div></div><div class="sa ${cls}">${s.amount >= 0 ? "+" : "−"}${rand(Math.abs(s.amount))}</div></div>`;
      })
      .join("");
    const specs = [
      ["Year", l.year], ["Condition", l.condition], ["Mileage", km(l)], ["Fuel", l.fuel], ["Transmission", l.transmission],
      ["Colour", l.colour], ["Owners", l.condition === "New" ? "None" : l.owners], ["Service history", { full: "Full", partial: "Partial", none: "None", "n/a": "New car" }[l.service]],
      ["Accident history", l.accident_free ? "None recorded" : "Repaired"], ["Cover", l.warranty || "None remaining"], ["Location", l.city], ["Status", l.status],
    ].map(([k, val]) => `<div class="spec"><small>${k}</small><div>${esc(val)}</div></div>`).join("");

    const altHtml = d.alternatives.length
      ? `<div class="grid three">${d.alternatives.map((o) => listingCard(o, `<div class="alt-reasons">${o.reasons.map((r) => `<span>${esc(r)}</span>`).join("")}</div>`)).join("")}</div>`
      : `<div class="alt-empty">${["great", "good"].includes(v.key) ? "Nothing in this class beats it on value right now. This one is already among the better buys." : "We couldn't find a clearly better-value, accident-free alternative in this price range right now."}</div>`;

    app.innerHTML = `
      <div class="crumbs"><a href="#/">Home</a><span>/</span><a href="#/model/${l.model}">${esc(l.make)} ${esc(l.model_name)}</a><span>/</span><span>${esc(l.variant)}</span></div>
      <section class="detail">
        <div class="gallery">
          <div class="thumbs">${thumbs.map((t) => `<a class="thumb ${t.id === l.id ? "on" : ""}" href="#/listing/${t.id}" title="${esc(t.title)} · ${rand(t.price)}">${carSvg(t.segment, t.colour_hex)}</a>`).join("")}</div>
          <div class="hero-img">
            <div class="tools">
              <button class="icon-btn" id="bm" aria-label="Save"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button>
              <button class="icon-btn" id="share" aria-label="Share"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></button>
            </div>
            ${carSvg(l.segment, l.colour_hex)}
          </div>
        </div>
        <div>
          <div class="seller">
            <div class="avatar">${esc(l.dealer[0])}</div>
            <div><div class="dn">${esc(l.dealer)}</div><div class="ds">${esc(l.city)} · listed on ${esc(l.source)}</div></div>
          </div>
          <h1 class="d-title">${esc(l.title)}</h1>
          <div class="d-price"><b>${rand(l.price)}</b>${l.was_price ? `<s>${rand(l.was_price)}</s>` : ""}<span class="src">${esc(l.source)}</span></div>
          <div class="meta-line"><span class="tag">${esc(l.condition)}</span><span class="tag">${km(l)}</span><span class="tag">${esc(l.fuel)}</span><span class="tag">${esc(l.transmission)}</span><span class="tag status s-${esc(l.status)}">${esc(l.status)}</span></div>

          <div class="verdict">
            <div class="vh">
              <div class="vt">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="${color}"><path d="M3 20h4v-8H3zm7 0h4V4h-4zm7 0h4v-12h-4z" opacity=".95"/></svg>
                <div>${HEADLINE[v.key](color)}</div>
              </div>
            </div>
            <div class="gauge">
              <div class="seg g1" style="width:${g.low_pct}%"></div>
              <div class="seg g2" style="left:${g.low_pct}%;width:${g.high_pct - g.low_pct}%"></div>
              <div class="seg g3" style="left:${g.high_pct}%"></div>
              <div class="tip" style="left:${g.marker_pct}%;color:${color}">${rand(l.price)} · ${v.pct >= 0 ? "+" : "−"}${Math.abs(Math.round(v.pct * 100))}%</div>
              <div class="mk" style="left:${g.marker_pct}%;background:${color}"></div>
            </div>
            <div class="gauge-labels"><span style="left:${g.low_pct}%">${rand(g.low)}</span><span style="left:${g.high_pct}%">${rand(g.high)}</span></div>
            <div class="vsub">
              <div>Similar cars are worth about ${rand(a.fair_value)}, typically ${rand(g.low)} to ${rand(g.high)}.
                <small>${diff === 0 ? "Asking price matches our estimate." : `Asking ${rand(Math.abs(diff))} ${diff > 0 ? "above" : "below"} our fair-value estimate.`}</small></div>
              <button class="btn dark" id="track" style="background:#fff;color:#0a0a0a">🔔 Track price</button>
            </div>
            ${a.caution ? `<div class="caution ${a.flags.some((f) => f.severity === "warn") && v.pct <= -0.06 ? "warn" : ""}">${esc(a.caution)}</div>` : ""}
            <details class="how"><summary>How was this calculated? <span>ⓘ</span></summary>
              <div class="steps">${steps}
                <div class="step total"><div class="sl">Estimated fair value</div><div class="sa">${rand(a.fair_value)}</div></div>
              </div>
            </details>
          </div>
          <div style="margin-top:18px;display:flex;gap:12px;flex-wrap:wrap">
            <button class="btn" id="view">View on ${esc(l.source)} ↗</button>
            <a class="btn ghost" href="#/model/${l.model}">Compare all ${esc(l.model_name)} versions</a>
          </div>
        </div>
      </section>

      <section class="block">
        <h2>The backstory</h2>
        <p class="story">${esc(l.story)}</p>
        <div class="flags">${a.flags.map((f) => `<div class="flag ${f.severity}"><b>${FLAG_ICON[f.severity]} ${esc(f.label)}</b><span>${esc(f.detail)}</span></div>`).join("")}</div>
      </section>

      <section class="block"><h2>Details</h2><div class="specs">${specs}</div></section>

      <section class="block">
        <h2>Better alternatives</h2>
        ${altHtml}
      </section>

      <section class="block">
        <h2>Other versions of the ${esc(l.make)} ${esc(l.model_name)}</h2>
        <div class="grid three">${d.siblings.map((s) => listingCard(s)).join("")}</div>
      </section>`;

    $("#track").onclick = () => toast("Price tracking is on the roadmap. This demo doesn't save alerts yet.");
    $("#bm").onclick = () => toast("Saved to your shortlist (demo)");
    $("#view").onclick = () => toast(`Demo listing: there's no live page on ${l.source}`);
    $("#share").onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch { toast("Copy the link from the address bar"); }
    };
  }

  function howPage() {
    app.innerHTML = `<section class="how-page">
      <h1>How AutoMatch works</h1>
      <p>Buying a car means comparing the same vehicle across several sites, with different dealers, mileages and histories, and guessing whether any of it is fair. AutoMatch does that comparison for you.</p>
      <div class="how-grid">
        <div><b>1 · Search</b><span>Find any model. We line up the versions on Webuycars, AutoTrader and Cars.co.za side by side.</span></div>
        <div><b>2 · Check the price</b><span>Every listing gets a fair-value estimate and a verdict, from great deal to overpriced, with the working shown.</span></div>
        <div><b>3 · Find better</b><span>We surface cheaper or better-value alternatives, including nearly-new and second-hand options.</span></div>
      </div>
      <p><b>How the estimate works.</b> We start from the new price of the exact version, then adjust for age, mileage against the 20 000 km-a-year average, service history, number of owners, accident repairs, fleet or rental use and remaining warranty. The asking price is compared with the result.</p>
      <p><b>About this demo.</b> The 21 listings are illustrative, and the dealers are fictional. The verdict logic is a transparent heuristic. In the full product the same screens would be fed by live listings and sold-price data.</p>
      <p><a class="btn" href="#/">Try a search</a></p>
    </section>`;
  }

  /* ---------- router ---------- */
  async function route() {
    const { path, params } = parseHash();
    document.querySelectorAll(".topnav a").forEach((a) => a.classList.toggle("on", (a.dataset.nav === "home" && path === "/") || (a.dataset.nav === "search" && path === "/search") || (a.dataset.nav === "how" && path === "/how")));
    document.querySelectorAll("#cats a").forEach((a) => a.classList.toggle("on", path === "/search" && (a.dataset.seg || "") === (params.get("segment") || "") && !params.get("q")));
    if (path !== "/search") qInput.value = "";
    hideSuggest();
    try {
      if (path === "/") await homePage();
      else if (path === "/search") await searchPage(params);
      else if (path.startsWith("/model/")) await modelPage(path.slice(7));
      else if (path.startsWith("/listing/")) await listingPage(path.slice(9));
      else if (path === "/how") howPage();
      else errorView("Page not found");
    } catch (e) {
      errorView(e.message);
    }
    window.scrollTo({ top: 0 });
  }

  /* ---------- search box + suggestions ---------- */
  let sugTimer, sugItems = [], sugIdx = -1;
  function hideSuggest() { suggestBox.hidden = true; sugIdx = -1; }
  function paintSuggest() {
    if (!sugItems.length) return hideSuggest();
    suggestBox.innerHTML = sugItems.map((s, i) => `<a href="${s.href}" class="${i === sugIdx ? "act" : ""}"><span><span class="s-kind">${s.kind}</span><span class="s-main">${esc(s.label)}</span></span><span class="s-sub">${esc(s.sub)}</span></a>`).join("");
    suggestBox.hidden = false;
  }
  qInput.addEventListener("input", () => {
    clearTimeout(sugTimer);
    const v = qInput.value.trim();
    if (!v) return hideSuggest();
    sugTimer = setTimeout(async () => {
      try { sugItems = (await api("/api/suggest?q=" + encodeURIComponent(v))).suggestions; sugIdx = -1; paintSuggest(); } catch { hideSuggest(); }
    }, 120);
  });
  qInput.addEventListener("keydown", (e) => {
    if (suggestBox.hidden) return;
    if (e.key === "ArrowDown") { sugIdx = (sugIdx + 1) % sugItems.length; paintSuggest(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sugIdx = (sugIdx - 1 + sugItems.length) % sugItems.length; paintSuggest(); e.preventDefault(); }
    else if (e.key === "Enter" && sugIdx >= 0) { location.hash = sugItems[sugIdx].href; e.preventDefault(); }
    else if (e.key === "Escape") hideSuggest();
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".searchwrap")) hideSuggest(); });
  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    p.set("q", qInput.value.trim());
    setParams(p);
  });

  window.addEventListener("hashchange", route);
  route();
})();
