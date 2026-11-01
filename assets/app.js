// hdl.by: смета (в браузере посетителя), варианты в карточке, фильтр каталога, отправка заявок в /lead.php
(() => {
  const D = window.HDL || { items: {} };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = n => n.toLocaleString("ru-RU").replace(/\s/g, " ");
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- поиск: запрос → варианты написания. Одно правило для шапки и каталога ----
  const low = s => String(s ?? "").toLowerCase().replace(/ё/g, "е");
  const stem = w => /[а-я]/.test(w) && w.length > 4 ? w.replace(/(ами|ями|ого|его|ому|ему|ыми|ими|ах|ях|ов|ев|ей|ой|ый|ий|ая|яя|ое|ее|ые|ие|ом|ем|ам|ям|а|я|ы|и|у|ю|е|о|ь|й)$/, "") : w;
  const SYN = {
    штор: ["штор", "карниз", "жалюзи"], жалюзи: ["жалюзи", "штор"], карниз: ["карниз", "штор"], рольставн: ["штор", "жалюзи"],
    кондиционер: ["кондицион", "hvac", "fcu", "fchc", "vrv", "mac01"], отоплен: ["отоплен", "термостат", "fcu", "fchc", "mfh"], радиатор: ["радиатор", "термостат", "fchc"],
    движен: ["движен", "присутств", "pir"], присутств: ["присутств", "движен"], свет: ["свет", "диммер", "реле"], освещен: ["освещен", "диммер", "реле"],
    кнопк: ["клав"], клавиш: ["клав"], экран: ["экран", "дисплей", "display"], дисплей: ["экран", "дисплей", "display"],
    икселент: ["xelent"], иксэлент: ["xelent"], экселент: ["xelent"], тайл: ["tile"], инкслаб: ["inkslab"], фанджи: ["fangzhi"], гранит: ["granite"], соурс: ["source"], сурс: ["source"], фанор: ["fanora"], энвиро: ["enviro"], айтач: ["itouch"],
  };
  const terms = q => low(q).replace(/тепл(ый|ые|ого) пол\S*/g, "термостат").split(/\s+/).filter(Boolean).map(w => {
    const s = stem(w);
    return [...new Set([s, w.replace(/[^a-z0-9а-я]/g, ""), ...(SYN[s] || [])])].filter(Boolean);
  });
  const hit = (hay, ts) => ts.every(alts => alts.some(a => hay.includes(a)));

  // ---- смета: { артикул: количество } ----
  const KEY = "hdl-smeta";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} count(); };
  const count = () => { const n = Object.values(load()).reduce((a, b) => a + b, 0); $$("[data-smeta-count]").forEach(el => el.textContent = n); };
  count();

  // ---- меню на телефоне ----
  const burger = $(".burger");
  if (burger) burger.addEventListener("click", () => {
    if (mega && !mega.hidden) { setMega(false); $(".top").classList.add("open"); }  // открыт каталог — бургер закрывает всё меню
    const open = $(".top").classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });

  // ---- поиск в шапке: на телефоне открывается значком, индекс грузится при первом обращении ----
  const hs = $("[data-hsearch]"), hsBox = $("[data-hs-res]"), hsToggle = $("[data-search-toggle]");
  let hsLoading = null;
  const hsIndex = () => hsLoading || (hsLoading = new Promise((ok, no) => { const s = document.createElement("script"); s.src = "/assets/search.js?v=" + ($('meta[name=build]')?.content || "").replace(/\D/g, ""); s.onload = ok; s.onerror = no; document.head.appendChild(s); }));
  const hsRender = async () => {
    const q = hs.value.trim();
    if (q.length < 2) { hsBox.hidden = true; return; }
    try { await hsIndex(); } catch { return; }
    const ts = terms(q), cq = low(q).replace(/[^a-z0-9]/g, "");
    const found = (window.HDLS || []).filter(x => hit(x.q, ts));
    const exact = x => cq.length > 2 && x.q.includes(cq) ? 0 : 1;
    found.sort((a, b) => exact(a) - exact(b));
    hsBox.innerHTML = found.length
      ? found.slice(0, 7).map(x => `<a href="${esc(x.u)}">${x.t ? `<img src="${esc(x.t)}" alt="" width="44" height="44">` : "<i></i>"}<span>${esc(x.n)}<br><small>${esc(x.a)}</small></span><b>${x.b != null ? (x.m ? "от " : "") + fmt(x.b) + " BYN" : "по запросу"}</b></a>`).join("")
        + `<a class="hs-all" href="/katalog/?q=${encodeURIComponent(q)}">Все результаты: ${found.length} →</a>`
      : `<p>Ничего не нашлось. <a href="/kontakty/">Спросите нас</a>: подскажем, чем решить задачу.</p>`;
    hsBox.hidden = false;
  };
  if (hs) {
    hs.addEventListener("input", hsRender);
    hs.addEventListener("focus", () => { hsIndex().catch(() => {}); if (hs.value.trim().length > 1) hsRender(); });
    document.addEventListener("click", ev => { if (!ev.target.closest(".hsearch") && !ev.target.closest("[data-search-toggle]")) hsBox.hidden = true; });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") hsBox.hidden = true; });
  }
  if (hsToggle) hsToggle.addEventListener("click", () => {
    if (document.body.dataset.page === "catalog") { const c = $("[data-search]"); c?.focus(); c?.scrollIntoView({ block: "center" }); return; }
    const open = $(".top").classList.toggle("search-open");
    hsToggle.setAttribute("aria-expanded", String(open));
    if (open) { $(".top").classList.remove("open"); hs?.focus(); }
  });

  // ---- каталог в меню (плитки групп) ----
  const cat = $(".nav-cat"), mega = $("#mega");
  const setMega = open => { mega.hidden = !open; cat.setAttribute("aria-expanded", String(open)); $(".top").classList.toggle("cat-open", open); if (open) mega.scrollTop = 0; };
  if (cat && mega) {
    cat.addEventListener("click", ev => { ev.stopPropagation(); setMega(mega.hidden); });
    document.addEventListener("click", ev => { if (!mega.hidden && !mega.contains(ev.target)) setMega(false); });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") setMega(false); });
    $("[data-mega-back]")?.addEventListener("click", () => setMega(false));
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

  // ---- фото не загрузилось (сбой сети, защита хостинга, испорченная копия в кэше браузера): ещё две попытки мимо кэша ----
  document.addEventListener("error", ev => {
    const im = ev.target;
    if (im.tagName !== "IMG") return;
    const n = +(im.dataset.retry || 0);
    if (n >= 2) return;
    im.dataset.retry = n + 1;
    setTimeout(() => { im.src = im.getAttribute("src").split("?")[0] + "?r=" + Date.now(); }, 1500 * (n + 1));
  }, true);

  // ---- каталог: галочки (система, группа, коллекция, цвет, тип…), поиск, сортировка, плитка/список ----
  const search = $("[data-search]");
  if (search) {
    const grid = $(".cat-main .grid"), cards = $$(".card", grid);
    const found = $("[data-found]"), title = $("[data-cat-title]"), empty = $("[data-empty]"), facetsBox = $("[data-facets]"), bars = $$("[data-bar]");
    const intro = found.textContent, title0 = title.textContent;
    const NAMES = [...new Set($$("[data-fl] input").map(x => x.name))];  // все фильтры страницы
    const PANEL_GROUPS = ["paneli", "rozetki-vyklyuchateli"];
    const boxes = n => $$(`[data-fl] input[name=${n}]`);
    const checked = n => boxes(n).filter(x => x.checked).map(x => x.value);
    const label = x => x.parentElement.querySelector("span").textContent.trim();
    const vals = (c, n) => (c.dataset[n] || "").split("|").filter(Boolean);
    const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return n + " " + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c); };
    const pageGroups = [...new Set(cards.map(c => c.dataset.g))];
    // строка фильтров категории видна, только когда открыта эта категория; у скрытых — отметки снимаем
    const showBars = () => {
      const gsel = checked("g"), cur = gsel.length ? gsel : pageGroups;
      const fits = list => cur.length > 0 && cur.every(g => list.includes(g));
      bars.forEach(b => { const ok = fits(b.dataset.bar.split(" ")); b.hidden = !ok; if (!ok) $$("input", b).forEach(x => x.checked = false); });
      if (facetsBox) { const ok = fits(PANEL_GROUPS); facetsBox.hidden = !ok; if (!ok) $$("input", facetsBox).forEach(x => x.checked = false); }
    };
    const apply = (push = true) => {
      showBars();
      const sel = Object.fromEntries(NAMES.map(n => [n, checked(n)]));
      const q = terms(search.value);
      // в карточке с двумя материалами пара «материал + цвет» должна существовать
      const combo = (c, mats = [], cols = []) => !c.dataset.cm || !mats.length || !cols.length || mats.some(m => cols.some(k => c.dataset.cm.split("|").includes(m + ":" + k)));
      const pass = (c, skip) => hit(c.dataset.q, q) &&
        (skip === "col" || skip === "mat" || combo(c, sel.mat, sel.col)) &&
        NAMES.every(n => n === skip || !sel[n].length || vals(c, n).some(v => sel[n].includes(v)));
      let n = 0;
      cards.forEach(c => { const ok = pass(c); c.hidden = !ok; if (ok) n++; });
      // счётчик у галочки — сколько будет, если отметить и её (по остальным фильтрам)
      NAMES.forEach(nm => boxes(nm).forEach(x => {
        const k = cards.filter(c => pass(c, nm) && vals(c, nm).includes(x.value) &&
          (nm === "col" ? combo(c, sel.mat, [x.value]) : nm === "mat" ? combo(c, [x.value], sel.col) : true)).length;
        x.parentElement.querySelector("em").textContent = k;
        x.parentElement.classList.toggle("zero", k === 0 && !x.checked);
      }));
      // варианты с нулём спрятаны; ряд или блок, где не осталось вариантов, прячем целиком
      $$(".bar-row, .cat-side fieldset, .cat-side .ff").forEach(r => { r.hidden = !$$(".chip:not(.all):not(.zero), .fbox:not(.zero)", r).length; });
      bars.forEach(b => { if (!b.hidden) b.hidden = !$$(".bar-row:not([hidden])", b).length; });
      if (facetsBox && !facetsBox.hidden) facetsBox.hidden = !$$(".ff:not([hidden])", facetsBox).length;
      $$("[data-clear]").forEach(b => b.setAttribute("aria-pressed", String(!sel[b.dataset.clear].length)));
      // заголовок
      const lab = n => boxes(n).filter(x => x.checked).map(label);
      const gl = lab("g"), pl = lab("p"), cl = lab("coll");
      title.textContent = cl.length === 1 && !boxes("g").length ? title0 + " · " + cl[0]
        : cl.length === 1 ? "Коллекция " + cl[0] + (gl.length === 1 ? ": " + gl[0].toLowerCase() : "")
        : gl.length === 1 ? gl[0] + (pl.length === 1 ? " " + pl[0] : "") : pl.length === 1 && !gl.length ? pl[0] : title0;
      found.textContent = n === cards.length ? intro : "Найдено: " + plural(n, "позиция", "позиции", "позиций");
      // выбрана одна коллекция — её снимки в интерьере над карточками
      $$("[data-int]").forEach(x => { x.hidden = !(sel.coll && sel.coll.length === 1 && sel.coll[0] === x.dataset.int); });
      empty.hidden = n > 0;
      // выбран один цвет — ссылка карточки откроет нужный вариант
      const oneCol = sel.col && sel.col.length === 1 ? sel.col[0] : sel.mat && sel.mat.length === 1 ? sel.mat[0] : "";
      cards.forEach(c => { const a = $(".card-link", c), base = a.getAttribute("href").split("?")[0]; a.setAttribute("href", oneCol && (vals(c, "col").includes(oneCol) || vals(c, "mat").includes(oneCol)) ? base + "?c=" + encodeURIComponent(oneCol) : base); });
      // фото и цена карточки — варианта выбранного цвета (если такой вариант есть в прайсе)
      const wantCols = [...(sel.col || []), ...(sel.mat || [])];
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
    fo.addEventListener("click", () => { const o = side.classList.toggle("open"); fo.setAttribute("aria-expanded", String(o)); $(".cat-layout").classList.toggle("f-on", o); });
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
  const renderHints = r => {
    const el = $("[data-smeta-hints]");
    if (!el) return;
    const have = new Set(r.map(x => x.a)), want = {}, frames = {};
    r.forEach(({ a, q, it }) => {
      (it.k || []).forEach(k => { if (!have.has(k)) want[k] = (want[k] || 0) + q; });
      if (it.fr && !r.some(x => x.it.isf === it.fr)) frames[it.fr] = 1;
    });
    const rowsH = Object.entries(want).map(([k, q]) => {
      const it = D.items[k];
      return `<li><span>Шинный соединитель <b>${esc(k)}</b>${it?.b != null ? ", " + fmt(it.b) + " BYN" : ""}: нужен к панелям из списка</span>${it ? `<button class="cbtn" type="button" data-hint-add="${esc(k)}" data-q="${q}">Добавить ${q} шт.</button>` : ""}</li>`;
    }).concat(Object.keys(frames).map(c => `<li><span>Рамка <b>${esc(c)}</b>: не входит в цену панелей и розеток</span>${D.collUrl?.[c] ? `<a class="cbtn ghost" href="/kollekcii/${D.collUrl[c]}/#ramki">Выбрать рамку</a>` : ""}</li>`));
    el.hidden = !rowsH.length;
    el.innerHTML = rowsH.length ? `<h3>Не забудьте</h3><ul>${rowsH.join("")}</ul>` : "";
  };
  const renderSmeta = () => {
    if (!box) return;
    const r = rows();
    $("[data-smeta-form]").hidden = !r.length;
    $("[data-smeta-tools]").hidden = !r.length;
    renderHints(r);
    if (!r.length) { box.innerHTML = '<p>Список пуст. Добавляйте позиции кнопкой «В смету» в <a href="/katalog/">каталоге</a> или загрузите готовый список артикулов.</p>'; return; }
    let sum = 0, ask = 0;
    const tr = r.map(({ a, q, it }) => {
      const t = it.b != null ? it.b * q : null;
      if (t != null) sum += t; else ask++;
      return `<tr><td class="hide-m">${it.t ? `<img src="${esc(it.t)}" alt="">` : ""}</td>
        <td><a href="${esc(it.u)}">${esc(it.n)}</a><br><span class="muted small">${esc(a)}</span></td>
        <td><div class="qty"><button type="button" data-d="-1" data-a="${esc(a)}" aria-label="Меньше">−</button><input type="number" min="1" value="${q}" data-set="${esc(a)}" aria-label="Количество"><button type="button" data-d="1" data-a="${esc(a)}" aria-label="Больше">+</button></div></td>
        <td class="num hide-m">${it.b != null ? fmt(it.b) + " BYN" : "по запросу"}</td>
        <td class="num">${t != null ? fmt(t) + " BYN" : "по запросу"}</td>
        <td class="no-print"><button class="rm" type="button" data-rm="${esc(a)}" aria-label="Убрать">×</button></td></tr>`;
    }).join("");
    box.innerHTML = `<table class="smeta-tbl"><thead><tr><th class="hide-m"></th><th>Позиция</th><th>Кол-во</th><th class="num hide-m">Цена</th><th class="num">Сумма</th><th class="no-print"></th></tr></thead>
      <tbody>${tr}</tbody><tfoot><tr><td class="hide-m"></td><td colspan="3">Итого с НДС${ask ? `<br><span class="muted small">без ${ask} поз. по запросу</span>` : ""}</td><td class="num">${fmt(sum)} BYN</td><td class="no-print"></td></tr></tfoot></table>
      <p class="muted small">Цены по курсу НБРБ ${String(D.rate).replace(".", ",")} на ${D.rateDate.split("-").reverse().join(".")}. Монтаж и настройка считаем отдельно.</p>`;
  };
  if (box) {
    $("[data-today]").textContent = new Date().toLocaleDateString("ru-RU");
    // поиск артикула: без знаков; артикул без цвета — первый цвет из прайса
    const keyOf = {}; Object.keys(D.items).forEach(a => { keyOf[low(a).replace(/[^a-z0-9а-я]/g, "")] = a; });
    const findArt = s => { const c = low(s).replace(/[^a-z0-9а-я]/g, ""); return keyOf[c] || Object.keys(keyOf).filter(k => k.length === c.length + 1 && k.startsWith(c)).map(k => keyOf[k])[0]; };
    // открыта ссылка на чужую смету: ?s=артикул*количество,…
    const shared = new URLSearchParams(location.search).get("s");
    if (shared) {
      const got = {};
      shared.split(",").forEach(x => { const [a, q] = x.split("*"); if (D.items[a]) got[a] = Math.max(1, +q || 1); });
      const n = Object.keys(got).length, shareBox = $("[data-smeta-share]");
      history.replaceState(null, "", location.pathname);
      if (n && !Object.keys(load()).length) { save(got); shareBox.textContent = `Смета открыта по ссылке: ${n} поз.`; shareBox.hidden = false; }
      else if (n) {
        shareBox.innerHTML = `По ссылке передана смета: ${n} поз. <button class="cbtn" type="button" data-share="replace">Заменить мой список</button> <button class="cbtn ghost" type="button" data-share="add">Добавить к моему</button>`;
        shareBox.hidden = false;
        shareBox.addEventListener("click", ev => {
          const m = ev.target.dataset.share; if (!m) return;
          const s = m === "add" ? load() : {};
          Object.entries(got).forEach(([a, q]) => { s[a] = (s[a] || 0) + q; });
          save(s); shareBox.hidden = true; renderSmeta();
        });
      }
    }
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
    $("[data-smeta-hints]").addEventListener("click", ev => {
      const b = ev.target.closest("[data-hint-add]"); if (!b) return;
      const s = load(); s[b.dataset.hintAdd] = (s[b.dataset.hintAdd] || 0) + (+b.dataset.q || 1); save(s); renderSmeta();
    });
    // печать, ссылка, текст
    const tmsg = $("[data-tools-msg]");
    const copy = async (text, ok) => { try { await navigator.clipboard.writeText(text); tmsg.textContent = ok; } catch { window.prompt("Скопируйте:", text); } setTimeout(() => { tmsg.textContent = ""; }, 3000); };
    $("[data-print]").addEventListener("click", () => window.print());
    $("[data-copy-link]").addEventListener("click", () => copy(location.origin + "/smeta/?s=" + Object.entries(load()).map(([a, q]) => encodeURIComponent(a) + "*" + q).join(","), "Ссылка скопирована"));
    $("[data-copy-text]").addEventListener("click", () => copy(rows().map(({ a, q, it }) => `${a}\t${it.n}\t${q}\t${it.b != null ? it.b * q + " BYN" : "по запросу"}`).join("\n"), "Список скопирован"));
    // загрузка списка: «артикул количество» в строке
    $("[data-import-go]").addEventListener("click", () => {
      const area = $("[data-import]"), m = $("[data-import-msg]"), s = load(), miss = [];
      let n = 0;
      area.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean).forEach(line => {
        const parts = line.split(/[\s;,]+/).filter(Boolean);
        const q = parts.length > 1 && /^\d+$/.test(parts[parts.length - 1]) ? +parts.pop() : 1;
        const a = findArt(parts[0] || "");
        if (a) { s[a] = (s[a] || 0) + Math.max(1, q); n++; } else miss.push(parts[0]);
      });
      save(s); renderSmeta();
      m.className = "msg " + (miss.length ? "bad" : "ok");
      m.textContent = `Добавлено позиций: ${n}.` + (miss.length ? ` Не нашли: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? "…" : ""}. Такие позиции напишите в комментарии к заявке.` : "");
      if (!miss.length) area.value = "";
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
