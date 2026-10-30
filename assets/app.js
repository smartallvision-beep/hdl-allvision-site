// hdl.by: смета (в браузере посетителя), варианты в карточке, фильтр каталога, отправка заявок в /lead.php
(() => {
  const D = window.HDL || { items: {} };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = n => n.toLocaleString("ru-RU").replace(/\s/g, " ");
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- смета: { артикул: количество } ----
  const KEY = "hdl-smeta";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} count(); };
  const count = () => { const n = Object.values(load()).reduce((a, b) => a + b, 0); $$("[data-smeta-count]").forEach(el => el.textContent = n); };
  count();

  // ---- меню на телефоне ----
  const burger = $(".burger");
  if (burger) burger.addEventListener("click", () => {
    const open = $(".top").classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });

  // ---- каталог в меню (плитки групп) ----
  const cat = $(".nav-cat"), mega = $("#mega");
  const setMega = open => { mega.hidden = !open; cat.setAttribute("aria-expanded", String(open)); };
  if (cat && mega) {
    cat.addEventListener("click", ev => { ev.stopPropagation(); setMega(mega.hidden); });
    document.addEventListener("click", ev => { if (!mega.hidden && !mega.contains(ev.target)) setMega(false); });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") setMega(false); });
  }

  // ---- «Заказать звонок» ----
  const dlg = $("#callback");
  $$("[data-callback]").forEach(b => b.addEventListener("click", () => dlg?.showModal()));
  $("[data-close]")?.addEventListener("click", () => dlg.close());
  dlg?.addEventListener("click", ev => { if (ev.target === dlg) dlg.close(); });

  // ---- карточка товара ----
  const main = $("[data-main]");
  $$(".thumbs button").forEach(b => b.addEventListener("click", () => {
    main.src = b.dataset.src;
    $$(".thumbs button").forEach(x => x.removeAttribute("aria-current"));
    b.setAttribute("aria-current", "true");
  }));
  const add = $("[data-add]");
  $$(".variants button").forEach(b => b.addEventListener("click", () => {
    $$(".variants button").forEach(x => x.setAttribute("aria-checked", "false"));
    b.setAttribute("aria-checked", "true");
    $("[data-price]").textContent = fmt(+b.dataset.byn) + " BYN";
    $("[data-art]").textContent = b.dataset.a;
    if (add) add.dataset.add = b.dataset.a;
    // большое фото — того же цвета (картинка варианта из прайса)
    if (main && b.dataset.img) { main.src = b.dataset.img; $$(".thumbs button").forEach(x => x.removeAttribute("aria-current")); }
  }));
  const qi = $("[data-qty-input]");
  $$("[data-qty]").forEach(b => b.addEventListener("click", () => { qi.value = Math.max(1, (+qi.value || 1) + +b.dataset.qty); }));
  if (add) add.addEventListener("click", () => {
    const s = load(), a = add.dataset.add, q = Math.max(1, +(qi?.value) || 1);
    s[a] = (s[a] || 0) + q; save(s);
    add.textContent = "Добавлено ✓";
    setTimeout(() => { add.textContent = "В смету"; }, 1600);
  });

  // ---- «В смету» прямо с карточки в сетке ----
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-add-card]"); if (!b) return;
    const s = load(); s[b.dataset.addCard] = (s[b.dataset.addCard] || 0) + 1; save(s);
    b.textContent = "✓ В смете"; b.classList.add("done");
    setTimeout(() => { b.textContent = "В смету"; b.classList.remove("done"); }, 1600);
  });

  // ---- каталог: галочки (система, группа, коллекция, цвет, тип…), поиск, сортировка, плитка/список ----
  const search = $("[data-search]");
  if (search) {
    const grid = $(".cat-main .grid"), cards = $$(".card", grid);
    const found = $("[data-found]"), title = $("[data-cat-title]"), empty = $("[data-empty]"), facetsBox = $("[data-facets]"), bar = $("[data-bar]");
    const intro = found.textContent, title0 = title.textContent;
    const NAMES = ["p", "g", "coll", "col", "pt", "k", "mat", "std"];
    const PANEL_GROUPS = ["paneli", "rozetki-vyklyuchateli"];
    const boxes = n => $$(`[data-fl] input[name=${n}]`);
    const checked = n => boxes(n).filter(x => x.checked).map(x => x.value);
    const label = x => x.parentElement.querySelector("span").textContent.trim();
    const vals = (c, n) => (c.dataset[n] || "").split("|").filter(Boolean);
    const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return n + " " + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c); };
    const apply = (push = true) => {
      const sel = Object.fromEntries(NAMES.map(n => [n, checked(n)]));
      const q = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const pass = (c, skip) => q.every(w => c.dataset.q.includes(w)) &&
        NAMES.every(n => n === skip || !sel[n].length || vals(c, n).some(v => sel[n].includes(v)));
      let n = 0;
      cards.forEach(c => { const ok = pass(c); c.hidden = !ok; if (ok) n++; });
      // счётчик у галочки — сколько будет, если отметить и её (по остальным фильтрам)
      NAMES.forEach(nm => boxes(nm).forEach(x => {
        const k = cards.filter(c => pass(c, nm) && vals(c, nm).includes(x.value)).length;
        x.parentElement.querySelector("em").textContent = k;
        x.parentElement.classList.toggle("zero", k === 0 && !x.checked);
      }));
      // фильтры панелей (строка «Коллекция/Цвет» и тип, клавиши…) — когда на странице панели или розетки
      const hasPanels = cards.some(c => PANEL_GROUPS.includes(c.dataset.g));
      const onlyPanelGroups = hasPanels && (sel.g.length ? sel.g.some(g => PANEL_GROUPS.includes(g)) : cards.every(c => PANEL_GROUPS.includes(c.dataset.g)));
      const facetOn = ["coll", "col", "pt", "k", "mat", "std"].some(n => sel[n].length);
      const showF = onlyPanelGroups || facetOn;
      if (facetsBox) facetsBox.hidden = !showF;
      if (bar) bar.hidden = !showF;
      $$("[data-clear]").forEach(b => b.setAttribute("aria-pressed", String(!sel[b.dataset.clear].length)));
      // заголовок
      const lab = n => boxes(n).filter(x => x.checked).map(label);
      const gl = lab("g"), pl = lab("p"), cl = lab("coll");
      title.textContent = cl.length === 1 && !boxes("g").length ? title0 + " · " + cl[0]
        : cl.length === 1 ? "Коллекция " + cl[0] + (gl.length === 1 ? ": " + gl[0].toLowerCase() : "")
        : gl.length === 1 ? gl[0] + (pl.length === 1 ? " " + pl[0] : "") : pl.length === 1 && !gl.length ? pl[0] : title0;
      found.textContent = n === cards.length ? intro : "Найдено: " + plural(n, "позиция", "позиции", "позиций");
      empty.hidden = n > 0;
      // выбран один цвет — ссылка карточки откроет нужный вариант
      const oneCol = sel.col.length === 1 ? sel.col[0] : "";
      cards.forEach(c => { const a = $(".card-link", c), base = a.getAttribute("href").split("?")[0]; a.setAttribute("href", oneCol && vals(c, "col").includes(oneCol) ? base + "?c=" + encodeURIComponent(oneCol) : base); });
      // фото и цена карточки — варианта выбранного цвета (если такой вариант есть в прайсе)
      const wantCols = sel.col;
      cards.forEach(c => {
        if (!c.dataset.vmap) return;
        const m = JSON.parse(c.dataset.vmap), img = $(".pic img", c), pr = $(".card-buy .price", c);
        if (img && !c.dataset.img0) { c.dataset.img0 = img.getAttribute("src"); c.dataset.pr0 = pr.textContent; }
        const hit = wantCols.find(k => m[k]);
        if (hit) { if (img && m[hit].i) img.src = m[hit].i; pr.textContent = fmt(m[hit].b) + " BYN"; }
        else if (c.dataset.img0) { img.src = c.dataset.img0; pr.textContent = c.dataset.pr0; }
      });
      if (push) {
        const u = new URLSearchParams();
        if (search.value.trim()) u.set("q", search.value.trim());
        NAMES.forEach(nm => sel[nm].forEach(v => u.append(nm, v)));
        history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : ""));
      }
    };
    $$("[data-fl] input").forEach(x => x.addEventListener("change", () => apply()));
    $$("[data-clear]").forEach(b => b.addEventListener("click", () => { boxes(b.dataset.clear).forEach(x => x.checked = false); apply(); }));
    search.addEventListener("input", () => apply());
    $("[data-reset]").addEventListener("click", () => { $$("[data-fl] input").forEach(x => x.checked = false); search.value = ""; apply(); });
    // сортировка
    $("[data-sort]").addEventListener("change", ev => {
      const v = ev.target.value, k = v.replace("-", ""), dir = v.startsWith("-") ? -1 : 1;
      const val = c => k === "p" ? +c.dataset.price : k === "n" ? c.dataset.n : k === "c" ? (c.dataset.coll || "яяя") + " " + c.dataset.n : +c.dataset.i;
      cards.slice().sort((x, y) => { const a = val(x), b = val(y); return (a > b ? 1 : a < b ? -1 : 0) * dir; }).forEach(c => grid.appendChild(c));
    });
    // плитка / список — запоминаем у посетителя
    const setView = v => { grid.classList.toggle("list", v === "list"); $$("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === v))); try { localStorage.setItem("hdl-view", v); } catch {} };
    $$("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    try { if (localStorage.getItem("hdl-view") === "list") setView("list"); } catch {}
    // фильтры на телефоне
    const fo = $("[data-f-open]"), side = $("#cat-side");
    fo.addEventListener("click", () => { const o = side.classList.toggle("open"); fo.setAttribute("aria-expanded", String(o)); });
    // из адреса: ?q=…&p=buspro&g=paneli&coll=Xelent&col=Латунь
    const qs = new URLSearchParams(location.search);
    if (qs.get("q")) search.value = qs.get("q");
    NAMES.forEach(nm => qs.getAll(nm).forEach(v => boxes(nm).forEach(x => { if (x.value === v) x.checked = true; })));
    apply(false);
  }

  // ---- карточка: ?c=Латунь — сразу выбрать вариант этого цвета ----
  const wantCol = new URLSearchParams(location.search).get("c");
  if (wantCol) {
    const b = $$(".variants button").find(x => (x.dataset.col || "").split("|").includes(wantCol));
    if (b) b.click();
  }

  // ---- страница сметы ----
  const box = $("[data-smeta]");
  const rows = () => Object.entries(load()).map(([a, q]) => ({ a, q, it: D.items[a] || { n: a, u: "", t: "", b: null } }));
  const renderSmeta = () => {
    if (!box) return;
    const r = rows();
    $("[data-smeta-form]").hidden = !r.length;
    if (!r.length) { box.innerHTML = '<p>Список пуст. Добавляйте позиции кнопкой «В смету» в <a href="/katalog/">каталоге</a>.</p>'; return; }
    let sum = 0, ask = 0;
    const tr = r.map(({ a, q, it }) => {
      const t = it.b != null ? it.b * q : null;
      if (t != null) sum += t; else ask++;
      return `<tr><td class="hide-m">${it.t ? `<img src="${esc(it.t)}" alt="">` : ""}</td>
        <td><a href="${esc(it.u)}">${esc(it.n)}</a><br><span class="muted small">${esc(a)}</span></td>
        <td><div class="qty"><button type="button" data-d="-1" data-a="${esc(a)}">−</button><input type="number" min="1" value="${q}" data-set="${esc(a)}" aria-label="Количество"><button type="button" data-d="1" data-a="${esc(a)}">+</button></div></td>
        <td class="num hide-m">${it.b != null ? fmt(it.b) + " BYN" : "по запросу"}</td>
        <td class="num">${t != null ? fmt(t) + " BYN" : "по запросу"}</td>
        <td><button class="rm" type="button" data-rm="${esc(a)}" aria-label="Убрать">×</button></td></tr>`;
    }).join("");
    box.innerHTML = `<table class="smeta-tbl"><thead><tr><th class="hide-m"></th><th>Позиция</th><th>Кол-во</th><th class="num hide-m">Цена</th><th class="num">Сумма</th><th></th></tr></thead>
      <tbody>${tr}</tbody><tfoot><tr><td class="hide-m"></td><td colspan="3">Итого с НДС${ask ? `<br><span class="muted small">без ${ask} поз. по запросу</span>` : ""}</td><td class="num">${fmt(sum)} BYN</td><td></td></tr></tfoot></table>
      <p class="muted small">Цены по курсу НБРБ ${String(D.rate).replace(".", ",")} на ${D.rateDate.split("-").reverse().join(".")}. Монтаж и настройка — в смете от нас.</p>`;
  };
  if (box) {
    renderSmeta();
    box.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      const s = load();
      if (b.dataset.rm) delete s[b.dataset.rm];
      if (b.dataset.d) s[b.dataset.a] = Math.max(1, (s[b.dataset.a] || 1) + +b.dataset.d);
      save(s); renderSmeta();
    });
    box.addEventListener("change", ev => {
      const i = ev.target.closest("[data-set]"); if (!i) return;
      const s = load(); s[i.dataset.set] = Math.max(1, Math.round(+i.value) || 1); save(s); renderSmeta();
    });
  }

  // ---- заявки ----
  $$("form.lead").forEach(f => f.addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $(".msg", f), btn = $("button[type=submit]", f);
    const v = n => (f.elements[n]?.value || "").trim();
    msg.className = "msg";
    if ((v("phone").match(/\d/g) || []).length < 7) { msg.textContent = "Укажите телефон, чтобы мы могли перезвонить."; msg.classList.add("bad"); return; }
    if (!f.elements.consent.checked) { msg.textContent = "Отметьте согласие на обработку данных."; msg.classList.add("bad"); return; }
    const body = { name: v("name"), phone: v("phone"), comment: v("comment"), website: v("website"), consent: true,
      topic: f.dataset.topic, page: location.pathname };
    if (box) body.items = rows().map(({ a, q, it }) => ({ a, n: it.n, q, b: it.b }));
    btn.disabled = true; msg.textContent = "Отправляем…";
    try {
      const r = await fetch("/lead.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "fail");
      msg.textContent = "Спасибо! Заявка принята, перезвоним в рабочее время."; msg.classList.add("ok");
      f.reset();
      if (box) { save({}); renderSmeta(); }
    } catch (e) {
      msg.innerHTML = 'Не удалось отправить. Позвоните: <a href="tel:+375293702020">+375 29 370-20-20</a> или напишите на <a href="mailto:info@allvision.by">info@allvision.by</a>.';
      msg.classList.add("bad");
    } finally { btn.disabled = false; }
  }));
})();
