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

  // ---- кабинет: вход, роль и скидка (kab.php, владелец 03.11.2026). Скидка дилера или личная скидка клиента — процент от розничной цены.
  // Пока страница открывается, скидка берётся из памяти браузера (hdl-me), потом сверяется с сервером: изменилась — страница перезагружается.
  // Применяется один раз, до сметы и подсказок: цены в данных (D.items), в атрибутах вариантов и в тексте цен на странице ----
  const ME_KEY = "hdl-me";
  const loggedIn = () => /(^|;\s*)hdl_in=1/.test(document.cookie);
  let ME = null;
  try { if (loggedIn()) ME = JSON.parse(localStorage.getItem(ME_KEY)); else localStorage.removeItem(ME_KEY); } catch {}
  const DISC = ME && ME.d > 0 ? ME.d : 0;
  const STAFF = !!(ME && ME.role === "staff");  // сотрудник AllVision: правит скидки и свои строки в смете
  const disc = b => DISC ? Math.round(b * (1 - DISC / 100)) : b;
  const pct = d => String(d).replace(".", ",") + " %";
  if (DISC) {
    Object.values(D.items).forEach(it => { if (it.b != null) { it.rb = it.b; it.b = disc(it.b); } });  // rb — розничная, для расшифровки скидки в смете
    $$("[data-byn]").forEach(x => { x.dataset.byn = disc(+x.dataset.byn); });
    $$(".ctl [data-b]").forEach(x => { x.dataset.b = disc(+x.dataset.b); });
    $$("[data-b0]").forEach(x => { x.dataset.b0 = disc(+x.dataset.b0); });
    $$(".card[data-price]").forEach(x => { if (+x.dataset.price < 1e9) x.dataset.price = disc(+x.dataset.price); });
    $$("[data-vmap]").forEach(x => { const m = JSON.parse(x.dataset.vmap); Object.values(m).forEach(v => { if (v.b != null) v.b = disc(v.b); }); x.dataset.vmap = JSON.stringify(m); });
    // цены, написанные на странице: карточки, цена товара, драйверы светильников, «панели от …» у коллекций
    $$(".price, b[data-price], .ctl button span, .keyf dd, .ccard em").forEach(el => el.childNodes.forEach(n => {
      if (n.nodeType === 3) n.textContent = n.textContent.replace(/\d{1,3}(?:\s\d{3})+(?= BYN)|\d+(?= BYN)/g, m => fmt(disc(+m.replace(/\D/g, ""))));
    }));
    const label = (ME.role === "dealer" ? "Цена дилера" : "Ваша цена") + ": скидка " + pct(DISC);
    $$(".card .price").forEach(p => p.insertAdjacentHTML("afterend", `<span class="disc" title="${label}">−${pct(DISC)}</span>`));
    $(".buy .pr")?.insertAdjacentHTML("afterend", `<p class="disc-note">${label} от розничной</p>`);
  }
  const kabApi = async (a, body) => {
    const r = await fetch("/kab.php?a=" + a, body === undefined ? { credentials: "same-origin" }
      : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-HDL": "1" }, body: JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch {}
    return Object.assign({ status: r.status }, j);
  };
  // в память браузера — только то, что нужно для цен, шапки и подстановки в формы
  const remember = u => {
    const m = u ? { d: +u.discount || 0, role: u.role, name: u.name, phone: u.phone } : null;
    try { if (m) localStorage.setItem(ME_KEY, JSON.stringify(m)); else localStorage.removeItem(ME_KEY); } catch {}
    return m;
  };
  const acc = $("[data-acc]");
  const setAcc = u => { if (!acc) return; const t = u ? "Кабинет" : "Войти"; $("[data-acc-t]", acc).textContent = t; acc.setAttribute("aria-label", t); };
  setAcc(ME);
  if (loggedIn() && !$("[data-kab]")) kabApi("me").then(j => {
    if (!j.ok) return;
    const m = remember(j.user);
    setAcc(m);
    let again = "";
    try { again = sessionStorage.getItem("hdl-me-r"); } catch {}
    if ((m ? m.d : 0) === DISC) { try { sessionStorage.removeItem("hdl-me-r"); } catch {} return; }
    if (again === location.href) return;  // уже перезагружали ради скидки — не по кругу
    try { sessionStorage.setItem("hdl-me-r", location.href); } catch {}
    location.reload();
  }).catch(() => {});

  // ---- высота шапки для перехода к форме по ссылке (style.css, section[id]): на компьютере шапка в две строки, на телефоне в одну ----
  const topH = () => { const t = $(".top"); if (t && !t.matches(".open, .cat-open, .search-open, .away")) document.documentElement.style.setProperty("--top-h", t.offsetHeight + "px"); };
  topH();
  addEventListener("resize", topH);
  // с открытым меню шапка в разы выше: закрыли меню, каталог или поиск — меряем заново (иначе строка правки уезжала за экран, 06.11.2026)
  if ($(".top")) new MutationObserver(topH).observe($(".top"), { attributes: true, attributeFilter: ["class"] });

  // ---- cookie: окно, пока не выбрали «Принять» или «Отклонить»; выбор в памяти браузера, после «no» Метрика не грузится ----
  const CK = "hdl-cookie";
  const ckBox = $("#cookie");
  if (ckBox) {
    try { ckBox.hidden = !!localStorage.getItem(CK); } catch { ckBox.hidden = false; }
    $$("[data-cookie]", ckBox).forEach(b => b.addEventListener("click", () => {
      try { localStorage.setItem(CK, b.dataset.cookie); } catch {}
      ckBox.hidden = true;
    }));
  }

  // ---- смета: { артикул: количество } ----
  const KEY = "hdl-smeta";
  // объект, а не массив: пустой состав с сервера раньше приходил как [] — в массиве скидки в строках и новые позиции молча терялись (06.11.2026)
  const obj = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  // название документа сметы («Коммерческое предложение»…) — идёт вместе со списком: по ссылке, из кабинета (владелец 05.11.2026)
  const DOC_KEY = "hdl-doc", DOC0 = "Список для сметы";
  const docGet = () => { try { return localStorage.getItem(DOC_KEY) || DOC0; } catch { return DOC0; } };
  const docSet = d => { try { if (d && d !== DOC0) localStorage.setItem(DOC_KEY, d); else localStorage.removeItem(DOC_KEY); } catch {} };
  // названия документа с сервера (страница сметы). Пока не пришли — название берётся из памяти, а не из заголовка страницы:
  // иначе быстрое «Сохранить» стирало название (06.11.2026)
  let DOCS = null;
  const docNow = () => { const h = $("[data-doc-h]"), t = DOCS && h ? h.textContent || DOC0 : docGet(); return t === DOC0 ? "" : t; };
  // смета из кабинета: d — скидка в смете (null — личная), ld, extra, id или lid, uid — чья, title. У сотрудника ещё: edit — что правится,
  // ud — личная скидка клиента, who, ph, wtg — есть ли кабинет, v — версия, saved — подпись сохранённого, k — метка вкладки, back — куда вернуться.
  // Приходит только из кабинета: ссылкой скидку не передать
  const SM_KEY = "hdl-sm";
  const smGet = () => { try { const m = JSON.parse(localStorage.getItem(SM_KEY)) || null; if (m) m.ld = obj(m.ld); return m; } catch { return null; } };
  const smSet = m => { try { if (m) localStorage.setItem(SM_KEY, JSON.stringify(m)); else localStorage.removeItem(SM_KEY); } catch {} };
  // скидка, по которой считается смета: скидка сметы, иначе личная. Сотрудник, открыв чужую смету или заявку, видит её с личной скидкой
  // клиента (m.ud), а не со своей
  const effD = () => { const m = smGet(); return m && m.d != null ? +m.d : STAFF && m && m.ud != null ? +m.ud : DISC; };
  // сотрудник правит открытую из кабинета заявку (m.edit «l», m.lid) или смету («s», m.id), новую — «nl» / «ns» (владелец 06.11.2026)
  const editing = () => { const m = smGet(); return STAFF && !!(m && m.edit); };
  const edName = m => !m || !m.edit ? "" : ({ l: `заявки №${m.lid}`, s: `сметы «${m.title || ""}»`, nl: "новой заявки", ns: "новой сметы" }[m.edit] || "") + (m.who ? ` (${m.who})` : "");
  const edTo = () => { const m = smGet(); return STAFF && m && m.edit ? (m.edit === "l" ? ` в заявку №${m.lid}` : " в правку") : ""; };  // «Добавлено в заявку №12»
  // кнопка «В смету» во время правки называет, куда кладёт: «В заявку №12» (06.11.2026)
  const addLabel = () => { const m = smGet(); return !(STAFF && m && m.edit) ? "В смету" : m.edit === "l" ? `В заявку №${m.lid}` : m.edit === "nl" ? "В заявку" : "В смету"; };
  // сколько позиций добавлено с тех пор, как из правки открыли каталог (m.cat0 — список на тот момент)
  const catNew = (m, s) => !m || !m.cat0 ? [] : Object.keys(s).filter(k => (s[k] || 0) > (+m.cat0[k] || 0));
  const load = () => { try { return obj(JSON.parse(localStorage.getItem(KEY))); } catch { return {}; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} count(); };
  const count = () => {
    const n = Object.values(load()).reduce((a, b) => a + b, 0);
    $$("[data-smeta-count]").forEach(el => el.textContent = n);
    // идёт правка — в шапке «Правка» вместо «Смета», что именно — в подсказке
    const m = smGet(), ed = STAFF && m && m.edit;
    $$(".smeta-link").forEach(a => { a.classList.toggle("editing", !!ed); a.title = ed ? "Открыта правка " + edName(m) : ""; const t = a.firstChild; if (t && t.nodeType === 3) t.textContent = ed ? "Правка " : "Смета "; });
    catBack();
    if (syncBuyRef) syncBuyRef();
  };
  // каталог во время правки: под шапкой (на телефоне внизу) — «← Вернуться к заявке №12», кто клиент и сколько добавлено (06.11.2026)
  const IN_CAT = location.pathname.startsWith("/katalog/");
  let syncBuyRef = null;  // карточка товара: поле количества и «Оформить» (задаётся ниже)
  const catBack = () => {
    if (!IN_CAT) return;
    const m = smGet(), on = !!(STAFF && m && m.edit);
    let el = $("[data-cat-back]");
    document.body.classList.toggle("cat-editing", on);
    if (!on) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement("div"); el.className = "cat-back no-print"; el.setAttribute("data-cat-back", ""); $(".top")?.after(el); }
    const n = catNew(m, load()).length, to = { l: `к заявке №${m.lid}`, s: "к смете", nl: "к новой заявке", ns: "к новой смете" }[m.edit] || "к правке";
    el.hidden = false;
    el.innerHTML = `<div class="wrap cat-back-in"><a class="btn" href="/smeta/">← Вернуться ${esc(to)}</a>`
      + `<span>${m.who ? esc(m.who) + " · " : ""}${n ? `добавлено сейчас: ${n} поз.` : "добавляйте кнопкой «" + esc(addLabel()) + "»"}</span></div>`;
    $$("[data-add-card]:not(.done), [data-add]").forEach(b => { if (/^В (смету|заявку)/.test(b.textContent)) b.textContent = addLabel(); });
  };
  // остатки правки после выхода (06.11.2026): без входа на сайт — ни скидок, ни своих строк из кабинета; правку сотрудника у клиента
  // на общем компьютере — целиком, вместе со списком
  { const m = smGet(); if (m && (!loggedIn() || (ME && !STAFF && m.edit))) { if (m.edit) { try { localStorage.removeItem(KEY); } catch {} docSet(""); } smSet(null); } }
  count();
  // где были в каталоге (с фильтрами); пришли в каталог из меню, а не кнопкой «Каталог», — счёт добавленного тоже отсюда
  const catAt = () => { if (IN_CAT && editing()) { const m = smGet(); m.catAt = location.pathname + location.search; if (!m.cat0) m.cat0 = load(); smSet(m); } };
  catAt();
  document.addEventListener("click", ev => { if (ev.target.closest("[data-cat-back] a")) catAt(); });
  addEventListener("pageshow", ev => { if (ev.persisted) count(); });  // «Назад» из кэша браузера — счётчик в шапке по памяти
  addEventListener("storage", ev => { if (IN_CAT && [SM_KEY, KEY].includes(ev.key)) count(); });  // правку закрыли или сохранили в другой вкладке
  // подпись документа — то, что сохраняется. Совпадает с подписью при открытии или последнем сохранении — «Всё сохранено» (06.11.2026)
  const sortE = o => Object.entries(obj(o)).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const sig = (m, items) => {
    m = m || {};
    return JSON.stringify([sortE(items || load()), m.d ?? null, m.ud ?? null, sortE(m.ld),
      (m.extra || []).map(x => [String(x.n || "").trim(), x.u || "шт.", +x.q || 1, x.b == null || x.b === "" ? null : +x.b, x.d ?? null]), docGet() === DOC0 ? "" : docGet(),
      m.edit === "s" || m.edit === "ns" ? String(m.title || "").trim() : "", m.nt || "", m.uid ? "" : [m.who || "", m.ph || ""]]);
  };
  const dirty = m => !!(m && m.edit) && (m.edit === "ns" || m.edit === "nl" ? !!(Object.keys(load()).length || (m.extra || []).length) : m.saved !== sig(m));

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
    // подсказка в поле без обрезки (владелец 06.11.2026): самая длинная из тех, что влезают в ширину поля
    const HS_PH = ["Поиск: артикул или название", "Артикул или название", "Поиск по каталогу", "Поиск"];
    const hsCtx = document.createElement("canvas").getContext("2d");
    const hsFit = () => {
      if (!hs.clientWidth) return;
      const cs = getComputedStyle(hs);
      hsCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const room = hs.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      hs.placeholder = HS_PH.find(t => hsCtx.measureText(t).width <= room) || HS_PH[HS_PH.length - 1];
    };
    if (window.ResizeObserver) new ResizeObserver(hsFit).observe(hs);
    document.fonts?.ready.then(hsFit);
    hsFit();
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

  // ---- «Техподдержка»: номер под кнопкой ----
  const supBtn = $("[data-sup]"), supPop = $("#sup-pop");
  const setSup = open => { if (supPop) { supPop.hidden = !open; supBtn.setAttribute("aria-expanded", open); } };
  if (supBtn && supPop) {
    supBtn.addEventListener("click", ev => { ev.stopPropagation(); setSup(supPop.hidden); });
    document.addEventListener("click", ev => { if (!supPop.hidden && !supPop.contains(ev.target)) setSup(false); });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") setSup(false); });
  }

  // ---- «Заказать звонок» ----
  const dlg = $("#callback");
  $$("[data-callback]").forEach(b => b.addEventListener("click", () => dlg?.showModal()));
  $("[data-close]")?.addEventListener("click", () => dlg.close());
  dlg?.addEventListener("click", ev => { if (ev.target === dlg) dlg.close(); });

  // ---- карточка товара ----
  const main = $("[data-main]");
  $$(".thumbs button").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.opt) $$(".variants button").find(x => x.dataset.col === b.dataset.opt)?.click();  // снимок другого цвета — выбираем этот цвет
    main.src = b.dataset.src;
    $$(".thumbs button").forEach(x => x.removeAttribute("aria-current"));
    b.setAttribute("aria-current", "true");
  }));
  // свайп по большому фото (владелец 09.11.2026): влево — следующий снимок, вправо — предыдущий, по кругу; как нажатие на миниатюру
  const galBox = $(".gallery .main"), th = $$(".thumbs button");
  if (galBox && main && th.length > 1) {
    let x0 = null, y0 = 0, dx = 0, horiz = null;
    const cur = () => {
      const i = th.findIndex(b => b.hasAttribute("aria-current"));
      if (i >= 0) return i;
      const j = th.findIndex(b => main.src.endsWith(b.dataset.src));
      return j >= 0 ? j : 0;
    };
    const reset = () => { main.style.transition = "transform .2s"; main.style.transform = ""; x0 = null; };
    galBox.addEventListener("touchstart", ev => { if (ev.touches.length !== 1) return; x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; dx = 0; horiz = null; main.style.transition = ""; }, { passive: true });
    galBox.addEventListener("touchmove", ev => {
      if (x0 === null) return;
      dx = ev.touches[0].clientX - x0; const dy = ev.touches[0].clientY - y0;
      if (horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horiz = Math.abs(dx) > Math.abs(dy);
      if (horiz) { ev.preventDefault(); main.style.transform = "translateX(" + (dx * 0.6) + "px)"; }
    }, { passive: false });
    const end = () => {
      if (x0 === null) return;
      const go = horiz && Math.abs(dx) > 40 ? (dx < 0 ? 1 : -1) : 0;
      reset();
      if (go) { const b = th[(cur() + go + th.length) % th.length]; b.click(); }
    };
    galBox.addEventListener("touchend", end);
    galBox.addEventListener("touchcancel", reset);
  }
  const add = $("[data-add]");
  $$(".variants button").forEach(b => b.addEventListener("click", () => {
    $$(".variants button").forEach(x => x.setAttribute("aria-checked", "false"));
    b.setAttribute("aria-checked", "true");
    if (b.dataset.byn && $("[data-price]")) $("[data-price]").textContent = fmt(+b.dataset.byn) + " BYN";
    $("[data-art]").textContent = b.dataset.art || b.dataset.a;
    const noPhoto = $("[data-nophoto]"); if (noPhoto) noPhoto.hidden = !!b.dataset.img;
    if (add) add.dataset.add = b.dataset.a;
    // большое фото — того же цвета (картинка варианта из прайса)
    if (main && b.dataset.img) { main.src = b.dataset.img; $$(".thumbs button").forEach(x => x.removeAttribute("aria-current")); }
  }));
  const qi = $("[data-qty-input]");
  // товар уже в смете (владелец 06.11.2026): поле показывает, сколько его в смете, «+» и «−» меняют смету сразу, кнопка «+1 в смету»,
  // справа «В смете 3 шт. · Оформить →» (во время правки — «Вернуться»). Строка сметы — то же исполнение, угол, цвет и «без драйвера»
  const buyKey = () => { const a = add && add.dataset.add; return a ? a + (add.dataset.opt || "") + (add.dataset.nodrv ? " · без драйвера" : "") : ""; };
  let buyGo = null, buyIn = false;
  syncBuyRef = () => syncBuy();  // счётчик в шапке поменялся (эта вкладка) — и поле, и кнопка  // buyIn — поле сейчас показывает количество в смете
  const syncBuy = () => {
    if (!add) return;
    if (!buyGo) { buyGo = document.createElement("a"); buyGo.className = "btn ghost buy-go"; buyGo.href = "/smeta/"; buyGo.hidden = true; add.after(buyGo); }
    const k = buyKey(), n = k ? +load()[k] || 0 : 0, m = smGet(), ed = STAFF && m && m.edit;
    if (n) {
      if (qi && document.activeElement !== qi) qi.value = n;
      buyIn = true;
      if (!/^Добавлено/.test(add.textContent)) add.textContent = "+1 " + addLabel().replace(/^В /, "в ");
      buyGo.textContent = (ed && m.edit === "l" ? `В заявке №${m.lid}` : ed && m.edit === "nl" ? "В заявке" : "В смете") + ` ${n} шт. · ${ed ? "Вернуться" : "Оформить"} →`;
      buyGo.hidden = false;
    } else {
      if (buyIn && qi) qi.value = 1;  // убрали из сметы — поле снова «сколько добавить»
      buyIn = false;
      if (!/^Добавлено/.test(add.textContent)) add.textContent = addLabel();
      buyGo.hidden = true;
    }
  };
  // изменить количество в смете на dq (и драйвер к светильнику — столько же); до нуля — с вопросом
  const buySet = q => {
    const k = buyKey(), s = load(), n = +s[k] || 0, d = add.dataset.add2;
    if (!n) return;
    q = Math.round(q);
    if (q < 1) {
      if (!confirm("Убрать из сметы?")) { syncBuy(); return; }
      q = 0;
    }
    if (d && s[d]) { s[d] = s[d] + (q - n); if (s[d] < 1) delete s[d]; }
    if (q) s[k] = q; else delete s[k];
    save(s); syncBuy();
  };
  $$("[data-qty]").forEach(b => b.addEventListener("click", () => {
    if (buyIn && buyKey() && +load()[buyKey()]) return buySet((+load()[buyKey()] || 0) + +b.dataset.qty);
    qi.value = Math.max(1, (+qi.value || 1) + +b.dataset.qty);
  }));
  qi?.addEventListener("change", () => { if (buyIn && buyKey() && +load()[buyKey()]) buySet(+qi.value || 0); });
  // исполнение, угол, драйвер, «без драйвера» меняют строку сметы — поле и кнопка справа за ней
  if (add) new MutationObserver(syncBuy).observe(add, { attributes: true, attributeFilter: ["data-add", "data-opt", "data-nodrv", "data-add2"] });
  addEventListener("storage", ev => { if ([KEY, SM_KEY, null].includes(ev.key)) syncBuy(); });
  addEventListener("pageshow", ev => { if (ev.persisted) syncBuy(); });
  let beamOpt = () => "", beamSync = () => {};  // угол и цвет света для строки сметы — задаёт блок «Угол луча» ниже
  let ctlNoDrv = () => {};  // карточка на исполнении без драйвера — задаёт блок «Управление» ниже
  if (add) add.addEventListener("click", () => {
    const a = add.dataset.add;
    if (!a) {  // светильник: исполнение ещё не выбрано
      const need = $("[data-need]");
      // красная подсказка и рамка вокруг исполнений; повторный щелчок снова встряхивает подсказку (владелец 03.11.2026: «было явно видно»).
      // В подсказке заказ без драйвера (владелец 04.11.2026): предупреждение, что драйвер нужен, и согласие «драйвер у меня есть»; только после
      // галочки — выбор исполнения, которому нужен драйвер (с регулировкой цветовой температуры или без), и одна кнопка. Цены — с кнопок исполнений, уже со скидкой дилера
      if (need) {
        const nd = $("[data-need-nd]", need);
        if (nd && !nd.children.length) {
          const name = b => esc($("span", b)?.textContent || b.dataset.a);
          const drv = new Set($$(".ctl-opts button[data-a]").map(o => o.dataset.v)), chips = $$(".variants button");
          const vs = chips.filter(b => drv.has(b.dataset.a)), kit = chips.filter(b => !drv.has(b.dataset.a));
          if (vs.length) nd.innerHTML = '<p class="need-w">Для работы светильника необходим драйвер. Если драйвер у вас уже есть, светильник можно заказать без него.</p>'
            + '<label class="need-ok" data-need-ok><input type="checkbox"> <i>Понимаю, что без драйвера светильник работать не будет. Драйвер не нужен: он у меня есть</i></label>'
            + `<div class="need-more" data-need-more hidden><fieldset class="need-v" data-need-v><legend>${vs.length > 1 && vs.some(b => /цветов/i.test(b.textContent)) ? "Выберите светильник без драйвера — с регулировкой цветовой температуры или без:" : "Светильник без драйвера:"}</legend>`
            + (vs.some(b => /цветов/i.test(b.textContent)) ? '<p class="need-why"><a href="/cirkadnoe-osveshchenie/" target="_blank">Что даёт регулировка цветовой температуры?</a></p>' : "")
            + vs.map(b => `<label><input type="radio" name="need-v" value="${esc(b.dataset.a)}"${vs.length === 1 ? " checked" : ""}> <i>${name(b)}${b.dataset.byn ? ` <span>· ${fmt(+b.dataset.byn)} BYN</span>` : ""}</i></label>`).join("")
            + '</fieldset><button type="button" class="need-go" data-need-go>Всё равно в смету без драйвера</button><p class="need-err" data-need-err hidden></p></div>'
            + kit.map(b => `<p class="need-kit">Исполнению «${name(b)}» отдельный драйвер не нужен — выберите его выше.</p>`).join("");
        }
        need.hidden = false;
        need.classList.remove("shake"); void need.offsetWidth; need.classList.add("shake");
        const v = $(".variants");
        v?.classList.add("need-pick");
        v?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }
    const nodrv = !!add.dataset.nodrv;  // уже согласились без драйвера — та же строка сметы с пометкой
    const key0 = a + (add.dataset.opt || "") + (nodrv ? " · без драйвера" : ""), inSm = +load()[key0] || 0;
    const s = load(), q = inSm ? 1 : Math.max(1, +(qi?.value) || 1), d = add.dataset.add2, key = key0;  // уже в смете — «+1»
    s[key] = (s[key] || 0) + q;
    if (d) s[d] = (s[d] || 0) + q;  // драйвер — по одному на светильник
    save(s);
    add.textContent = (d ? "Добавлено с драйвером" : nodrv ? "Добавлено без драйвера" : "Добавлено") + edTo() + " ✓";
    syncBuy();
    setTimeout(() => { add.textContent = ""; syncBuy(); }, 1600);
  });
  // галочка «драйвер у меня есть» открывает выбор светильника и кнопку; «Всё равно в смету без драйвера» — только с выбранным исполнением;
  // в строке сметы пометка «без драйвера»
  const needBox = $("[data-need]");
  needBox?.addEventListener("change", ev => {
    const ok = ev.target.closest("[data-need-ok] input");
    if (ok) $("[data-need-more]", needBox).hidden = !ok.checked;
    ev.target.closest("[data-need-v]")?.classList.remove("bad");
    if (!$(".bad", needBox)) $("[data-need-err]", needBox).hidden = true;
  });
  needBox?.addEventListener("click", ev => {
    const go = ev.target.closest("[data-need-go]"); if (!go || go.disabled) return;
    const v = $("[data-need-v] input:checked", needBox), ok = $("[data-need-ok] input", needBox), err = $("[data-need-err]", needBox);
    if (!ok.checked) return;  // кнопка видна только после галочки
    $("[data-need-v]", needBox).classList.toggle("bad", !v);
    err.hidden = !!v;
    if (!v) { err.textContent = "Выберите светильник."; return; }
    const va = v.value, s = load(), q = Math.max(1, +(qi?.value) || 1), key = va + beamOpt(va) + " · без драйвера";
    s[key] = (s[key] || 0) + q;
    save(s); syncBuy();
    go.textContent = "Добавлено без драйвера ✓"; go.disabled = true;
    setTimeout(() => {  // подсказка закрывается, карточка остаётся на этом исполнении без драйвера
      needBox.hidden = true; $("[data-need-nd]", needBox).innerHTML = "";
      $(".variants")?.classList.remove("need-pick");
      ctlNoDrv(va);
    }, 1600);
  });

  // ---- светильник: при открытии исполнение не выбрано, «Без драйвера», цена «от». Выбрали исполнение — его первый драйвер, цена суммой,
  // в смету обе позиции; «Без драйвера» сбрасывает драйвер ----
  const ctl = $(".ctl[data-ctl]");  // только блок карточки светильника: у карточек панелей в сетке тоже есть data-ctl (фильтр «Управление»)
  if (ctl) {
    const opts = $$(".ctl-opts button", ctl), box = $(".ctl-opts", ctl), inc = $("[data-ctl-inc]", ctl), sum = $("[data-sum]"), pr = $("[data-price]");
    const variant = () => $$(".variants button").find(x => x.getAttribute("aria-checked") === "true");
    const show = () => {
      const v = variant(), va = v ? v.dataset.a : ctl.dataset.v0, vb = v ? +v.dataset.byn : +ctl.dataset.b0;
      const mine = opts.filter(o => o.dataset.v === va);
      opts.forEach(o => { o.hidden = o.dataset.v !== "*" && o.dataset.v !== va; });
      const kit = !!va && !mine.length;  // у исполнения «вкл/выкл» драйвер в комплекте: остаётся одна кнопка «Без драйвера» и подпись
      box.hidden = false; inc.hidden = !kit;
      if (kit) none.setAttribute("aria-checked", "false");  // драйвер внутри светильника: подсвечено только исполнение, «Без драйвера» — сброс
      const sel = mine.find(o => o.getAttribute("aria-checked") === "true");
      if (sel) {
        pr.textContent = fmt(vb + +sel.dataset.b) + " BYN";
        sum.innerHTML = "Светильник " + fmt(vb) + " BYN + драйвер <a href=\"" + sel.dataset.u + "\">" + sel.dataset.m + "</a> " + fmt(+sel.dataset.b) + " BYN";
        sum.hidden = false; add.dataset.add2 = sel.dataset.a;
      } else {
        pr.textContent = (va ? "" : ctl.dataset.from) + fmt(vb) + " BYN"; sum.hidden = true; delete add.dataset.add2;
      }
    };
    const pick = o => { delete add.dataset.nodrv; opts.forEach(x => x.setAttribute("aria-checked", String(x === o))); show(); };
    const none = opts.find(o => o.dataset.v === "*"), chips = $$(".variants button");
    // «Без драйвера» — как при открытии: исполнение не выбрано, цена «от», модель вместо артикула, в смету — после выбора исполнения
    const reset = () => {
      if (chips.length) {
        chips.forEach(x => x.setAttribute("aria-checked", "false"));
        $("[data-art]").textContent = ctl.dataset.model;
        const lab = $("[data-art-l]"); if (lab) lab.textContent = "Модель";
        add.dataset.add = "";
      }
      pick(none);
    };
    opts.forEach(o => o.addEventListener("click", () => o === none ? reset() : pick(o)));
    // выбрали исполнение — подставляем его первый драйвер (у «вкл/выкл» драйвер в комплекте)
    $$(".variants button").forEach(b => b.addEventListener("click", () => {
      const need = $("[data-need]", ctl), hinted = !need.hidden;
      need.hidden = true;
      $(".variants")?.classList.remove("need-pick");
      const lab = $("[data-art-l]"); if (lab) lab.textContent = "Артикул";  // до выбора исполнения там модель
      pick(opts.find(o => o.dataset.v === b.dataset.a) || opts.find(o => o.dataset.v === "*"));
      // после красной подсказки показываем, где подобран драйвер: кнопки «Управления», у «вкл/выкл» — строка «Драйвер в комплекте» (владелец 04.11.2026)
      if (hinted) {
        const el = inc.hidden ? box : inc;
        el.classList.remove("drv-hl"); void el.offsetWidth; el.classList.add("drv-hl");
        clearTimeout(el.hlT); el.hlT = setTimeout(() => el.classList.remove("drv-hl"), 3000);
      }
    }));
    // после «Всё равно в смету без драйвера» карточка остаётся на этом исполнении без драйвера: «В смету» с другим количеством кладёт
    // туда же, в строку «без драйвера», а не открывает подсказку снова (владелец 04.11.2026). Другое исполнение, драйвер или «Без драйвера» — как обычно
    ctlNoDrv = va => {
      const b = chips.find(x => x.dataset.a === va); if (!b) return;
      chips.forEach(x => x.setAttribute("aria-checked", String(x === b)));
      $("[data-art]").textContent = b.dataset.art || b.dataset.a;
      const lab = $("[data-art-l]"); if (lab) lab.textContent = "Артикул";
      const noPhoto = $("[data-nophoto]"); if (noPhoto) noPhoto.hidden = !!b.dataset.img;
      if (main && b.dataset.img) { main.src = b.dataset.img; $$(".thumbs button").forEach(x => x.removeAttribute("aria-current")); }
      add.dataset.add = va;
      pick(none);
      add.dataset.nodrv = "1";
      sum.textContent = "Без драйвера: вы отметили, что драйвер у вас есть."; sum.hidden = false;
      beamSync();
    };
    show();
  }

  // ---- светильник: угол луча и цвет света. По умолчанию максимальный угол и 3000 K; картинка конуса по выбору; выбранное — в строку сметы ----
  const beamBox = $("[data-beam]");
  if (beamBox) {
    const data = JSON.parse(beamBox.dataset.beam), svg = $("svg", beamBox), cap = $("[data-beam-cap]", beamBox);
    const aBox = $("[data-beam-a]", beamBox), kBox = $("[data-beam-k]", beamBox), kHead = $("[data-beam-kh]", beamBox), kNote = $("[data-beam-kn]", beamBox);
    const KCOL = { 2700: "#ffb24d", 3000: "#ffc56b", 3500: "#ffd894", 4000: "#fff0cf", 5000: "#e3ecff" };
    const KTXT = { 2700: "тёплый, уютный вечерний свет", 3000: "тёплый белый, для жилых комнат", 3500: "нейтрально-тёплый", 4000: "нейтральный белый, для кухни и работы", 5000: "холодный белый, дневной" };
    const ATXT = a => a <= 16 ? "узкий луч: акцент на картину, нишу, предмет" : a <= 36 ? "средний луч: свет над столом и общий свет" : a <= 60 ? "широкий луч: общий свет комнаты" : "рассеянный свет: ровное общее освещение";
    let ang = 0, k = 3000, cur = null, kOn = false;
    const variantNow = () => {
      const v = $$(".variants button").find(x => x.getAttribute("aria-checked") === "true");
      return v ? data.find(d => d.v === v.dataset.a) : data.length === 1 ? data[0] : null;
    };
    const draw = () => {
      // угол точный: у широкого луча конус ниже, чтобы основание помещалось в картинку
      const d = cur, tg = Math.tan(Math.min(ang, 160) / 2 * Math.PI / 180), h = Math.min(96, 96 / tg), half = h * tg, y = 14 + h;
      const fill = d && d.cct ? "url(#bcct)" : kOn ? KCOL[k] || "#fff4e0" : "#fff4e0";
      svg.innerHTML = '<defs><linearGradient id="bcct" x1="0" x2="1"><stop offset="0" stop-color="#ffb24d"/><stop offset="1" stop-color="#e3ecff"/></linearGradient>'
        + '<linearGradient id="bfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>'
        + '<mask id="bm"><rect width="200" height="120" fill="url(#bfade)"/></mask></defs>'
        + '<rect width="200" height="120" rx="10" fill="#1f1a1e"/>'
        + `<polygon points="100,14 ${100 - half},${y} ${100 + half},${y}" fill="${fill}" mask="url(#bm)"/>`
        + `<ellipse cx="100" cy="${y}" rx="${Math.max(half, 6)}" ry="4" fill="${fill}" opacity=".5"/><circle cx="100" cy="12" r="5" fill="#ffd36b"/>`;
      const t = d && d.cct ? `регулируется ${d.cct[0]}–${d.cct[1]} K: теплее вечером, холоднее днём` : kOn ? `${k} K — ${KTXT[k] || ""}` : "";
      cap.textContent = `${ang}° — ${ATXT(ang)}` + (t ? `. ${t[0].toUpperCase()}${t.slice(1)}` : "");
      if (add) add.dataset.opt = d && d.v === add.dataset.add ? ` · ${ang}°` + (d.k.length ? ` · ${k} K` : "") : "";
    };
    const chip = (box, vals, sel, unit, on) => {
      box.innerHTML = vals.map(v => `<button type="button" role="radio" aria-checked="${v === sel}" data-x="${v}">${v}${unit}</button>`).join("");
      $$("button", box).forEach(b => b.addEventListener("click", () => { on(+b.dataset.x); render(false); }));
    };
    const render = (fresh = true) => {
      cur = variantNow();
      const angs = cur ? cur.ang : [...new Set(data.flatMap(d => d.ang))].sort((a, b) => a - b);
      if (fresh || !angs.includes(ang)) ang = angs[angs.length - 1];  // по умолчанию — максимальный угол
      const ks = cur ? cur.k : [...new Set(data.flatMap(d => d.k))].sort((a, b) => a - b);  // до выбора исполнения — все температуры на выбор
      kOn = ks.length > 0;
      if (ks.length && !ks.includes(k)) k = ks.includes(3000) ? 3000 : ks[0];
      chip(aBox, angs, ang, "°", v => { ang = v; });
      chip(kBox, ks, k, " K", v => { k = v; });
      kBox.hidden = kHead.hidden = !ks.length;
      kNote.textContent = cur && cur.cct ? "Цветовая температура регулируется: выбирать не нужно." : "";
      draw();
    };
    // исполнение в смету из красной подсказки, без выбора исполнения: угол и цвет, выбранные на картинке, если они есть у этого исполнения
    beamOpt = va => {
      const d = data.find(x => x.v === va); if (!d) return "";
      const a = d.ang.includes(ang) ? ang : d.ang[d.ang.length - 1], kk = d.k.includes(k) ? k : d.k.includes(3000) ? 3000 : d.k[0];
      return (a ? ` · ${a}°` : "") + (d.k.length ? ` · ${kk} K` : "");
    };
    beamSync = () => render(false);  // исполнение выбрано без щелчка (после «без драйвера»): угол и цвет — те же, если они есть у исполнения
    // смена исполнения и сброс «Без драйвера» — после обработчиков карточки. Выбор драйвера исполнение не меняет: угол и цвет остаются
    document.addEventListener("click", ev => { if (ev.target.closest('.variants button, .ctl-opts button[data-v="*"]')) setTimeout(() => render(true), 0); });
    render(true);
  }

  syncBuy();

  // ---- «В смету» прямо с карточки в сетке ----
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-add-card]"); if (!b) return;
    const s = load(); s[b.dataset.addCard] = (s[b.dataset.addCard] || 0) + 1; save(s);
    const m = smGet();
    b.textContent = !editing() ? "✓ В смете" : m.edit === "l" ? `✓ В заявке №${m.lid}` : "✓ Добавлено"; b.classList.add("done");
    setTimeout(() => { b.textContent = addLabel(); b.classList.remove("done"); }, 1600);
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
    // браузер при смене списка держит на экране ту же карточку: сняли отметку — над ней появились сотни карточек, и страницу уносит вниз
    document.documentElement.style.overflowAnchor = "none";
    const grid = $(".cat-main .grid"), cards = $$(".card", grid);
    const found = $("[data-found]"), title = $("[data-cat-title]"), empty = $("[data-empty]"), bars = $$("[data-bar]");
    const intro = found.textContent, title0 = title.textContent;
    const NAMES = [...new Set($$("[data-fl] input").map(x => x.name))];  // все фильтры страницы
    const boxes = n => $$(`[data-fl] input[name=${n}]`);
    const checked = n => boxes(n).filter(x => x.checked).map(x => x.value);
    const label = x => x.parentElement.querySelector("span").textContent.trim();
    const vals = (c, n) => (c.dataset[n] || "").split("|").filter(Boolean);
    const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return n + " " + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c); };
    const groupsOf = c => c.dataset.g.split("|");  // у шлюза DALI две группы: «dimmery|shlyuzy»
    // строка фильтров категории видна, только когда открыта эта категория: выбраны только её группы или все карточки страницы из неё; у скрытых — отметки снимаем
    const showBars = () => {
      const gsel = checked("g");
      const fits = list => gsel.length ? gsel.every(g => list.includes(g)) : cards.length > 0 && cards.every(c => groupsOf(c).some(g => list.includes(g)));
      bars.forEach(b => { const ok = fits(b.dataset.bar.split(" ")); b.hidden = !ok; if (!ok) $$("input", b).forEach(x => x.checked = false); });
    };
    // на телефоне ряды блока фильтров открыты сразу, кнопка их сворачивает
    const barOpen = (bar, on) => {
      bar.classList.toggle("open", on);
      const m = $("[data-bar-more]", bar);
      if (m) { m.textContent = on ? "Свернуть фильтры" : "Все фильтры"; m.setAttribute("aria-expanded", String(on)); }
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
      // вариант, который при остальных фильтрах ничего не найдёт, прячем
      NAMES.forEach(nm => boxes(nm).forEach(x => {
        const k = cards.filter(c => pass(c, nm) && vals(c, nm).includes(x.value) &&
          (nm === "col" ? combo(c, sel.mat, [x.value]) : nm === "mat" ? combo(c, [x.value], sel.col) : true)).length;
        x.parentElement.classList.toggle("zero", k === 0 && !x.checked);
        x.disabled = k === 0 && !x.checked;  // система без товаров видна серой (см. style.css), выбрать её нельзя
      }));
      // варианты с нулём спрятаны; ряд или блок, где не осталось вариантов, прячем целиком
      $$("[data-sys]").forEach(b => {
        const v = b.dataset.sys, x = v && boxes("p").find(i => i.value === v);
        b.setAttribute("aria-pressed", String(v ? sel.p.length === 1 && sel.p[0] === v : !sel.p.length));
        if (x) b.disabled = x.parentElement.classList.contains("zero");  // кнопка остаётся на месте серой: ряд не перестраивается, «Группа» не сдвигается
      });
      $$(".bar-row, .cat-side fieldset, .cat-side .ff").forEach(r => { r.hidden = !$$(".chip:not(.all):not(.zero), .fbox:not(.zero)", r).length; });
      bars.forEach(b => {
        if (!b.hidden) b.hidden = !$$(".bar-row:not([hidden])", b).length;
        const m = $("[data-bar-more]", b);
        if (m) m.hidden = $$(".bar-row:not([hidden])", b).length < 2;
        barOpen(b, b.dataset.manual !== "closed");
      });
      $$("[data-clear]").forEach(b => b.setAttribute("aria-pressed", String(!sel[b.dataset.clear].length)));
      // заголовок
      const lab = n => boxes(n).filter(x => x.checked).map(label);
      const gl = lab("g"), pl = lab("p"), cl = lab("coll");
      title.textContent = cl.length === 1 && !boxes("g").length ? title0 + " · " + cl[0]
        : cl.length === 1 ? "Коллекция " + cl[0] + (gl.length === 1 ? ": " + gl[0].toLowerCase() : "")
        : gl.length === 1 ? gl[0] + (pl.length === 1 ? " " + pl[0] : "") : pl.length === 1 && !gl.length ? pl[0] : title0;
      found.textContent = n === cards.length ? intro : "Найдено: " + plural(n, "позиция", "позиции", "позиций");
      // выбрана одна коллекция — её снимки в интерьере над карточками; блок «функции на клавише» — только когда среди найденного есть панели
      const panelsShown = cards.some(c => !c.hidden && c.dataset.g === "paneli");
      $$("[data-int]").forEach(x => { x.hidden = !(sel.coll && sel.coll.length === 1 && sel.coll[0] === x.dataset.int) || (x.classList.contains("keyx") && !panelsShown); });
      empty.hidden = n > 0;
      const resetRow = $(".bar-reset");
      if (resetRow) resetRow.hidden = !search.value && !NAMES.some(n => sel[n].length);
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
        if (hit) { if (img && m[hit].i) img.src = m[hit].i; if (m[hit].b != null) pr.textContent = fmt(m[hit].b) + " BYN"; }
        else if (c.dataset.img0) { img.src = c.dataset.img0; pr.textContent = c.dataset.pr0; }
      });
      if (push) {
        const u = new URLSearchParams();
        if (search.value.trim()) u.set("q", search.value.trim());
        NAMES.forEach(nm => sel[nm].forEach(v => u.append(nm, v)));
        history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : ""));
      }
    };
    // после щелчка по фильтру: страница прокручена ниже начала списка — возвращаем к началу (иначе короткий список уводит к подвалу),
    // боковая панель на компьютере «прилипает» на 140 px и остаётся на месте. Иначе то, по чему щёлкнули, остаётся под пальцем:
    // на телефоне над панелью заголовок меняет число строк и кнопки систем
    const keep = (el, fn) => {
      const y = el.getBoundingClientRect().top;
      fn();
      if (grid.getBoundingClientRect().top < 0) {
        const st = getComputedStyle($("#cat-side")), at = st.position === "sticky" ? parseFloat(st.top) : $(".top").offsetHeight + 8;
        window.scrollTo({ top: scrollY + $(".cat-layout").getBoundingClientRect().top - at, behavior: "instant" });
      } else if (el.getClientRects().length && el.getBoundingClientRect().top !== y) {
        window.scrollBy({ top: el.getBoundingClientRect().top - y, behavior: "instant" });
      }
    };
    $$("[data-fl] input").forEach(x => x.addEventListener("change", () => keep(x, apply)));
    $$("[data-clear]").forEach(b => b.addEventListener("click", () => keep(b, () => { boxes(b.dataset.clear).forEach(x => x.checked = false); apply(); })));
    search.addEventListener("input", () => apply());
    $("[data-reset]").addEventListener("click", ev => keep(ev.currentTarget, () => { $$("[data-fl] input").forEach(x => x.checked = false); search.value = ""; apply(); }));
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
    $$("[data-bar-more]").forEach(b => b.addEventListener("click", () => {
      const bar = b.parentElement, on = !bar.classList.contains("open");
      bar.dataset.manual = on ? "open" : "closed";  // выбор посетителя сохраняется при смене фильтров
      barOpen(bar, on);
    }));
    // переключатель систем: где на странице все системы, работает как фильтр; где одна, это ссылки, выбранные фильтры едут с собой
    $$("[data-sys]").forEach(b => b.addEventListener("click", () => { keep(b, () => { boxes("p").forEach(x => { x.checked = x.value === b.dataset.sys; }); apply(); }); }));
    $$(".sys-switch a").forEach(a => a.addEventListener("click", () => {
      a.dataset.base = a.dataset.base || a.getAttribute("href");
      const u = new URL(a.dataset.base, location.href);
      new URLSearchParams(location.search).forEach((v, k) => { if (!u.searchParams.has(k)) u.searchParams.append(k, v); });
      a.href = u.href;
    }));
    // из адреса: ?q=…&p=buspro&g=paneli&coll=Xelent&col=Латунь
    const qs = new URLSearchParams(location.search);
    if (qs.get("q")) search.value = qs.get("q");
    const OLD_G = { rele: "upravlenie-svetom", dimmery: "upravlenie-svetom", "bloki-pitaniya": "sistemnye" };  // разделы объединены 03.11.2026
    NAMES.forEach(nm => qs.getAll(nm).forEach(v => { v = nm === "g" ? OLD_G[v] || v : v; boxes(nm).forEach(x => { if (x.value === v) x.checked = true; }); }));
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
  const itemOf = a => {
    if (D.items[a]) return D.items[a];
    const [base, ...opt] = a.split(" · "), it = D.items[base];
    return it ? { ...it, n: it.n + ", " + opt.join(", ") } : { n: a, u: "", t: "", b: null };
  };
  const rows = () => Object.entries(load()).map(([a, q]) => ({ a, q, it: itemOf(a) }));
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
  // строки сметы (владелец 05.11.2026): из каталога и свои — то, чего нет в каталоге (монтаж, кабель, щит). Скидка строки — своя
  // (m.ld[артикул], у своей строки d), иначе общая: скидка сметы m.d, иначе личная (у сотрудника в чужом документе — клиента, m.ud).
  // Цена со скидкой — за штуку до рубля, как в каталоге
  const smLines = (items, m) => {
    m = m || {};
    const D0 = m.d != null ? +m.d : STAFF && m.ud != null ? +m.ud : DISC, LD = obj(m.ld);
    const ls = Object.entries(obj(items)).map(([a, q]) => { const it = itemOf(a); return { key: a, a, q, it, n: it.n, rb: it.rb ?? it.b, disc: LD[a] ?? D0 }; })
      .concat((m.extra || []).map((x, i) => ({ key: "~" + i, x, i, q: +x.q || 1, n: x.n, u: x.u, rb: x.b == null || x.b === "" ? null : +x.b, disc: x.d ?? D0 })));
    const r2 = v => Math.round(v * 100) / 100;  // до копейки: у своих строк бывают копейки (кабель 1,85 за метр)
    ls.forEach(l => {
      l.u1 = l.rb == null ? null : l.disc ? (l.x ? r2(l.rb * (1 - l.disc / 100)) : Math.round(l.rb * (1 - l.disc / 100))) : l.rb;
      l.t = l.u1 == null ? null : r2(l.u1 * l.q);
      l.off = l.t == null ? 0 : r2(l.rb * l.q - l.t);
    });
    return ls;
  };
  // строки для заявки — как их видит посетитель: b — цена за штуку со скидкой, rb — без скидки, p — скидка строки, % (расшифровка в кабинете,
  // 06.11.2026); свои строки — «своя строка», единица после запятой. Своя строка без названия и цены не идёт, без названия с ценой — «Своя строка»
  const leadRows = m => smLines(load(), m).filter(l => !l.x || String(l.n || "").trim() || l.rb != null)
    .map(l => ({ a: l.x ? "своя строка" : l.a, n: l.x ? `${String(l.n || "").trim() || "Своя строка"}, ${l.u || "шт."}` : l.n, q: l.q, b: l.u1, rb: l.rb, p: l.u1 == null ? null : (+l.disc || 0) }));
  // своя строка без названия: перед сохранением просим вписать название или убрать строку (06.11.2026: такие строки терялись)
  const ownNoName = m => ((m && m.extra) || []).findIndex(x => !String((x && x.n) ?? "").trim());
  let PRINT = false;  // печать: без полей ввода, колонки скидки — только если она есть
  let NONAME = -1;    // своя строка без названия после неудачного сохранения — красная рамка
  let onRender = () => {};  // полоса правки обновляет «сохранено / есть изменения» после каждой перерисовки
  let K0 = "";        // метка документа, который правит эта вкладка
  let staleDone = ""; // вкладка устарела во время сохранения, а оно прошло — пишем об этом в пояснении
  const renderSmeta = () => {
    if (!box) return;
    const r = rows(), m = smGet() || {}, n = r.length + (m.extra || []).length, edNow = editing();
    $("[data-smeta-form]").hidden = !n || edNow;  // правку заявки сохраняют в неё же, новой заявкой не отправляют
    $("[data-smeta-tools]").hidden = !n;
    const sb = $("[data-send-bar]");
    if (sb) sb.hidden = !n || edNow || STAFF;
    // во время правки сохраняет только полоса сверху: нижние «Сохранить в кабинет» и «Сохранить для клиента» сохраняли не туда (06.11.2026)
    const kp = $("[data-smeta-save]"), fp = $("[data-smeta-for]"), fb = $("[data-for-box]");
    if (kp) kp.hidden = !ME || edNow;
    const pj = $("[data-smeta-proj]"), pb = $("[data-proj-box]");
    if (pj) pj.hidden = !STAFF || edNow;
    if (pb && edNow) pb.hidden = true;
    if (fp) fp.hidden = !STAFF || edNow;
    if (fb && edNow) fb.hidden = true;
    renderHints(r);
    const di = $("[data-sm-d]");
    if (di && document.activeElement !== di) di.value = m.d != null ? m.d : "";
    // какая скидка действует, если поле пустое (06.11.2026: в поле было «нет», а считалась личная скидка клиента)
    const dn = $("[data-sm-dnote]");
    if (dn) {
      const own = Object.keys(obj(m.ld)).length || (m.extra || []).some(x => x.d != null && x.d !== "");
      const re = m.edit === "l" && m.d == null && m.udNow != null && m.ud != null && +m.udNow !== +m.ud;
      dn.innerHTML = (m.d != null ? `в документе ${pct(m.d)}` : STAFF && m.ud != null ? (+m.ud ? `пусто — личная скидка клиента ${pct(m.ud)}${m.edit === "l" ? " на момент заявки" : ""}` : "пусто — у клиента нет личной скидки")
        : DISC ? `пусто — ваша личная ${pct(DISC)}` : "пусто — без скидки") + (own ? ", в строках есть свои" : "")
        + (re ? ` · сейчас у клиента ${pct(+m.udNow || 0)} <button class="cbtn ghost" type="button" data-ud-now>Пересчитать по ${pct(+m.udNow || 0)}</button>` : "");
      if (di) di.placeholder = m.d == null && effD() ? String(effD()).replace(".", ",") : "нет";
    }
    if (!n) { if (!STAFF) smSet(null); box.innerHTML = '<p>Список пуст. Добавляйте позиции кнопкой «В смету» в <a href="/katalog/">каталоге</a> или загрузите готовый список артикулов.</p>'; onRender(); return; }
    // скидка — расшифровкой: розничная цена, процент, сумма скидки по строке и всего (владелец 05.11.2026); «без скидки − скидка = итого» до рубля
    const ed = STAFF && !PRINT, D0 = effD(), ls = smLines(load(), m);
    const anyD = ls.some(l => l.t != null && l.disc > 0), showD = anyD || ed, pcts = new Set(ls.filter(l => l.t != null).map(l => +l.disc));
    const one = pcts.size === 1 ? [...pcts][0] : null, money = v => v != null ? fmt(v) + " BYN" : "по запросу";
    let sum = 0, full = 0, ask = 0;
    ls.forEach(l => { if (l.t != null) { sum += l.t; full += l.rb * l.q; } else ask++; });
    sum = Math.round(sum * 100) / 100; full = Math.round(full * 100) / 100;
    const fresh = new Set(edNow ? catNew(m, load()) : []);  // добавлено из каталога после «Каталог» — до сохранения
    const tr = ls.map(l => {
      const own = !!l.x, k = esc(l.key), isNew = !own && fresh.has(l.key);
      const dval = own ? (l.x.d ?? "") : (obj(m.ld)[l.a] ?? "");
      const dIn = `<input class="pct-in" type="number" min="0" max="50" step="0.5" value="${dval}" placeholder="${D0 || 0}" ${own ? `data-x="${l.i}" data-f="d"` : `data-ld="${k}"`} aria-label="Скидка в строке, %">`;
      const bIn = own ? `<input class="x-b" data-x="${l.i}" data-f="b" inputmode="decimal" value="${l.rb ?? ""}" placeholder="цена, BYN" aria-label="Цена, BYN">` : "";
      const dcell = l.rb == null ? "" : ed ? dIn : pct(l.disc);
      // на телефоне колонки цены и скидки скрыты — у сотрудника те же поля под названием (06.11.2026)
      const mob = ed && (own || l.rb != null) ? `<div class="m-only ed-m">${own ? `<label>цена ${bIn}</label>` : ""}${l.rb != null ? `<label>скидка, % ${dIn}</label>` : ""}</div>` : "";
      const name = own ? (ed ? `<input class="x-n" data-x="${l.i}" data-f="n" value="${esc(l.n)}" placeholder="Название, например: монтаж и настройка" maxlength="200" aria-label="Название"${l.i === NONAME ? ' aria-invalid="true"' : ""}> <input class="x-u" data-x="${l.i}" data-f="u" value="${esc(l.u || "шт.")}" maxlength="20" aria-label="Единица">${mob}`
          : `${esc(l.n)}<br><span class="muted small">${esc(l.u || "шт.")}</span>`)
        : `<a href="${esc(l.it.u)}">${esc(l.n)}</a><br><span class="muted small">${esc(l.a)}</span>${isNew ? ' <span class="from-cat-t">добавлено из каталога</span>' : ""}${mob}`;
      const qty = own ? (ed ? `<input class="x-q" type="number" min="1" value="${l.q}" data-x="${l.i}" data-f="q" aria-label="Количество">` : `${l.q}`)
        : `<div class="qty"><button type="button" data-d="-1" data-a="${k}" aria-label="Меньше">−</button><input type="number" min="1" value="${l.q}" data-set="${k}" aria-label="Количество"><button type="button" data-d="1" data-a="${k}" aria-label="Больше">+</button></div>`;
      const price = own && ed ? bIn : money(l.rb);
      return `<tr${own ? ' class="own"' : isNew ? ' class="from-cat"' : ""}><td class="hide-m">${!own && l.it.t ? `<img src="${esc(l.it.t)}" alt="">` : ""}</td><td>${name}</td><td>${qty}</td><td class="num hide-m">${price}</td>`
        + (showD ? `<td class="num hide-m">${dcell}</td><td class="num off">${l.t != null && l.off ? "−" + fmt(l.off) + " BYN" : ""}</td>` : "")
        + `<td class="num">${money(l.t)}</td><td class="no-print">${own ? (ed ? `<button class="rm" type="button" data-xrm="${l.i}" aria-label="Убрать">×</button>` : "") : `<button class="rm" type="button" data-rm="${k}" aria-label="Убрать">×</button>`}</td></tr>`;
    }).join("");
    const span = showD ? 5 : 3, note = ask ? `<br><span class="muted small">без ${ask} поз. по запросу</span>` : "";
    const foot = (anyD ? `<tr class="sub"><td class="hide-m"></td><td colspan="${span}">Сумма без скидки</td><td class="num">${fmt(full)} BYN</td><td class="no-print"></td></tr>`
      + `<tr class="sub"><td class="hide-m"></td><td colspan="${span}">Скидка${one ? " " + pct(one) : ""}</td><td class="num off">−${fmt(full - sum)} BYN</td><td class="no-print"></td></tr>` : "")
      + `<tr><td class="hide-m"></td><td colspan="${span}">Итого с НДС${anyD ? " со скидкой" : ""}${note}</td><td class="num">${fmt(sum)} BYN</td><td class="no-print"></td></tr>`;
    box.innerHTML = `<table class="smeta-tbl${showD ? " with-disc" : ""}"><thead><tr><th class="hide-m"></th><th>Позиция</th><th>Кол-во</th><th class="num hide-m">Цена</th>`
      + (showD ? '<th class="num hide-m">Скидка, %</th><th class="num">Скидка</th>' : "")
      + `<th class="num">Сумма</th><th class="no-print"></th></tr></thead>
      <tbody>${tr}</tbody><tfoot>${foot}</tfoot></table>
      <p class="muted small">Цены по курсу НБРБ ${String(D.rate).replace(".", ",")} на ${D.rateDate.split("-").reverse().join(".")}${anyD ? `; «Цена» — розничная, скидка${one ? " " + pct(one) : " по строкам"} от неё` : ""}.${(m.extra || []).length ? "" : " Монтаж и настройка считаем отдельно."}</p>`;
    onRender();
  };
  if (box) {
    $("[data-today]").textContent = new Date().toLocaleDateString("ru-RU");
    // поиск артикула: без знаков; артикул без цвета — первый цвет из прайса
    const keyOf = {}; Object.keys(D.items).forEach(a => { keyOf[low(a).replace(/[^a-z0-9а-я]/g, "")] = a; });
    // цвет одной цифрой; пластик, если в прайсе один артикул на два материала; окончание, которого нет в прайсе (-06, -46), если такая карточка одна: EU и US не угадываем
    const findArt = s => {
      const c = low(s).replace(/[^a-z0-9а-я]/g, ""), near = Object.keys(keyOf).filter(k => k.startsWith(c));
      const tail = near.filter(k => /^\d\d$/.test(k.slice(c.length)));
      return keyOf[c] || keyOf[near.find(k => k.length === c.length + 1)] || keyOf[c + "пластик"] || (tail.length === 1 ? keyOf[tail[0]] : undefined);
    };
    const sp = new URLSearchParams(location.search), shared = sp.get("s"), sharedDoc = sp.get("d") || "";
    // название документа: сотрудник выбирает из общего списка («Коммерческое предложение», «Заказ покупателя»…) и может его пополнять,
    // клиенту оно приходит со сметой (владелец 05.11.2026). Заголовок на экране и в печати, с датой — имя файла PDF. Показываем только
    // название из списка: ссылку с придуманным заголовком («Счёт на оплату») сайт не примет. Список — в DOCS (наверху файла)
    const docBox = $("[data-doc]"), docH = $("[data-doc-h]"), title0 = document.title, staffMe = !!(ME && ME.role === "staff");
    const docShow = () => {
      const c = DOCS && DOCS.some(x => x.title === docGet()) ? docGet() : DOC0;
      docH.textContent = c;
      document.title = c === DOC0 ? title0 : `${c} от ${new Date().toLocaleDateString("ru-RU")}`;
      if (staffMe && DOCS) drawDocs(c);
      onRender();
      return c;
    };
    const drawDocs = c => {
      const one = DOCS.find(x => x.title === c);
      docBox.innerHTML = `<label>Название документа <select data-doc-sel>${[DOC0, ...DOCS.map(x => x.title)].map(t => `<option value="${esc(t)}"${t === c ? " selected" : ""}>${esc(t)}</option>`).join("")}<option value="+">+ Новое название…</option></select></label>`
        + (one ? ` <button class="cbtn ghost" type="button" data-doc-del="${one.id}">Убрать из списка</button>` : "")
        + '<span class="doc-new" data-doc-new hidden><input maxlength="80" placeholder="Например: Спецификация к договору" data-doc-in aria-label="Новое название"> <button class="cbtn" type="button" data-doc-add>Добавить</button></span><span class="msg small" data-doc-msg role="status"></span>';
      docBox.hidden = false;
    };
    const docSend = async (a, body) => {
      const r = await kabApi(a, body).catch(() => ({}));
      if (r.ok) { DOCS = r.titles; return true; }
      const m = $("[data-doc-msg]", docBox);
      m.className = "msg small bad"; m.textContent = r.status === 403 ? "Нужен вход сотрудника." : "Не удалось сохранить.";
      return false;
    };
    if (staffMe || sharedDoc || docGet() !== DOC0) kabApi("doc_titles").then(j => { if (j.ok) { DOCS = j.titles; docShow(); } }).catch(() => {});

    let askBox = null;  // окно «есть несохранённые изменения» (ниже)
    // ---- другая вкладка (06.11.2026): документ, который правит эта вкладка, помечен меткой k. Открыли в другой вкладке другой документ —
    // эта вкладка устарела: ничего не пишет и предлагает открыть текущий. Иначе её «Сохранить» записывало чужой список не туда ----
    K0 = (smGet() || {}).k || "";
    const stale = () => ((smGet() || {}).k || "") !== K0;
    let myBack = "";  // куда возвращаться из этой вкладки — запоминается при каждой отрисовке полосы
    const lockStale = () => {
      const note = $("[data-stale]"), m = smGet();
      [box, $("[data-sm-staff]"), $("[data-sm-edit]"), $("[data-ed-strip]"), $("[data-smeta-tools]"), $("[data-smeta-form]"), $("[data-smeta-hints]"), $("[data-for-box]"), docBox].forEach(el => { if (el) el.inert = true; });
      [$("[data-sm-edit]"), $("[data-ed-strip]"), $("[data-ed-bottom]")].forEach(el => { if (el) el.hidden = true; });  // мёртвые кнопки не показываем
      document.body.classList.add("stale"); document.body.classList.remove("editing"); document.documentElement.classList.remove("editing");
      if (askBox?.open) askBox.close();
      if (!note) return true;
      note.innerHTML = staleDone + `В другой вкладке открыт другой документ${m && m.edit && STAFF ? ": правка " + esc(edName(m)) : ""}. Эта вкладка устарела и ничего не сохранит.`
        + ` <button class="cbtn" type="button" data-stale-reload>Открыть текущий</button>${myBack ? ` <a class="cbtn ghost" href="${esc(myBack)}">К клиенту</a>` : ""}`;
      note.hidden = false;
      note.scrollIntoView({ block: "center" });
      return true;
    };
    const guard = () => stale() && lockStale();
    $("[data-stale]")?.addEventListener("click", ev => { if (ev.target.closest("[data-stale-reload]")) location.reload(); });

    // открыта ссылка на чужую смету: ?s=артикул*количество,…&d=название документа
    if (shared) {
      const got = {};
      shared.split(",").forEach(x => { const [a, q] = x.split("*"); if (D.items[a] || D.items[a.split(" · ")[0]]) got[a] = Math.max(1, +q || 1); });
      const n = Object.keys(got).length, shareBox = $("[data-smeta-share]");
      history.replaceState(null, "", location.pathname);
      if (n && !Object.keys(load()).length && !editing()) { save(got); docSet(sharedDoc); smSet(null); K0 = ""; shareBox.textContent = `Смета открыта по ссылке: ${n} поз.`; shareBox.hidden = false; }
      else if (n) {
        shareBox.innerHTML = `По ссылке передана смета: ${n} поз. <button class="cbtn" type="button" data-share="replace">Заменить мой список</button> <button class="cbtn ghost" type="button" data-share="add">Добавить к моему</button>`;
        shareBox.hidden = false;
        shareBox.addEventListener("click", ev => {
          const m = ev.target.dataset.share; if (!m || guard()) return;
          if (m === "replace" && editing() && !confirm(`Сейчас открыта правка ${edName(smGet())}. Закрыть её и заменить список?`)) return;
          const s = m === "add" ? load() : {};
          Object.entries(got).forEach(([a, q]) => { s[a] = (s[a] || 0) + q; });
          if (m === "replace") { docSet(sharedDoc); smSet(null); K0 = ""; docShow(); drawEdit(); }
          save(s); shareBox.hidden = true; renderSmeta();
        });
      }
    }
    renderSmeta();
    box.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b || b.dataset.xrm != null) return;
      if (guard()) return;
      const s = load();
      if (b.dataset.rm) {
        delete s[b.dataset.rm];
        const m = smGet();
        if (STAFF && m && b.dataset.rm in m.ld) { delete m.ld[b.dataset.rm]; smSet(m); }
      }
      if (b.dataset.d) s[b.dataset.a] = Math.max(1, (s[b.dataset.a] || 1) + +b.dataset.d);
      save(s); renderSmeta();
    });
    box.addEventListener("change", ev => {
      const i = ev.target.closest("[data-set]"); if (!i) return;
      if (guard()) return;
      const s = load(); s[i.dataset.set] = Math.max(1, Math.round(+i.value) || 1); save(s); renderSmeta();
    });
    $("[data-smeta-hints]").addEventListener("click", ev => {
      const b = ev.target.closest("[data-hint-add]"); if (!b || guard()) return;
      const s = load(); s[b.dataset.hintAdd] = (s[b.dataset.hintAdd] || 0) + (+b.dataset.q || 1); save(s); renderSmeta();
    });
    // печать, ссылка, текст; ms — сколько висит сообщение (предупреждение про ссылку — дольше)
    const tmsg = $("[data-tools-msg]");
    const copy = async (text, ok, ms = 3000) => {
      try { await navigator.clipboard.writeText(text); tmsg.textContent = ok; } catch { window.prompt(ok + "\n\nСкопируйте:", text); }
      setTimeout(() => { tmsg.textContent = ""; }, ms);
    };
    $("[data-print]").addEventListener("click", () => window.print());
    addEventListener("beforeprint", () => { PRINT = true; renderSmeta(); });
    addEventListener("afterprint", () => { PRINT = false; renderSmeta(); });
    // сотрудник (владелец 05.11.2026: «Скидку ручную не добавил. Добавить товары тоже нету»): общая скидка на всю смету, свой процент в строке,
    // «Добавить» из каталога прямо здесь и свои строки — то, чего нет в каталоге. Хранится в hdl-sm вместе со скидкой сметы
    const stBox = $("[data-sm-staff]");
    if (stBox && staffMe) {
      stBox.hidden = false;
      const dIn = $("[data-sm-d]", stBox), hitsEl = $("[data-sm-hits]", stBox);
      const mset = f => { if (guard()) return; const m = smGet() || {}; f(m); smSet(m); renderSmeta(); };
      const num = v => { v = String(v).trim().replace(",", "."); return v === "" || isNaN(+v) ? null : +v; };
      dIn.value = (smGet() || {}).d ?? "";
      const pc = v => Math.round(Math.max(0, Math.min(50, v)) * 10) / 10;  // процент — до 0,1, как хранит сервер
      dIn.addEventListener("input", () => mset(m => { const v = num(dIn.value); if (v == null) delete m.d; else m.d = pc(v); }));
      stBox.addEventListener("input", ev => {
        if (!ev.target.closest("[data-sm-q]")) return;
        const q = low(ev.target.value.trim()), qa = q.replace(/[^a-z0-9а-я]/g, "");
        const found = q.length < 2 ? [] : Object.entries(D.items).filter(([a, it]) => low(a).replace(/[^a-z0-9а-я]/g, "").includes(qa) || low(it.n).includes(q)).slice(0, 12);
        hitsEl.innerHTML = found.map(([a, it]) => `<li><span><b>${esc(a)}</b> ${esc(it.n)} · ${(it.rb ?? it.b) != null ? fmt(it.rb ?? it.b) + " BYN" : "по запросу"}</span> <button class="cbtn" type="button" data-sm-add="${esc(a)}">Добавить</button></li>`).join("")
          || (q.length >= 2 ? '<li class="muted">В каталоге не нашлось — добавьте своей строкой.</li>' : "");
      });
      stBox.addEventListener("click", ev => {
        const ca = ev.target.closest("[data-sm-cat]");
        if (ca) {
          const m = smGet();
          if (!editing() || guard()) return;  // без правки — обычная ссылка на каталог
          ev.preventDefault();
          if (!m.cat0) m.cat0 = load();  // повторный заход в каталог до сохранения — подсветка с первого раза
          smSet(m);
          location.href = m.catAt || "/katalog/";
          return;
        }
        const ad = ev.target.closest("[data-sm-add]");
        if (ad) { if (guard()) return; const s = load(); s[ad.dataset.smAdd] = (s[ad.dataset.smAdd] || 0) + 1; save(s); renderSmeta(); ad.textContent = `Добавлено: ${s[ad.dataset.smAdd]} шт.`; }
        if (ev.target.closest("[data-sm-own]")) {
          mset(m => { (m.extra = m.extra || []).push({ n: "", u: "шт.", q: 1, b: null }); });
          const ins = $$(".own .x-n", box); ins[ins.length - 1]?.focus();
        }
        // личная скидка клиента поменялась после заявки — пересчитать по сегодняшней
        if (ev.target.closest("[data-ud-now]")) mset(m => { m.ud = +m.udNow || 0; });
      });
      // правки в таблице — по «change»: таблица перерисовывается, а при наборе курсор не прыгает
      box.addEventListener("change", ev => {
        const ld = ev.target.closest("[data-ld]"), x = ev.target.closest("[data-x]");
        if (ld) mset(m => { m.ld = obj(m.ld); const v = num(ld.value); if (v == null) delete m.ld[ld.dataset.ld]; else m.ld[ld.dataset.ld] = pc(v); });
        if (x) mset(m => {
          const r = (m.extra || [])[+x.dataset.x], f = x.dataset.f;
          if (!r) return;
          if (f === "n" || f === "u") { r[f] = x.value.trim(); if (f === "n" && r.n && +x.dataset.x === NONAME) NONAME = -1; }
          else if (f === "q") r.q = Math.max(1, Math.round(num(x.value) || 1));
          else { const v = num(x.value); r[f] = v == null ? null : f === "d" ? pc(v) : Math.round(Math.max(0, v) * 100) / 100; }
        });
      });
      box.addEventListener("click", ev => {
        const xr = ev.target.closest("[data-xrm]");
        if (xr) mset(m => { (m.extra || []).splice(+xr.dataset.xrm, 1); if (+xr.dataset.xrm === NONAME) NONAME = -1; else if (+xr.dataset.xrm < NONAME) NONAME--; });
      });
    }

    // ---- правка заявки или сметы из кабинета (сотрудник; владелец 06.11.2026: «При сохранении нет кнопки вернуться к клиентам…
    // Личные кабинеты должны быть гибкие в редактировании»). Сверху — закреплённая строка: «← клиент», что открыто, сохранено ли, кнопки
    // (на телефоне — внизу экрана). Ниже — розовая полоса: клиент, состояние, комментарий, заметка для своих, название сметы, Telegram,
    // «Сделать копией», «PDF для клиента». Практика: путь назад к родительской странице всегда виден (GOV.UK Back link, Shopify Polaris),
    // главная кнопка — «Сохранить и вернуться» (1С «Записать и закрыть»), «сохранено / есть несохранённые изменения» и вопрос при выходе —
    // только когда есть что терять (Polaris contextual save bar, NN/g); после возврата итог виден на карточке клиента ----
    const edBox = $("[data-sm-edit]"), edStrip = $("[data-ed-strip]");
    const ST_L = { new: "Новая", work: "В работе", kp: "КП отправлено", closed: "Закрыта" };
    const backTo = m => "/kabinet/#" + (m.uid ? "p=u" + m.uid : m.ph && m.ph.replace(/\D/g, "").length >= 7 ? "p=t" + m.ph.replace(/\D/g, "").slice(-9) : m.edit === "s" || m.edit === "ns" ? "smetas" : "leads");
    const backOf = m => m.back || backTo(m);
    const backLabel = m => m.who || m.ph || (m.edit === "s" || m.edit === "ns" ? "Сметы" : "Заявки");
    const hhmm = () => new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const isNewK = k => k === "ns" || k === "nl";
    // выйти из правки: список и правка очищаются (документ уже на сервере), страница сметы не остаётся в истории
    const leave = (m, flash) => {
      if (flash) try { sessionStorage.setItem("hdl-flash", JSON.stringify(flash)); } catch {}
      const b = backOf(m || {});
      if (!stale()) { save({}); docSet(""); smSet(null); K0 = ""; }  // устаревшая вкладка общий список не трогает: там уже другой документ
      location.replace(b);
    };
    // строка сверху: состояние и кнопки — по подписи документа (сохранено ли)
    const drawState = () => {
      if (!edStrip || edStrip.hidden) return;
      const m = smGet() || {}, kind = m.edit, nw = isNewK(kind), d = dirty(m);
      const st = $("[data-ed-state]", edStrip), bt = $("[data-ed-btns]", edStrip);
      if (!st || !bt) return;
      let diff = "";  // заявка: цены изменились после прошлого сохранения — у клиента одна сумма, по сегодняшним ценам другая
      if (kind === "l" && !d && m.total != null && m.had) {
        const now = Math.round(leadRows(m).reduce((t, r) => t + (r.b != null ? r.b * r.q : 0), 0) * 100) / 100;
        if (Math.abs(now - +m.total) >= 0.005) diff = ` · у клиента ${fmt(+m.total)} BYN, по сегодняшним ценам ${fmt(now)} BYN`;
      }
      const cls = "ed-state " + (nw ? "new" : d ? "dirty" : "clean");
      const text = nw ? (kind === "nl" ? "● Заявка ещё не создана" : "● Смета ещё не создана") : d ? "● Есть несохранённые изменения" : "✓ Всё сохранено" + (m.savedAt ? " в " + m.savedAt : "") + diff;
      // кнопки видны всегда (владелец 07.11.2026): нечего сохранять — «Сохранить» серая; «Передать…» (смета) и «PDF» — рядом
      const opt = (kind === "s" ? '<button class="btn ghost ed-opt" type="button" data-ed-move-go>Передать…</button>' : "") + '<button class="btn ghost ed-opt" type="button" data-ed-print>PDF</button>';
      const btns = nw ? `<button class="btn" type="button" data-ed-save data-ret>Создать и вернуться</button><button class="btn ghost" type="button" data-ed-save>Создать</button>${opt}`
        : d ? `<button class="btn" type="button" data-ed-save data-ret>Сохранить и вернуться</button><button class="btn ghost" type="button" data-ed-save>Сохранить</button>${opt}`
          : (diff ? '<button class="btn ghost" type="button" data-ed-save>Сохранить по сегодняшним ценам</button>' : '<button class="btn ghost off" type="button" disabled title="Всё сохранено — менять нечего">Сохранить</button>')
            + `${opt}<button class="btn" type="button" data-ed-back>Вернуться к клиенту</button>`;
      if (st.className !== cls || st.textContent !== text) { st.className = cls; st.textContent = text; }
      if (bt.dataset.k !== btns) { bt.dataset.k = btns; bt.innerHTML = btns; }
      const bot = $("[data-ed-bottom]");  // те же кнопки под таблицей — не прокручивать наверх
      if (bot) { bot.hidden = false; if (bot.dataset.k !== btns) { bot.dataset.k = btns; bot.innerHTML = `<span class="${cls}">${esc(text)}</span><span class="ed-btns">${btns}</span>`; } else $("span", bot).textContent = text; }
      count();
    };
    const drawEdit = () => {
      const m = smGet() || {}, on = editing() && !stale();
      if (edBox) edBox.hidden = !on;
      if (edStrip) edStrip.hidden = !on;
      if (!on && $("[data-ed-bottom]")) $("[data-ed-bottom]").hidden = true;
      document.body.classList.toggle("editing", on);
      document.documentElement.classList.toggle("editing", on);
      if (!on || !edBox || !edStrip) return;
      myBack = backOf(m);
      const kind = m.edit, nw = isNewK(kind), lead = kind === "l" || kind === "nl", anon = lead && !m.uid;
      const head = { l: "Заявка №" + esc(m.lid), s: "Смета «" + esc(m.title || "") + "»", ns: "Новая смета", nl: "Новая заявка" }[kind] || "Правка";
      edStrip.innerHTML = `<a class="ed-back" href="${esc(myBack)}" data-ed-back>← ${esc(backLabel(m))}</a><b class="ed-head">${head}${m.from ? ` <span class="muted small">(копия ${esc(m.from)})</span>` : ""}</b>`
        + '<span class="ed-state" data-ed-state></span><span class="ed-btns" data-ed-btns></span><p class="msg" data-ed-msg role="status"></p>';
      edBox.innerHTML = (anon ? `<p class="ed-who">Клиент: <input data-ed-name maxlength="120" placeholder="Имя" value="${esc(m.who || "")}" aria-label="Имя"> <input data-ed-phone maxlength="40" placeholder="Телефон *" value="${esc(m.ph || "")}" aria-label="Телефон"></p>`
          : m.who ? `<p class="ed-who">Клиент: <b>${esc(m.who)}</b></p>` : "")
        + (kind === "s" || kind === "ns" ? `<p><label class="ed-title">Название сметы <input data-ed-title maxlength="120" placeholder="Например: квартира, ул. Притыцкого" value="${esc(m.title || "")}"></label></p>` : "")
        + (kind === "l" ? `<p class="ed-row"><label>Состояние <select data-ed-st>${Object.entries(ST_L).map(([k, t]) => `<option value="${k}"${k === m.status ? " selected" : ""}>${t}</option>`).join("")}</select></label> <span class="msg small" data-ed-stmsg role="status"></span></p>` : "")
        + (lead && m.cm ? `<p class="small">Комментарий клиента: ${esc(m.cm)}</p>` : "")
        + (lead ? `<label class="ed-note">Заметка для своих <span class="muted small">— клиент её не видит</span><textarea data-ed-note rows="2" maxlength="1000" placeholder="Например: перезвонить в пятницу, монтаж после 15-го">${esc(m.nt || "")}</textarea></label>` : "")
        + `<p class="muted small">${nw ? "Добавьте позиции из каталога или своей строкой, затем «Создать»." : "Меняйте количество, позиции, скидки и свои строки, затем «Сохранить»."} Цены — по сегодняшнему каталогу и курсу. `
        + (m.uid || kind === "s" ? `Клиент увидит ${nw ? "документ" : "изменения"} в своём кабинете.` : "У человека нет кабинета на сайте: пошлите ему PDF (кнопка «PDF для клиента»). По ссылке скидки и свои строки не передаются.") + "</p>"
        + `<div class="ed-acts">${m.wtg ? `<label class="consent"><input type="checkbox" data-ed-tg${m.tg === true ? " checked" : ""}> Сообщить в Telegram</label>` : ""}`
        + (!nw ? `<button class="cbtn ghost" type="button" data-ed-copy="l">Сделать копией: новая заявка</button>${m.uid ? '<button class="cbtn ghost" type="button" data-ed-copy="s">Сделать копией: новая смета</button>' : ""}` : "")
        + (!m.uid ? '<button class="cbtn ghost" type="button" data-ed-pdf>PDF для клиента</button>' : "")
        + (kind === "s" ? '<button class="cbtn" type="button" data-ed-move>Передать другому человеку…</button>' : "") + "</div>"
        + '<div class="ed-move" data-ed-mv hidden></div>';
      drawState();
    };
    // уход с несохранённым: окно с тремя выходами (NN/g: подтверждение — только при реальной потере). Без <dialog> — обычный вопрос браузера
    const askLeave = m => new Promise(res => {
      const nw = isNewK(m.edit), text = nw ? `${m.edit === "nl" ? "Новая заявка" : "Новая смета"}${m.who ? " для " + m.who : ""} не создана.` : `В ${edName(m).replace(/^заявки/, "заявке").replace(/^сметы/, "смете")} есть несохранённые изменения.`;
      if (!window.HTMLDialogElement) return res(confirm(text + " Выйти без сохранения?") ? "drop" : "stay");
      if (!askBox) {
        askBox = document.createElement("dialog");
        askBox.className = "ed-ask";
        document.body.appendChild(askBox);
      }
      askBox.innerHTML = `<p>${esc(text)}</p><div class="ed-ask-btns"><button class="btn" type="button" data-a="save">${nw ? "Создать и выйти" : "Сохранить и выйти"}</button>`
        + `<button class="btn ghost" type="button" data-a="drop">${nw ? "Удалить черновик" : "Выйти без сохранения"}</button><button class="btn ghost" type="button" data-a="stay">Остаться</button></div>`;
      const done = a => { askBox.close(); res(a); };
      askBox.onclick = ev => { const b = ev.target.closest("[data-a]"); if (b) done(b.dataset.a); };
      askBox.oncancel = ev => { ev.preventDefault(); done("stay"); };
      askBox.showModal();
      $("[data-a=stay]", askBox).focus();
    });
    let saving = false;
    // сохранить документ; ret — сразу вернуться к клиенту; force — «Сохранить поверх», когда документ тем временем изменил другой
    const saveDoc = async (ret, force) => {
      if (saving || guard()) return;
      const m = smGet() || {}, kind = m.edit, msg = $("[data-ed-msg]", edStrip);
      const say = (t, cls) => { msg.className = "msg " + (cls || ""); msg.textContent = t; };
      const L0 = load(), empty = !Object.keys(L0).length && !(m.extra || []).length;
      if (empty && !(kind === "l" && !m.had)) return say(kind === "l" ? "Список пуст — сохранять нечего. Заявку можно закрыть: состояние «Закрыта»." : "Список пуст — добавьте позиции.", "bad");
      const ni = ownNoName(m);
      if (ni >= 0) { NONAME = ni; renderSmeta(); const f = $(`.x-n[data-x="${ni}"]`, box); f?.scrollIntoView({ block: "center" }); f?.focus({ preventScroll: true }); return say("У своей строки нет названия — впишите его или уберите строку (×).", "bad"); }
      if (kind === "nl" && !m.uid && (String(m.ph || "").match(/\d/g) || []).length < 7) { $("[data-ed-phone]", edBox)?.focus(); return say("Укажите телефон.", "bad"); }
      const tg = !!$("[data-ed-tg]", edBox)?.checked, doc = docNow(), rows = leadRows(m);  // строки — по тому же снимку, что и состав
      const base = { items: L0, ld: obj(m.ld), extra: m.extra || [], doc, notify: tg };
      saving = true; $$("[data-ed-save]").forEach(b => { b.disabled = true; }); say("Сохраняем…");
      let r = {}, metaOnly = false;
      try {
        if (kind === "l") {
          // заметка, имя и телефон — только если их меняли. Поменялись только они — состав и цены не трогаем: заявка не пересчитывается
          // по сегодняшним ценам, клиенту не пишем (06.11.2026). Иначе — одним сохранением с составом, под одной проверкой версии
          const meta = {};
          if ((m.nt || "") !== (m.nt0 || "")) meta.note = m.nt || "";
          if (!m.uid && ((m.who || "") !== (m.who0 || "") || (m.ph || "") !== (m.ph0 || ""))) { meta.name = m.who || ""; meta.phone = m.ph || ""; }
          const comp = sig({ ...m, nt: m.nt0, who: m.who0, ph: m.ph0 }, L0) !== m.saved;  // менялся ли сам состав
          if (!empty && (comp || !Object.keys(meta).length)) r = await kabApi("lead_save", { ...base, ...meta, id: m.lid, d: m.d ?? null, ud: m.ud ?? null, rows, v: m.v, force: force ? 1 : 0 }).catch(() => ({}));
          else if (Object.keys(meta).length) { r = await kabApi("lead_meta", { id: m.lid, ...meta, v: m.v, force: force ? 1 : 0 }).catch(() => ({})); metaOnly = true; }
          else { r = { ok: true, same: true, total: null }; metaOnly = true; }
        } else if (kind === "s") r = await kabApi("smeta_upd", { ...base, id: m.id, disc: m.d ?? null, title: m.title || "", v: m.v, force: force ? 1 : 0 }).catch(() => ({}));
        else if (kind === "nl") r = await kabApi("lead_new", { ...base, user_id: m.uid || 0, name: m.who || "", phone: m.ph || "", d: m.d ?? null, ud: m.ud ?? null, note: m.nt || "", rows }).catch(() => ({}));
        else r = await kabApi("smeta_for", { ...base, user_id: m.uid, title: m.title || "", disc: m.d ?? null, id: 0 }).catch(() => ({}));  // пустая скидка — личная скидка клиента
      } catch {}
      saving = false; $$("[data-ed-save]").forEach(b => { b.disabled = false; });
      if (stale()) {  // пока сохраняли, в другой вкладке открыли другой документ — эта вкладка его не трогает, но итог сохранения говорит
        if (r.ok && !r.same) staleDone = `<b>${kind === "l" || kind === "nl" ? "Заявка" : "Смета"} сохранена в ${hhmm()}.</b> `;
        lockStale();
        return;
      }
      if (r.status === 409) {
        const at = r.at ? r.at.slice(11, 16) : "";
        msg.className = "msg bad";
        msg.innerHTML = `${kind === "l" ? "Заявку №" + esc(m.lid) : "Смету"} уже изменил(а) ${esc(r.by || "другой сотрудник")}${at ? " в " + at : ""}. ${metaOnly ? "Ваша заметка не сохранена." : "Ваши правки не сохранены."} `
          + `<button class="cbtn" type="button" data-ed-force>${metaOnly ? "Сохранить заметку поверх" : "Сохранить поверх"}</button> <a class="cbtn ghost" href="${esc(backOf(m))}" data-ed-back data-drop>К клиенту — открыть свежую</a>`;
        return;
      }
      if (!r.ok) return say(r.error === "empty" ? "Список пуст — сохранять нечего." : r.error === "phone" ? "Укажите телефон: не меньше 7 цифр." : r.error === "limit" ? "У человека уже 100 смет — пусть удалит старые."
        : r.status === 403 ? "Нужен вход сотрудника." : r.status === 404 ? "Не нашли: возможно, удалили или заблокировали." : "Не удалось сохранить. Проверьте связь и нажмите ещё раз.", "bad");
      // подпись сохранённого — по состоянию на момент нажатия: правки, сделанные пока шло сохранение, остаются несохранёнными
      const cur = smGet() || m, next = { ...cur };
      delete next.cat0;  // сохранили — «добавлено из каталога» больше не подсвечиваем
      if (kind === "nl") Object.assign(next, { edit: "l", lid: r.id, title: `Заявка №${r.id}`, status: "work", had: !empty });
      if (kind === "ns") Object.assign(next, { edit: "s", id: r.id, title: r.title, d: r.disc ?? null });
      if (kind === "s" && r.title) next.title = r.title;
      if (kind === "l" || kind === "nl") Object.assign(next, { nt0: m.nt || "", who0: m.who || "", ph0: m.ph || "" });
      if (kind === "l" && !metaOnly) next.had = true;  // состав сохранён на сервере — пустой список дальше «сохранить» нельзя
      if (r.total != null && !metaOnly) next.total = r.total;
      if (r.ver != null) next.v = r.ver;
      if (!next.uid && next.ph && (!/#p=/.test(next.back || "") || (m.ph || "") !== (m.ph0 || ""))) next.back = backTo(next);  // без кабинета — в карточку по (новому) телефону
      const sigM = { ...m, edit: next.edit, title: next.title, d: kind === "ns" ? next.d : m.d };
      next.saved = sig(sigM, L0);
      next.savedAt = hhmm();
      const notified = tg && !metaOnly && !r.same;  // заметка, имя и телефон клиенту не отправляются
      if (notified) next.tg = false;  // сообщили — галочку снимаем, чтобы не писать клиенту при каждом сохранении
      smSet(next);
      const what = kind === "nl" ? `Заявка №${r.id} создана` : kind === "ns" ? `Смета «${r.title}» создана` : kind === "l" ? `Заявка №${m.lid} сохранена` : `Смета «${next.title}» сохранена`;
      const text = r.same ? "Изменений нет — сохранять нечего." : `${what} в ${next.savedAt}.` + (notified ? (r.sent ? " Клиенту ушло сообщение в Telegram." : " Сообщение в Telegram не ушло: человек не разрешил боту писать — сообщите сами.") : "");
      if (force && kind === "l") return leave(next, { text: text + (metaOnly ? " Состав заявки тем временем менял коллега — откройте её заново, чтобы увидеть." : " Сохранено поверх правки коллеги."), lid: next.lid });
      if (ret) return leave(next, { text, lid: next.edit === "l" ? next.lid : 0, sid: next.edit === "s" ? next.id : 0 });
      drawEdit(); renderSmeta();
      const m2 = $("[data-ed-msg]", edStrip);
      if (m2) { m2.className = "msg " + (r.same ? "" : "ok"); m2.textContent = text; }
    };
    if (edBox && edStrip && staffMe) {
      onRender = drawState;
      drawEdit();
      const stripClick = async ev => {
        if (ev.target.closest("[data-ed-print]")) return window.print();
        if (ev.target.closest("[data-ed-move-go]")) {  // «Передать…» — открыть выбор человека в блоке правки
          const mv = $("[data-ed-move]", edBox), box = $("[data-ed-mv]", edBox);
          if (mv && box && box.hidden) mv.click();
          (box || mv)?.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
        const bk = ev.target.closest("[data-ed-back]");
        if (bk) {
          if (bk.tagName === "A" && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1)) return;  // в новой вкладке — как обычная ссылка
          ev.preventDefault();
          const m = smGet() || {};
          if (stale() || !m.edit) { location.href = myBack || "/kabinet/"; return; }
          if (!dirty(m) || bk.hasAttribute("data-drop")) return leave(m);  // после «уже изменил другой» — уйти и открыть свежую версию
          const a = await askLeave(m);
          if (stale()) return lockStale();  // пока окно было открыто, в другой вкладке открыли другой документ
          if (a === "save") saveDoc(true); else if (a === "drop") leave(m);
          return;
        }
        if (ev.target.closest("[data-ed-force]")) return saveDoc(false, true);
        const sv = ev.target.closest("[data-ed-save]");
        if (sv) saveDoc(sv.hasAttribute("data-ret"));
      };
      edStrip.addEventListener("click", stripClick);
      $("[data-ed-bottom]")?.addEventListener("click", stripClick);
      // имя, телефон, название, заметка — сразу в память: не пропадут при переходе в каталог за позициями
      edBox.addEventListener("input", ev => {
        const f = { "data-ed-name": "who", "data-ed-phone": "ph", "data-ed-title": "title", "data-ed-note": "nt" };
        const key = Object.keys(f).find(a => ev.target.hasAttribute(a));
        if (!key || guard()) return;
        const m = smGet() || {}; m[f[key]] = ev.target.value; smSet(m); drawState();
      });
      edBox.addEventListener("change", async ev => {
        const s = ev.target.closest("[data-ed-st]"), t = ev.target.closest("[data-ed-tg]");
        if (t) { const m = smGet() || {}; m.tg = t.checked; smSet(m); }
        if (!s || guard()) return;
        // состояние заявки сохраняется сразу, как в списке заявок
        const m = smGet() || {}, out = $("[data-ed-stmsg]", edBox);
        const r = await kabApi("lead_status", { id: m.lid, status: s.value }).catch(() => ({}));
        const cur = smGet();
        if (r.ok && cur && (cur.k || "") === K0 && cur.edit === "l" && +cur.lid === +m.lid) smSet({ ...cur, status: s.value });
        if (r.ok) { out.className = "msg small ok"; out.textContent = "✓ сохранено"; }
        else { out.className = "msg small bad"; out.textContent = "не сохранилось"; s.value = m.status || "new"; }
      });
      // передать смету другому человеку (владелец 06.11.2026): выбор из кабинета поиском по имени, телефону, компании; смета уходит целиком,
      // несохранённые изменения — вместе с ней (smeta_upd с to)
      let mvPeople = null, mvPick = null;
      const mvBox = () => $("[data-ed-mv]", edBox);
      const mvList = () => {
        const q = low(String($("[data-mv-q]", edBox)?.value || "").trim()), qd = q.replace(/\D/g, ""), m = smGet() || {};
        const nm = u => u.name || u.tg_name || "—";
        const hit = (mvPeople || []).filter(u => +u.id !== +m.uid && (!q || low(nm(u) + " " + (u.tg_name || "") + " " + (u.company || "") + " " + (u.tg_username || "")).includes(q)
          || (qd.length >= 3 && String(u.phone || "").replace(/\D/g, "").includes(qd)))).slice(0, 8);
        $("[data-mv-res]", edBox).innerHTML = hit.map(u => `<button type="button" class="mv-hit${mvPick && +mvPick.id === +u.id ? " on" : ""}" data-mv-id="${u.id}"><b>${esc(nm(u))}</b> <span class="muted small">${[esc(u.phone || ""), esc(u.company || ""), esc(({ user: "пользователь", client: "клиент", dealer: "дилер", staff: "сотрудник" })[u.role] || "")].filter(Boolean).join(" · ")}${+u.discount ? " · скидка " + pct(+u.discount) : ""}</span></button>`).join("")
          || '<p class="muted small">Никого не нашли. Передать можно только тому, у кого есть кабинет на сайте.</p>';
      };
      const moveDoc = async () => {
        const m = smGet() || {}, box = mvBox(), out = $("[data-mv-msg]", box), L0 = load();
        if (!mvPick) { out.className = "msg bad"; out.textContent = "Выберите, кому передать."; return; }
        if (!Object.keys(L0).length && !(m.extra || []).length) { out.className = "msg bad"; out.textContent = "Список пуст — передавать нечего."; return; }
        const ni = ownNoName(m);
        if (ni >= 0) { NONAME = ni; renderSmeta(); out.className = "msg bad"; out.textContent = "У своей строки нет названия — впишите его или уберите строку (×)."; return; }
        const tg = !!$("[data-mv-tg]", box)?.checked, p = mvPick, btn = $("[data-mv-go]", box);
        btn.disabled = true; out.className = "msg"; out.textContent = "Передаём…";
        const r = await kabApi("smeta_upd", { items: L0, ld: obj(m.ld), extra: m.extra || [], doc: docNow(), id: m.id, disc: m.d ?? null, title: m.title || "", v: m.v, to: p.id, notify: tg }).catch(() => ({}));
        btn.disabled = false;
        if (stale()) return lockStale();
        if (!r.ok) {
          out.className = "msg bad";
          out.textContent = r.status === 409 ? `Смету уже изменил(а) ${r.by || "другой сотрудник"}${r.at ? " в " + r.at.slice(11, 16) : ""} — не передана. Вернитесь к клиенту и откройте свежую.`
            : r.error === "limit" ? "У этого человека уже 100 смет — пусть удалит старые." : r.status === 404 ? "Не нашли: смету удалили или человека заблокировали." : "Не удалось передать. Проверьте связь и нажмите ещё раз.";
          return;
        }
        const cur = smGet() || m, who = r.who || p.name || p.tg_name || "";
        const next = { ...cur, uid: r.to, who, wtg: true, ud: r.ud, udNow: r.ud, title: r.title || cur.title, v: r.ver, back: "/kabinet/#p=u" + r.to };
        delete next.cat0;
        next.saved = sig({ ...m, uid: r.to, ud: r.ud, title: next.title }, L0);
        next.savedAt = hhmm();
        smSet(next); mvPick = null; drawEdit(); renderSmeta();
        const m2 = $("[data-ed-msg]", edStrip);
        if (m2) { m2.className = "msg ok"; m2.textContent = `Смета передана: ${who}, ${next.savedAt}.` + (tg ? (r.sent ? " Ему ушло сообщение в Telegram." : " Сообщение в Telegram не ушло: человек не разрешил боту писать — сообщите сами.") : ""); }
        scrollTo({ top: 0, behavior: "smooth" });
      };
      edBox.addEventListener("input", ev => { if (ev.target.closest("[data-mv-q]")) mvList(); });
      edBox.addEventListener("keydown", ev => { if (ev.target.closest("[data-mv-q]") && ev.key === "Enter") { ev.preventDefault(); $("[data-mv-id]", edBox)?.click(); } });
      edBox.addEventListener("click", async ev => {
        const mv = ev.target.closest("[data-ed-move]"), box = mvBox();
        if (mv && box) {
          if (guard()) return;
          if (!box.hidden) { box.hidden = true; return; }
          if (!mvPeople) {
            const j = await kabApi("users").catch(() => ({}));
            if (!j.ok) { $("[data-ed-msg]", edStrip).textContent = "Не удалось загрузить список людей."; return; }
            mvPeople = j.users.filter(u => u.status !== "blocked");
          }
          const m = smGet() || {};
          mvPick = null;
          box.innerHTML = `<p><b>Кому передать смету «${esc(m.title || "")}»</b></p><input type="search" data-mv-q placeholder="Имя, телефон или компания" aria-label="Кому передать">`
            + '<div class="mv-res" data-mv-res></div><label class="consent"><input type="checkbox" data-mv-tg> Сообщить в Telegram</label>'
            + `<p class="muted small">Смета уйдёт${m.who ? " от " + esc(m.who) : ""} к выбранному человеку, у прежнего владельца её не останется. Несохранённые изменения сохранятся вместе с ней.`
            + (m.d == null ? " «Скидка на всё» пустая — смета посчитается с личной скидкой нового владельца." : "") + "</p>"
            + '<button class="btn" type="button" data-mv-go>Передать</button> <button class="btn ghost" type="button" data-mv-cancel>Отмена</button> <span class="msg" data-mv-msg role="status"></span>';
          box.hidden = false; mvList(); $("[data-mv-q]", box).focus();
          return;
        }
        const hit = ev.target.closest("[data-mv-id]");
        if (hit) { mvPick = (mvPeople || []).find(u => +u.id === +hit.dataset.mvId) || null; mvList(); return; }
        if (ev.target.closest("[data-mv-cancel]")) { mvPick = null; box.hidden = true; return; }
        if (ev.target.closest("[data-mv-go]")) return moveDoc();
        if (ev.target.closest("[data-ed-pdf]")) return window.print();
        const cp = ev.target.closest("[data-ed-copy]");
        if (!cp || guard()) return;
        // копия: новая заявка или смета тому же клиенту с тем же составом и скидками; исходный документ остаётся, как сохранён
        const m = smGet() || {};
        if (dirty(m) && !confirm(`Несохранённые изменения попадут только в копию; ${edName(m)} останется, как сохранена. Продолжить?`)) return;
        const kind = cp.dataset.edCopy === "s" ? "ns" : "nl", from = m.edit === "l" ? `заявки №${m.lid}` : `сметы «${m.title || ""}»`;
        const next = { ...m, edit: kind, from, title: kind === "ns" ? (m.edit === "s" ? `${m.title || ""} (копия)` : "") : "" };
        if (next.udNow != null) next.ud = next.udNow;  // новый документ — с сегодняшней личной скидкой клиента
        ["lid", "id", "v", "saved", "savedAt", "status", "total", "had", "cm", "nt0", "who0", "ph0"].forEach(k => { delete next[k]; });
        smSet(next); drawEdit(); renderSmeta();
        $("[data-ed-msg]", edStrip).textContent = `Это копия ${from}. Проверьте и нажмите «Создать».`;
        scrollTo({ top: 0, behavior: "smooth" });
      });
      // вернулись в эту вкладку, страница из кэша браузера («Назад»), правка в другой вкладке — показываем то, что сейчас в памяти
      const resync = () => { if (stale()) return lockStale(); count(); docShow(); renderSmeta(); drawEdit(); };
      addEventListener("storage", ev => { if ([SM_KEY, KEY, DOC_KEY, null].includes(ev.key)) resync(); });
      addEventListener("pageshow", ev => { if (ev.persisted) resync(); });
      document.addEventListener("visibilitychange", () => { if (!document.hidden && stale()) lockStale(); });
      if (stale()) lockStale();
    } else {
      // не сотрудник: страницу вернули из кэша браузера — список мог измениться на другой странице
      addEventListener("pageshow", ev => { if (ev.persisted) { count(); renderSmeta(); } });
    }
    // вошедшему — «Сохранить в кабинет»: смета откроется с любого устройства (вкладка «Сметы» в кабинете). Смету или заявку от AllVision
    // клиент сохраняет к себе со скидками и своими строками: сервер берёт их из базы по sid / lid (06.11.2026)
    const keep = $("[data-smeta-save]");
    if (keep && ME && !STAFF) {  // клиенту: сохранить — только себе, нам не придёт (владелец 07.11.2026)
      keep.textContent = "Сохранить себе в кабинет";
      keep.insertAdjacentHTML("afterend", ' <span class="muted small save-hint">— только для вас, нам не придёт</span> ');
    }
    if (keep && ME) {
      keep.hidden = editing();
      keep.addEventListener("click", async () => {
        if (guard()) return;
        const sm = smGet() || {}, ni = ownNoName(sm);
        if (ni >= 0) { NONAME = ni; renderSmeta(); tmsg.textContent = "У своей строки нет названия — впишите его или уберите строку (×)."; return; }
        const title = window.prompt("Название сметы, например «Квартира, ул. Притыцкого»:", "");
        if (title === null) return;
        const j = await kabApi("smeta_save", { title, doc: docNow(), items: load(), ld: obj(sm.ld), extra: sm.extra || [], d: sm.d ?? null, sid: sm.id || 0, lid: sm.lid || 0 }).catch(() => ({}));
        if (j.ok) {  // список переносится в смету кабинета, корзина пустеет; дальше — кабинет, вкладка «Сметы», эта смета подсвечена (владелец 06.11.2026)
          try { sessionStorage.setItem("hdl-flash", JSON.stringify(STAFF ? { text: `Смета «${j.title}» сохранена в кабинете.`, sid: j.id }
            : { text: `Смета «${j.title}» сохранена у вас в кабинете. Нам она не пришла — чтобы мы посчитали, нажмите «Открыть» и затем «Отправить в AllVision на расчёт».`, sid: j.id, warn: true })); } catch {}
          save({}); docSet(""); smSet(null);
          location.href = "/kabinet/#smetas";
          return;
        }
        tmsg.textContent = j.status === 401 ? "Войдите в кабинет заново, затем сохраните." : "Не удалось сохранить.";
        setTimeout(() => { tmsg.textContent = ""; }, 5000);
      });
    }
    // «Сохранить в проект» (владелец 07.11.2026): своя смета сотрудника в проекте — папке объекта D:\Work\Объекты. Компьютер AllVision
    // кладёт её файлом Excel в папку объекта (cabinet_sync.py, раз в 10 минут). После сохранения корзина пустеет, дальше — вкладка «Проекты»
    const projBtn = $("[data-smeta-proj]"), projBox = $("[data-proj-box]");
    if (projBtn && projBox && staffMe) {
      projBtn.addEventListener("click", async () => {
        if (editing()) return;
        if (!projBox.hidden) return projBox.scrollIntoView({ block: "center" });
        const j = await kabApi("projects").catch(() => ({}));
        if (!j.ok) { tmsg.textContent = "Не удалось загрузить список проектов."; return; }
        let last = ""; try { last = localStorage.getItem("hdl-proj") || ""; } catch {}
        projBox.innerHTML = `<h3>Сохранить в проект</h3>` + (j.projects.length
          ? `<div class="row3"><label>Проект *<select name="project"><option value="">— выберите проект —</option>${j.projects.map(n => `<option${n === last ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`
            + `<label>Название сметы<input name="title" maxlength="120" placeholder="Например: щит, 1 этаж"></label></div>`
            + '<p class="muted small">Проекты — папки объектов на компьютере AllVision. Смета сохранится в вашем кабинете в этом проекте, а в течение 10 минут её копия файлом Excel появится в папке объекта, в «Сметы с сайта».</p>'
            + '<button class="btn" type="submit">Сохранить в проект</button> <button class="btn ghost" type="button" data-proj-close>Закрыть</button><p class="msg" role="status"></p>'
          : '<p>Список проектов ещё не пришёл с компьютера AllVision — он обновляется раз в 10 минут. Попробуйте чуть позже.</p><button class="btn ghost" type="button" data-proj-close>Закрыть</button>');
        projBox.hidden = false;
        projBox.scrollIntoView({ block: "center" });
      });
      projBox.addEventListener("click", ev => { if (ev.target.closest("[data-proj-close]")) projBox.hidden = true; });
      projBox.addEventListener("submit", async ev => {
        ev.preventDefault();
        if (guard() || editing()) return;
        const P = projBox.elements, msg = $(".msg", projBox), btn = $("button[type=submit]", projBox), sm = smGet() || {};
        if (!P.project.value) { msg.className = "msg bad"; msg.textContent = "Выберите проект."; return; }
        if (!Object.keys(load()).length && !(sm.extra || []).length) { msg.className = "msg bad"; msg.textContent = "Список пуст — сохранять нечего."; return; }
        const ni = ownNoName(sm);
        if (ni >= 0) { NONAME = ni; renderSmeta(); msg.className = "msg bad"; msg.textContent = "У своей строки нет названия — впишите его или уберите строку (×)."; return; }
        btn.disabled = true; msg.className = "msg"; msg.textContent = "Сохраняем…";
        const r = await kabApi("smeta_save", { title: P.title.value, doc: docNow(), items: load(), ld: obj(sm.ld), extra: sm.extra || [], d: sm.d ?? null, project: P.project.value }).catch(() => ({}));
        btn.disabled = false;
        if (!r.ok) { msg.className = "msg bad"; msg.textContent = r.error === "limit" ? "У вас уже 100 смет — удалите старые." : r.status === 404 ? "Такого проекта больше нет — обновите страницу." : "Не удалось сохранить."; return; }
        try { localStorage.setItem("hdl-proj", P.project.value); sessionStorage.setItem("hdl-flash", JSON.stringify({ text: `Смета «${r.title}» сохранена в проект «${P.project.value}». Копия в папке объекта появится в течение 10 минут.`, sid: r.id })); } catch {}
        save({}); docSet(""); smSet(null);
        location.href = "/kabinet/#projects";
      });
    }
    // этап 2 (владелец 05.11.2026): сотрудник сохраняет смету клиенту или дилеру — у человека в кабинете, со скидкой в смете вместо личной,
    // названием документа и сообщением в Telegram. Пока меняют скидку, таблица считает с ней — видно то, что увидит человек; закрыли без
    // сохранения — как было. Пустая «Скидка в смете» — личная скидка человека, а не 0 % (06.11.2026)
    const forBtn = $("[data-smeta-for]"), forBox = $("[data-for-box]");
    if (forBtn && staffMe) {
      forBtn.hidden = editing();
      const ROLE_N = { user: "пользователь", client: "клиент", dealer: "дилер" }, F = forBox.elements;
      let people = null, before = null, saved = false;
      const emptyD = () => String(F.disc.value).trim() === "";
      const pctIn = () => Math.max(0, Math.min(50, Math.round((+String(F.disc.value).replace(",", ".") || 0) * 10) / 10));
      const preview = () => { if (guard()) return; smSet({ ...(smGet() || {}), d: emptyD() ? null : pctIn(), ud: +(F.user.selectedOptions[0]?.dataset.d || 0) }); renderSmeta(); };
      const syncReplace = () => {
        const same = !!(before && before.id && +F.user.value === +before.uid), l = $("[data-for-replace]", forBox);
        l.innerHTML = `<input type="checkbox" name="replace"> Заменить смету «${esc(before?.title || "")}» у этого человека`;
        l.hidden = !same;
      };
      forBtn.addEventListener("click", async () => {
        if (editing()) return;
        if (!forBox.hidden) return forBox.scrollIntoView({ block: "center" });
        if (!people) {
          const j = await kabApi("users").catch(() => ({}));
          if (!j.ok) { tmsg.textContent = "Не удалось загрузить список клиентов."; return; }
          people = j.users.filter(u => u.status !== "blocked" && u.role !== "staff");
        }
        before = smGet(); saved = false;
        const order = { client: 0, dealer: 1, user: 2 }, nm = u => u.name || u.tg_name || "—";
        const opts = people.slice().sort((a, b) => (order[a.role] - order[b.role]) || nm(a).localeCompare(nm(b), "ru"))
          .map(u => `<option value="${u.id}" data-d="${+u.discount || 0}"${before && +before.uid === u.id ? " selected" : ""}>${esc(nm(u))}${u.company ? " · " + esc(u.company) : ""} — ${ROLE_N[u.role] || ""}${+u.discount ? ", скидка " + pct(+u.discount) : ""}</option>`).join("");
        forBox.innerHTML = `<h3>Смета для клиента</h3><div class="row3"><label>Кому *<select name="user"><option value="">— выберите клиента или дилера —</option>${opts}</select></label>`
          + `<label>Название сметы<input name="title" maxlength="120" placeholder="Например: квартира, ул. Притыцкого" value="${esc(before?.title || "")}"></label>`
          + `<label>Скидка в смете, %<input name="disc" type="number" min="0" max="50" step="0.5" value="${before?.d ?? ""}" placeholder="личная"></label></div>`
          + '<label class="consent" data-for-replace hidden></label><label class="consent"><input type="checkbox" name="notify"> Сообщить в Telegram</label>'
          + `<p class="muted small">Скидка в смете заменяет личную скидку человека; пусто — действует его личная. Название документа — «${esc(docH.textContent)}», меняется выше. Человек увидит смету в кабинете, во вкладке «Сметы».</p>`
          + '<button class="btn" type="submit">Сохранить для клиента</button> <button class="btn ghost" type="button" data-for-close>Закрыть</button><p class="msg" role="status"></p>';
        forBox.hidden = false;
        syncReplace();
        forBox.scrollIntoView({ block: "center" });
      });
      forBox.addEventListener("change", ev => {  // выбрали человека — таблица считает с его личной скидкой, если своей в смете нет
        if (ev.target !== F.user) return;
        syncReplace(); preview();
      });
      forBox.addEventListener("input", ev => { if (ev.target === F.disc) preview(); });
      forBox.addEventListener("click", ev => {
        if (!ev.target.closest("[data-for-close]")) return;
        forBox.hidden = true;
        if (!saved && !editing()) {  // скидки — как были, строки не трогаем
          const cur = smGet() || {};
          if (before && before.d != null) cur.d = before.d; else delete cur.d;
          if (before && before.ud != null) cur.ud = before.ud; else delete cur.ud;
          smSet(cur); renderSmeta();
        }
      });
      forBox.addEventListener("submit", async ev => {
        ev.preventDefault();
        if (guard() || editing()) return;
        const msg = $(".msg", forBox), btn = $("button[type=submit]", forBox);
        if (!F.user.value) { msg.className = "msg bad"; msg.textContent = "Выберите, кому сохранить."; return; }
        if (!Object.keys(load()).length && !((smGet() || {}).extra || []).length) { if (saved) return; msg.className = "msg bad"; msg.textContent = "Список пуст — сохранять нечего. Сохранённую смету откройте кнопкой «Открыть смету» или из кабинета."; return; }  // список уже перенесён
        const ni = ownNoName(smGet());
        if (ni >= 0) { NONAME = ni; renderSmeta(); msg.className = "msg bad"; msg.textContent = "У своей строки нет названия — впишите его или уберите строку (×)."; return; }
        const d = emptyD() ? null : pctIn(), uid = +F.user.value, who = F.user.selectedOptions[0].textContent.split(" — ")[0];
        btn.disabled = true; msg.className = "msg"; msg.textContent = "Сохраняем…";
        const r = await kabApi("smeta_for", { user_id: uid, title: F.title.value, doc: docNow(), disc: d,
          items: load(), ld: obj((smGet() || {}).ld), extra: (smGet() || {}).extra || [], id: F.replace?.checked && before?.id ? before.id : 0, notify: F.notify.checked }).catch(() => ({}));
        btn.disabled = false;
        if (!r.ok) { msg.className = "msg bad"; msg.textContent = r.error === "limit" ? "У человека уже 100 смет — пусть удалит старые." : r.status === 403 ? "Нужен вход сотрудника." : "Не удалось сохранить."; return; }
        saved = true;
        before = { d: r.disc ?? null, id: r.id, uid, title: r.title };
        // список переносится в смету клиента, здесь остаётся пусто (владелец 06.11.2026); открыть её — кнопкой ниже
        if (!editing()) { save({}); docSet(""); smSet(null); renderSmeta(); }
        syncReplace(); F.title.value = r.title;
        msg.className = "msg ok";
        msg.innerHTML = esc(`Сохранено у «${who}»: «${r.title}». Список перенесён в его смету.` + (F.notify.checked ? (r.sent ? " Сообщение в Telegram отправлено." : " Сообщение в Telegram не ушло: человек не разрешил боту писать — сообщите сами.") : ""))
          // дальше — открыть эту смету в правке или в карточку клиента (владелец 06.11.2026)
          + `<span class="for-next"><button class="btn" type="button" data-for-open="${+r.id}">Открыть смету</button> <a class="btn ghost" href="/kabinet/#p=u${uid}" data-for-person="${+r.id}">К клиенту →</a></span>`;
      });
      forBox.addEventListener("click", async ev => {
        const pp = ev.target.closest("[data-for-person]");
        if (pp) { try { sessionStorage.setItem("hdl-flash", JSON.stringify({ text: `Смета «${F.title.value}» сохранена.`, sid: +pp.dataset.forPerson })); } catch {} return; }
        const ob = ev.target.closest("[data-for-open]"); if (!ob) return;
        ob.disabled = true;
        const j = await kabApi("smeta_get&id=" + encodeURIComponent(ob.dataset.forOpen)).catch(() => ({}));
        ob.disabled = false;
        if (!j.ok) { const m = $(".msg", forBox); m.className = "msg bad"; m.textContent = "Не удалось открыть смету — откройте её из кабинета."; return; }
        const s = j.smeta;  // как «Открыть и поправить» в кабинете: правка этой сметы, назад — в карточку клиента
        save(obj(s.items)); docSet(s.doc);
        const x = { d: s.disc, id: s.id, uid: s.user_id, title: s.title, ld: obj(s.ld), extra: s.extra || [], edit: "s", who: s.name || "", wtg: true,
          v: s.ver, k: Math.random().toString(36).slice(2, 10), back: "/kabinet/#p=u" + s.user_id, ud: +s.udisc || 0 };
        smSet(x);
        const y = smGet(); y.saved = sig(y); smSet(y);
        location.replace("/smeta/");
      });
    }
    // ссылка на смету: в ней только артикулы и количество. Скидки и свои строки по ссылке не передаются — предупреждаем (06.11.2026)
    $("[data-copy-link]").addEventListener("click", () => {
      const items = load();
      if (!Object.keys(items).length) { tmsg.textContent = "По ссылке передать нечего: в списке только свои строки. Пошлите PDF."; setTimeout(() => { tmsg.textContent = ""; }, 8000); return; }
      const m = smGet(), lost = !!m && ((m.extra || []).length > 0 || smLines(items, m).some(l => l.rb != null && l.disc > 0));
      const url = location.origin + "/smeta/?s=" + Object.entries(items).map(([a, q]) => encodeURIComponent(a) + "*" + q).join(",") + (docNow() ? "&d=" + encodeURIComponent(docNow()) : "");
      copy(url, lost ? "Ссылка скопирована. В ней только артикулы и количество: скидок и своих строк по ссылке не будет — клиенту лучше PDF." : "Ссылка скопирована", lost ? 8000 : 3000);
    });
    $("[data-copy-text]").addEventListener("click", () => copy(smLines(load(), smGet()).map(l => `${l.x ? "—" : l.a}\t${l.n}${l.x ? ", " + (l.u || "шт.") : ""}\t${l.q}\t${l.t != null ? l.t + " BYN" : "по запросу"}`).join("\n"), "Список скопирован"));
    // загрузка списка: «артикул количество» в строке
    $("[data-import-go]").addEventListener("click", () => {
      if (guard()) return;
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
    if (staffMe) {
      docBox.addEventListener("change", ev => {
        const s = ev.target.closest("[data-doc-sel]"); if (!s) return;
        if (s.value === "+") { $("[data-doc-new]", docBox).hidden = false; $("[data-doc-in]", docBox).focus(); return; }
        if (guard()) return;
        docSet(s.value); docShow();
      });
      docBox.addEventListener("click", async ev => {
        if (ev.target.closest("[data-doc-add]")) {
          const t = $("[data-doc-in]", docBox).value.trim().replace(/\s+/g, " ");
          if (!t) return $("[data-doc-in]", docBox).focus();
          if (await docSend("doc_title_add", { title: t })) { docSet(DOCS.some(x => x.title === t) ? t : DOC0); docShow(); }
        }
        const d = ev.target.closest("[data-doc-del]");
        if (d && confirm(`Убрать «${docH.textContent}» из списка названий для всех сотрудников?`) && await docSend("doc_title_del", { id: +d.dataset.docDel })) { docSet(DOC0); docShow(); }
      });
      docBox.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.closest("[data-doc-in]")) { ev.preventDefault(); $("[data-doc-add]", docBox).click(); } });
    }
  }

  // ---- телефон: в пустом поле «+375 », дальше код оператора и номер по образцу +375 29 123-45-67; стёрли «+375» — любой номер как есть ----
  const BY = "+375 ";
  $$('input[name="phone"]').forEach(i => {
    // на телефоне касание ставит курсор в начало поля: переносим его в конец, а цифры, набранные перед «+375», ставим после (09.11.2026)
    const toEnd = () => { const n = i.value.length; try { i.setSelectionRange(n, n); } catch (_) {} };
    i.addEventListener("focus", () => { if (!i.value) i.value = BY; toEnd(); requestAnimationFrame(toEnd); setTimeout(toEnd, 60); });
    ["click", "pointerup"].forEach(ev => i.addEventListener(ev, () => { if (i.value.startsWith("+375") && i.selectionStart < 5 && i.selectionStart === i.selectionEnd) toEnd(); }));
    i.addEventListener("blur", () => { if (i.value.trim() === "+375") i.value = ""; });
    i.addEventListener("input", ev => {
      const lead = i.value.match(/^([\d\s()\-]+)\+375\s?(.*)$/);
      if (lead) { i.value = BY + lead[1].replace(/\D/g, "") + lead[2].replace(/\D/g, ""); }
      if (!i.value.startsWith("+375") || (ev.inputType || "").startsWith("delete")) return;  // свой номер или стирание — не мешаем
      const d = i.value.slice(4).replace(/\D/g, "").slice(0, 9);
      i.value = BY + d.slice(0, 2) + (d.length > 2 ? " " + d.slice(2, 5) : "") + (d.length > 5 ? "-" + d.slice(5, 7) : "") + (d.length > 7 ? "-" + d.slice(7, 9) : "");
    });
  });

  // ---- «Отправить в AllVision на расчёт» над формой сметы: опускает к форме и подсвечивает её (владелец 07.11.2026) ----
  $("[data-send-go]")?.addEventListener("click", () => {
    const w = $("[data-smeta-form]"), f = w && $("form", w);
    if (!f) return;
    f.scrollIntoView({ block: "center", behavior: "smooth" });
    f.classList.remove("flash-on"); void f.offsetWidth; f.classList.add("flash-on");
    const empty = ["name", "phone"].map(n => f.elements[n]).find(i => i && !i.value.trim());
    setTimeout(() => (empty || f.elements.comment || f.elements.phone)?.focus({ preventScroll: true }), 400);
  });

  // ---- заявки (формы с темой; анкета кабинета — отдельно) ----
  const prefill = f => { if (!ME) return; [["name", ME.name], ["phone", ME.phone]].forEach(([n, v]) => { if (f.elements[n] && !f.elements[n].value && v) f.elements[n].value = v; }); };
  $$("form.lead[data-topic]").forEach(prefill);
  $$("form.lead[data-topic]").forEach(f => f.addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $(".msg", f), btn = $("button[type=submit]", f);
    const v = n => (f.elements[n]?.value || "").trim();
    msg.className = "msg";
    if ((v("phone").match(/\d/g) || []).length < 7) { msg.textContent = "Укажите телефон, чтобы мы могли перезвонить."; msg.classList.add("bad"); return; }
    if (!f.elements.consent.checked) { msg.textContent = "Отметьте согласие на обработку данных."; msg.classList.add("bad"); return; }
    const body = { name: v("name"), phone: v("phone"), comment: v("comment"), website: v("website"), consent: true,
      topic: f.dataset.topic, page: location.pathname };
    if (box) {  // цены — как в смете; смета от сотрудника — с её скидкой и названием документа
      const m = smGet(), dh = docNow();
      if (ownNoName(m) >= 0) { msg.textContent = "У своей строки нет названия — впишите его или уберите строку (×)."; msg.classList.add("bad"); return; }
      body.items = leadRows(m);
      // состав для «Открыть» в кабинете; скидки и свои строки сервер берёт из сметы (sid) или заявки (lid) этого человека, а не отсюда
      body.sm = { items: load(), ld: obj(m?.ld), extra: m?.extra || [], d: m?.d ?? null, sid: m?.id || 0, lid: m?.lid || 0 };
      if (m && m.d != null) body.sdisc = +m.d;
      if (dh) body.doc = dh;
    }
    btn.disabled = true; msg.textContent = "Отправляем…";
    try {
      const r = await fetch("/lead.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "fail");
      msg.textContent = box ? `Заявка${j.id ? " №" + j.id : ""} отправлена в AllVision. Менеджер свяжется с вами${ME ? ", смета — во вкладке «Заявки» кабинета" : ""}.`
        : "Спасибо! Заявка принята, перезвоним в рабочее время."; msg.classList.add("ok");
      f.reset();
      prefill(f);
      if (box) {
        save({}); docSet(""); smSet(null); $("[data-doc-h]").textContent = DOC0; renderSmeta();
        // смета пуста — форма прячется вместе с сообщением; итог показываем над списком (07.11.2026: клиент не видел, что заявка ушла)
        $(".sent-ok")?.remove();
        box.insertAdjacentHTML("beforebegin", `<p class="msg ok sent-ok" role="status">${esc(msg.textContent)}</p>`);
        $(".sent-ok").scrollIntoView({ block: "center", behavior: "smooth" });
      }
    } catch (e) {
      msg.innerHTML = 'Не удалось отправить. Позвоните: <a href="tel:+375293702020">+375 29 370-20-20</a> или напишите на <a href="mailto:info@allvision.by">info@allvision.by</a>.';
      msg.classList.add("bad");
    } finally { btn.disabled = false; }
  }));

  // ---- страница /kabinet/: вход через Telegram, анкета, вкладки «Сметы», «Заявки», «Мои данные»; сотруднику ещё «Пользователи»
  // (подтвердить или отклонить, роль, скидка, блокировка), все заявки с состоянием и все сметы ----
  const kab = $("[data-kab]");
  if (kab) {
    const ROLE = { user: "пользователь", client: "клиент", dealer: "дилер", staff: "сотрудник AllVision" };
    const ST = { new: "Новая", work: "В работе", kp: "КП отправлено", closed: "Закрыта" };
    const day = s => (s || "").slice(0, 10).split("-").reverse().join(".");
    const loginBox = $("[data-kab-login]"), form = $("[data-kab-form]"), main = $("[data-kab-main]"), panel = $("[data-kab-panel]"), E = form.elements;
    let user = null, staff = false, admin = false;  // admin — суперадмин: блокирует, назначает категории (владелец 05.11.2026)
    const show = el => [loginBox, form, main].forEach(x => { x.hidden = x !== el; });
    const bad = (el, t) => { el.className = "msg bad"; el.textContent = t; };
    // пока вкладка грузится, панель держит высоту прежней: подвал не подскакивает и не падает обратно (владелец 05.11.2026).
    // Высоту отпускает первое же новое содержимое; следующая загрузка до него — отменяет прежнюю «отпускалку»
    let hold = null;
    const wait = () => {
      hold?.disconnect();
      panel.style.minHeight = panel.offsetHeight + "px";
      panel.innerHTML = '<p class="muted">Загружаем…</p>';
      hold = new MutationObserver(() => { panel.style.minHeight = ""; hold.disconnect(); });
      hold.observe(panel, { childList: true });
    };
    const failed = () => { panel.innerHTML = '<p class="msg bad">Не удалось загрузить. Обновите страницу или войдите заново.</p>'; };
    const done = j => { user = j.user; staff = !!j.staff; admin = !!j.admin; remember(user); setAcc(user); route(); };
    // возврат с нового входа Telegram без входа: tg.php → /kabinet/#tg=<причина>; метку из адреса убираем сразу
    const TG_ERR = { cancel: "Вход отменён. Нажмите «Войти через Telegram» ещё раз.", again: "Вход не завершён. Нажмите «Войти через Telegram» ещё раз.",
      fail: "Не получилось войти. Попробуйте ещё раз или позвоните: +375 29 370-20-20.", blocked: "Доступ закрыт. Позвоните: +375 29 370-20-20." };
    const tgErr = (location.hash.match(/^#tg=(\w+)$/) || [])[1];
    if (tgErr) history.replaceState(null, "", location.pathname);
    const out = () => { const m = smGet(); smSet(null); if (m && m.edit) { save({}); docSet(""); } count(); remember(null); setAcc(null); user = null; staff = admin = false; history.replaceState(null, "", location.pathname); route(); };

    const showLogin = async () => {
      show(loginBox);
      const msg = $("[data-kab-msg]"), slot = $("[data-tg-btn]"), alt = $("[data-kab-alt]");
      if (slot.childElementCount) return;
      const j = await kabApi("bot").catch(() => ({}));
      if (!j.ok) { bad(msg, "Вход временно недоступен. Позвоните: +375 29 370-20-20."); return; }
      if (tgErr && TG_ERR[tgErr]) bad(msg, TG_ERR[tgErr]);
      // новый вход Telegram (tg.php, OpenID Connect): страница Telegram в этой же вкладке, без окон и рамок — включён, когда в config.php есть tg_secret
      if (j.oidc) {
        slot.innerHTML = '<a class="tg-login" href="/tg.php"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.9 4.3 18.6 19.8c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.2-8.3c.4-.4-.1-.6-.6-.2L6 13.4l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6L20.5 2.9c.9-.3 1.7.2 1.4 1.4z"/></svg>Войти через Telegram</a>';
        return;
      }
      // прежняя кнопка Telegram открывает отдельное окно; браузеры внутри Telegram, Viber, Instagram и блокировщики его не открывают, и вход «зависает»
      // (владелец 04.11.2026). Запасной вход — страница Telegram в этой же вкладке: она возвращает на кабинет с #tgAuthResult, его разбирает скрипт кнопки
      if (j.id) {
        $("a", alt).href = `https://oauth.telegram.org/auth?bot_id=${j.id}&origin=${encodeURIComponent(location.origin)}&request_access=write&return_to=${encodeURIComponent(location.origin + location.pathname)}`;
        alt.hidden = false;
      }
      const unfocus = () => { if (document.activeElement?.tagName === "IFRAME") document.activeElement.blur(); };  // следующее нажатие снова даст blur
      // нажатие уводит фокус в рамку кнопки; если через 1,5 с он всё ещё на странице — окно Telegram не открылось
      addEventListener("blur", () => setTimeout(() => {
        if (user || loginBox.hidden || !slot.contains(document.activeElement) || !document.hasFocus()) return;
        bad(msg, "Окно Telegram не открылось. Нажмите «Войти в этой вкладке».");
        unfocus();
      }, 1500));
      window.hdlTgUnauth = () => { if (!user) { bad(msg, "Вход не завершён. Нажмите кнопку ещё раз или «Войти в этой вкладке»."); unfocus(); } };
      window.hdlTgAuth = async tg => {
        msg.className = "msg"; msg.textContent = "Входим…";
        const r = await kabApi("login", tg).catch(() => ({}));
        if (r.ok) { msg.textContent = ""; done(r); }
        else bad(msg, r.error === "blocked" ? "Доступ закрыт. Позвоните: +375 29 370-20-20." : "Не получилось войти. Попробуйте ещё раз.");
      };
      const s = document.createElement("script");
      s.async = true; s.src = "https://telegram.org/js/telegram-widget.js?22";
      Object.assign(s.dataset, { telegramLogin: j.bot, size: "large", radius: "10", requestAccess: "write", onauth: "hdlTgAuth(user)", onunauth: "hdlTgUnauth()" });
      slot.appendChild(s);
    };
    // вход завершился в другой вкладке или окне (Telegram вернул на сайт туда): эта вкладка подхватывает его, когда к ней возвращаются
    const recheck = () => { if (!user && loggedIn()) kabApi("me").then(j => { if (j.ok && j.user && !user) done(j); }).catch(() => {}); };
    addEventListener("storage", ev => { if (ev.key === ME_KEY) recheck(); });
    addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) recheck(); });

    // анкета при первом входе; та же форма — во вкладке «Мои данные». Роль не выбирают: права отмечает сотрудник (владелец 03.11.2026)
    const setupForm = first => {
      $("h3", form).textContent = first ? "Как с вами связаться" : "Ваши данные";  // проще, без «расскажите о себе» (владелец 04.11.2026)
      $("[data-kab-consent]", form).hidden = !first;
      $("[data-kab-hint]", form).hidden = !first;
      $("button[type=submit]", form).textContent = first ? "Готово" : "Сохранить";
      E.name.value = user.name || (first ? user.tg_name : "") || "";
      E.phone.value = user.phone || ""; E.company.value = user.company || ""; E.unp.value = user.unp || "";
      $(".msg", form).textContent = "";
    };
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const msg = $(".msg", form), first = user.status === "form", btn = $("button[type=submit]", form);
      const err = { name: "Укажите имя.", phone: "Укажите телефон.", consent: "Отметьте согласие на обработку данных." };
      btn.disabled = true;
      const j = await kabApi("profile", { name: E.name.value, phone: E.phone.value, company: E.company.value, unp: E.unp.value, consent: E.consent.checked }).catch(() => ({}));
      btn.disabled = false;
      if (!j.ok) { bad(msg, err[j.error] || "Не удалось сохранить. Попробуйте ещё раз."); return; }
      if (first) done(j);
      else { user = j.user; remember(user); head(); msg.className = "msg ok"; msg.textContent = "Сохранено."; }
    });

    const head = () => {
      $("[data-kab-name]").textContent = user.name || user.tg_name;
      $("[data-kab-role]").textContent = " · " + (admin ? "суперадмин AllVision" : ROLE[user.role]) + (user.discount > 0 ? " · скидка " + pct(user.discount) : "");
      const p = $("[data-kab-pending]");
      p.hidden = !user.wanted;
      p.textContent = user.wanted ? `Запрос статуса «${ROLE[user.wanted]}» на рассмотрении. Когда сотрудник подтвердит, придёт сообщение в Telegram`
        + (user.wanted === "dealer" ? ", а цены на сайте станут дилерскими." : ".") : "";
    };

    // ---- заявки и сметы: одни таблицы для вкладок и карточки клиента (поиск по имени и телефону, владелец 06.11.2026) ----
    let SHOWN = { leads: [], smetas: [] }, PERSON = null;  // что сейчас в панели — для «Открыть»; чья карточка открыта
    const jl = s => { try { return JSON.parse(s || "[]") || []; } catch { return []; } };
    const dayT = s => day(s) + (s && s.length > 15 ? " " + s.slice(11, 16) : "");  // дата и время правки
    const hhmm = () => new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const tok = () => Math.random().toString(36).slice(2, 10);  // метка документа для вкладки страницы сметы
    // строка состава: «× 2: 1 202 → 1 082 BYN (−10 %)» — цена до скидки зачёркнута (Baymard, 1С:УНФ: скидка и процентом, и суммой)
    const ulist = it => `<ul>${it.map(x => `<li>${esc(x.a)} — ${esc(x.n)} × ${x.q}${x.b == null ? ", по запросу"
      : ": " + (x.rb != null && x.rb > x.b ? `<s>${fmt(x.rb * x.q)}</s> → ` : "") + fmt(x.b * x.q) + " BYN" + (x.rb != null && x.rb > x.b && x.p ? ` (−${pct(x.p)})` : "")}</li>`).join("")}</ul>`;
    // итог заявки с расшифровкой скидки (владелец 06.11.2026: «нет информации о скидке»): «2 поз. · без скидки 1 202 → скидка 10 % −120 → итого 1 082 BYN».
    // У строк, записанных до 06.11.2026, цены до скидки нет — тогда откуда скидка, видно по составу для правки
    const leadMoney = (rows, total, sm) => {
      if (!rows.length) return "";
      const r2 = v => Math.round(v * 100) / 100, priced = rows.filter(r => r.b != null), sum = total != null ? +total : r2(priced.reduce((t, r) => t + r.b * r.q, 0));
      const full = r2(priced.reduce((t, r) => t + (r.rb ?? r.b) * r.q, 0)), ps = new Set(priced.map(r => r.p ?? ((r.rb ?? r.b) > r.b ? "?" : 0)).map(String));
      if (full - sum >= 0.005) return `${rows.length} поз. · без скидки ${fmt(full)} → скидка${ps.size === 1 && !ps.has("?") ? " " + pct(+[...ps][0]) : ""} −${fmt(r2(full - sum))} → <b>итого ${fmt(sum)} BYN</b>`;
      const src = sm ? (sm.d != null ? (+sm.d ? `скидка на всё ${pct(sm.d)}` : "") : +sm.ud > 0 ? `личная скидка ${pct(sm.ud)}` : "") : "";
      return `${rows.length} поз., <b>${fmt(sum)} BYN</b>${src ? ` <span class="muted small">(${src})</span>` : ""}`;
    };
    const pkey = ph => { const d = String(ph || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-9) : ""; };  // как kab_phone_key на сервере
    const pLink = (uid, ph, text) => uid ? `<a href="#p=u${uid}">${text}</a>` : pkey(ph) ? `<a href="#p=t${pkey(ph)}">${text}</a>` : text;
    // сумма сметы — со скидкой сметы, иначе с личной скидкой её владельца (сотрудник у чужой сметы — не со своей); подпись — откуда скидка
    const smMoney = s => {
      const ud = staff && +s.user_id !== +user.id ? +s.udisc || 0 : null;
      const ls = smLines(s.items, { d: s.disc != null ? s.disc : ud != null ? ud : DISC, ld: s.ld, extra: s.extra });  // не зависит от STAFF: сразу после входа его ещё нет
      let sum = 0, full = 0;
      ls.forEach(l => { if (l.t != null) { sum += l.t; full += l.rb * l.q; } });
      sum = Math.round(sum * 100) / 100; full = Math.round(full * 100) / 100;
      const pd = ud != null ? ud : DISC;
      const src = s.disc != null ? (+s.disc ? `в смете ${pct(s.disc)}` : "в смете без скидки") : pd ? `личная ${pct(pd)}` : "";
      const own = Object.keys(obj(s.ld)).length || (s.extra || []).some(x => x.d != null && x.d !== "");
      const note = [full > sum ? `без скидки ${fmt(full)}` : "", src, own ? "+ в строках" : ""].filter(Boolean).join(" · ");
      return `${fmt(sum)} BYN${note ? `<br><span class="muted small">${note}</span>` : ""}`;
    };
    const smFrom = s => (s.made_by ? `<br><span class="muted small">${staff ? "подготовил: " + esc(s.made_name || "сотрудник") : "подготовила AllVision"}</span>` : "")
      + (s.edited_at ? `<br><span class="muted small">${staff ? "изменил: " + esc(s.edited_name || "сотрудник") : "изменена AllVision"} ${dayT(s.edited_at)}</span>` : "");
    const smetaTable = (list, who) => `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Смета</th>${who ? "<th>Чья</th>" : ""}<th class="num">Позиций</th><th class="num">Сумма*</th><th>Обновлена</th><th></th></tr></thead><tbody>`
      + list.map(s => `<tr><td>${esc(s.title)}${s.doc ? `<br><span class="muted small">${esc(s.doc)}</span>` : ""}${smFrom(s)}</td>`
        + (who ? `<td>${pLink(s.user_id, "", esc(s.name))}${s.company ? `<br><span class="muted small">${esc(s.company)}</span>` : ""}</td>` : "")
        + `<td class="num">${Object.keys(obj(s.items)).length + (s.extra || []).length}</td><td class="num">${smMoney(s)}</td><td>${day(s.updated_at)}</td>`
        + `<td class="acts"><button class="cbtn" type="button" data-open="${s.id}">Открыть</button>${+s.user_id === +user.id || (staff && +s.made_by === +user.id) ? ` <button class="cbtn ghost" type="button" data-del="${s.id}">Удалить</button>` : ""}</td></tr>`).join("")
      + "</tbody></table></div>";
    const smetaNote = () => `<p class="muted small">* По сегодняшним ценам: со скидкой, указанной в смете, иначе${staff ? " с личной скидкой владельца сметы" : DISC ? ` с вашей скидкой ${pct(DISC)}` : " по розничным"}; без позиций «по запросу». «Открыть» заменяет текущий список для сметы.${staff ? " Открытую смету правят на странице сметы и сохраняют кнопкой «Сохранить»." : ""}</p>`;
    // оплата заявки (владелец 07.11.2026): в карточке клиента строка зелёная — оплачен, жёлтая — частично, красная — не оплачен
    const fm2 = v => (+v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, " ");  // деньги оплат — с копейками
    const PAYT = { paid: "оплачен", part: "оплачен частично", none: "не оплачен", nosum: "сумма не задана" };
    const payLeft = l => Math.max(0, Math.round((+l.total - +(l.paid || 0)) * 100) / 100);
    // отгрузка (07.11.2026): метка и «+ Отгрузка» — в карточке клиента у сотрудника
    // блок состояния ровной колонкой (07.11.2026): метки оплаты и отгрузки — одной строкой, под ними сумма оплат и «+ Отгрузка» на всю ширину
    // строка заявки, вариант А (владелец 07.11.2026): метки — за суммой, «+ Отгрузка» — рядом с «Открыть и поправить», справа только состояние
    const payBadges = l => (l.pay ? ` <span class="pay-b ${l.pay}">${PAYT[l.pay]}</span>` : "")
      + (l.ship ? ` <span class="pay-b ${l.ship === "done" ? "paid" : "part"}">${l.ship === "done" ? "отгружен" : "отгружен частично"}</span>` : "")
      + (admin && l.paid > 0 ? `<br><span class="muted small">оплачено ${fm2(l.paid)}${+l.total > 0 ? " из " + fm2(+l.total) : ""} BYN</span>` : "");
    const shipBtn = l => staff && l.ship !== "done" && (l.ship_need || []).length ? ` <button class="cbtn ghost" type="button" data-ship-new="${l.id}">+ Отгрузка</button>` : "";
    const leadTable = (list, who, pay) => `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>№</th><th>Дата</th>${who ? "<th>Кто</th>" : ""}<th>Что</th><th>Состояние</th></tr></thead><tbody>`
      + list.map(l => {
        const it = jl(l.items), was = staff ? jl(l.items0) : [];
        return `<tr${pay && l.pay && l.pay !== "nosum" ? ` class="pay-${l.pay}"` : ""}><td>${l.id}</td><td>${day(l.created_at)}</td>`
          + (who ? `<td>${pLink(l.user_id, l.phone, esc(l.name || "—"))}<br><a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>${l.role ? `<br><span class="muted small">${esc(ROLE[l.role] || "")}${l.company ? ", " + esc(l.company) : ""}</span>` : ""}</td>` : "")
          + `<td>${esc(l.topic || "Заявка")}${it.length ? " · " + leadMoney(it, l.total, l.sm) : ""}${pay ? payBadges(l) : ""}${l.comment ? `<br><span class="muted small">${esc(l.comment)}</span>` : ""}`
          + (staff && l.note ? `<br><span class="own-note small">Заметка: ${esc(l.note)}</span>` : "")
          + (l.made ? `<br><span class="muted small">${staff ? "оформил: " + esc(l.made_name || "сотрудник") : "оформлена AllVision"}</span>` : "")
          + (l.edited_at ? `<br><span class="muted small">${staff ? "изменил: " + esc(l.edited_name || "сотрудник") : "изменена AllVision"} ${dayT(l.edited_at)}</span>` : "")
          + (it.length ? `<details><summary>Состав</summary>${ulist(it)}</details>` : "")
          + (was.length ? `<details><summary>${l.made ? "Как оформили сначала" : "Как прислал клиент"}</summary>${ulist(was)}<p class="small">${leadMoney(was, l.total0, null)}</p></details>` : "")
          // сотруднику — у любой заявки, и у «Заказать звонок»: состав можно набрать прямо в ней (06.11.2026)
          + (staff || it.length || l.sm ? `<p class="acts"><button class="cbtn" type="button" data-lopen="${l.id}">${staff ? "Открыть и поправить" : "Открыть"}</button>${pay ? shipBtn(l) : ""}</p>` : "") + "</td>"
          + `<td>${staff ? `<div class="st-col"><select data-st="${l.id}" data-prev="${esc(l.status)}" data-tg="${l.tg ? 1 : ""}" aria-label="Состояние заявки №${l.id}">${Object.entries(ST).map(([k, t]) => `<option value="${k}"${k === l.status ? " selected" : ""}>${t}</option>`).join("")}</select><div class="st-conf" hidden></div><span class="st-note small" hidden></span></div>`
            : `<span class="st ${esc(l.status)}">${ST[l.status] || esc(l.status)}</span>`}</td></tr>`;
      }).join("") + "</tbody></table></div>";
    const leadNote = () => `<p class="muted small">«Открыть» заменяет текущий список для сметы.${staff ? " Открытую заявку правят на странице сметы и сохраняют кнопкой «Сохранить»: клиент увидит новый состав, а здесь останется, как он прислал." : ""}</p>`;
    // заявка без состава для правки (до 06.11.2026) — состав из её строк: артикул из каталога — строкой каталога, остальное (своя строка,
    // артикула больше нет) — своей строкой с ценой из заявки, без новой скидки
    const fromRows = rs => {
      const items = {}, extra = [];
      rs.forEach(r => {
        if (r.a && r.a !== "своя строка" && (D.items[r.a] || D.items[String(r.a).split(" · ")[0]])) { items[r.a] = (items[r.a] || 0) + (+r.q || 1); return; }
        let n = r.n || "", u = "шт.";
        if (r.a === "своя строка") { const k = n.lastIndexOf(", "); if (k > 0) { u = n.slice(k + 2); n = n.slice(0, k); } } else if (r.a) n = `${r.a} ${n}`;
        extra.push({ n, u, q: +r.q || 1, b: r.b ?? null, d: 0 });
      });
      return { items, extra, ld: {}, d: null, doc: "" };
    };
    // заменить текущий список: у сотрудника с открытой правкой — спрашиваем, только если есть несохранённое, и называем документ
    const replaceOk = what => {
      const m = smGet();
      if (staff && m && m.edit) return !dirty(m) || confirm(`Сейчас открыта правка ${edName(m)} — несохранённые изменения пропадут. Продолжить?`);
      return !(Object.keys(load()).length || (m && (m.extra || []).length)) || confirm(`Заменить текущий список для сметы ${what}?`);
    };
    const backHere = def => "/kabinet/" + (location.hash && location.hash !== "#" ? location.hash : def);
    // открыть — всегда свежую версию с сервера (06.11.2026: после «Назад» открывалась версия до сохранения)
    const openSmeta = s => {
      const cur = smGet();
      if (staff && cur && cur.edit === "s" && +cur.id === +s.id && dirty(cur)) { location.href = "/smeta/"; return; }  // та же смета с несохранённым — продолжить
      if (!replaceOk("этой сметой")) return;
      save(obj(s.items)); docSet(s.doc);
      const x = { d: s.disc, id: s.id, uid: s.user_id, title: s.title, ld: obj(s.ld), extra: s.extra || [] };
      // сотрудник — в режиме правки: «Сохранить» на странице сметы пишет в эту же смету; чужая — с личной скидкой её владельца
      if (staff) Object.assign(x, { edit: "s", who: s.name || "", wtg: +s.user_id !== +user.id, v: s.ver, k: tok(), back: backHere("#smetas"),
        ...(+s.user_id !== +user.id ? { ud: +s.udisc || 0 } : {}) });
      smSet(x);
      if (staff) { const y = smGet(); y.saved = sig(y); smSet(y); }
      location.href = "/smeta/";
    };
    const openLead = l => {
      const cur = smGet();
      if (staff && cur && cur.edit === "l" && +cur.lid === +l.id && dirty(cur)) { location.href = "/smeta/"; return; }
      if (!replaceOk("этой заявкой")) return;
      const sm = l.sm || {}, has = Object.keys(obj(sm.items)).length || (sm.extra || []).length, st = has ? sm : fromRows(jl(l.items));
      save(obj(st.items)); docSet(st.doc || "");
      const x = { lid: l.id, title: `Заявка №${l.id}`, d: st.d ?? null, ld: obj(st.ld), extra: st.extra || [] };
      // сотрудник — в режиме правки. Личная скидка — на момент заявки (sm.ud), а не сегодняшняя; сегодняшняя — для «Пересчитать» (udNow).
      // Заявка без кабинета — по розничным ценам
      if (staff) {
        const nm = [l.name, l.company].filter(Boolean).join(", ");
        Object.assign(x, { edit: "l", who: l.user_id ? nm : l.name || "", wtg: !!l.user_id, uid: l.user_id || 0, ph: l.phone || "",
          ud: l.user_id ? (st.ud ?? (+l.udisc || 0)) : 0, udNow: l.user_id ? +l.udisc || 0 : 0, v: l.ver, total: l.total, status: l.status, cm: l.comment || "",
          nt: l.note || "", nt0: l.note || "", who0: l.user_id ? nm : l.name || "", ph0: l.phone || "",
          had: !!(Object.keys(obj(st.items)).length || (st.extra || []).length), k: tok(), back: backHere("#leads") });
      }
      smSet(x);
      if (staff) { const y = smGet(); y.saved = sig(y); smSet(y); }
      location.href = "/smeta/";
    };
    // новая смета или заявка человеку из карточки или из поиска: пустой список и полоса «Новая смета для …» на странице сметы
    const newDoc = (kind, p, back) => {
      if (!replaceOk("новым документом")) return;
      save({}); docSet("");
      smSet({ edit: kind === "s" ? "ns" : "nl", who: p.name || "", uid: p.id || 0, ph: p.phone || "", wtg: !!p.id, ud: p.id ? (+p.discount || 0) : 0, title: "",
        k: tok(), back: back || (p.id || pkey(p.phone) ? "/kabinet/#p=" + (p.id ? "u" + p.id : "t" + pkey(p.phone)) : backHere("#leads")) });
      location.href = "/smeta/";
    };
    // сообщение сверху панели; после «Сохранить и вернуться» — итог сохранения и подсвеченная строка (GOV.UK notification banner)
    const panelMsg = (text, bad) => panel.insertAdjacentHTML("afterbegin", `<p class="msg ${bad ? "bad" : "ok"} kab-flash" role="status">${esc(text)}</p>`);
    const flash = () => {
      let f = null;
      try { f = JSON.parse(sessionStorage.getItem("hdl-flash")); sessionStorage.removeItem("hdl-flash"); } catch {}
      if (!f) return;
      panelMsg(f.text);
      if (f.warn) $(".kab-flash", panel)?.classList.add("warn");
      const b = f.lid ? $(`[data-lopen="${f.lid}"]`, panel) : f.sid ? $(`[data-open="${f.sid}"]`, panel) : null, tr = b && b.closest("tr");
      if (tr) { tr.classList.add("just-saved"); tr.scrollIntoView({ block: "center" }); }
    };
    // личная скидка клиента — правится прямо в карточке (GOV.UK Summary list «Изменить», МойСклад: скидка в карточке контрагента)
    const pdClick = async ev => {
      const sp = ev.target.closest("[data-pd]");
      if (!sp || !PERSON) return false;
      const p = PERSON;
      if (ev.target.closest("[data-pd-edit]")) {
        sp.innerHTML = `скидка <input type="number" min="0" max="50" step="0.5" data-pd-in value="${+p.discount || 0}" aria-label="Личная скидка, %"> % <button class="cbtn" type="button" data-pd-save>Сохранить</button> <button class="cbtn ghost" type="button" data-pd-cancel>Отмена</button> <span class="msg small" data-pd-msg role="status"></span>`;
        $("[data-pd-in]", sp).select();
      } else if (ev.target.closest("[data-pd-cancel]")) route();
      else if (ev.target.closest("[data-pd-save]")) {
        const v = Math.max(0, Math.min(50, Math.round((+String($("[data-pd-in]", sp).value).replace(",", ".") || 0) * 10) / 10));
        const r = await kabApi("user_set", { id: p.id, do: "set", discount: v }).catch(() => ({}));
        if (!r.ok) { const m = $("[data-pd-msg]", sp); m.className = "msg small bad"; m.textContent = r.status === 409 ? "Так нельзя" : "Не удалось сохранить"; return true; }
        people = null;
        try { sessionStorage.setItem("hdl-flash", JSON.stringify({ text: `Личная скидка ${v ? pct(v) : "убрана"} — сохранено в ${hhmm()}. Сметы без своей скидки считаются по ней; сохранённые заявки не меняются.` })); } catch {}
        route();
      }
      return true;
    };
    // деньги клиента (суперадмин, 07.11.2026): приходный ордер (сверх остатка — на баланс), зачёт аванса с баланса в заказ, выдача клиенту
    const PAYK = { in: ["Приходный ордер", 1], alloc: ["Зачёт аванса", -1], out: ["Выдача клиенту", -1] };
    const sgn = v => (v > 0.004 ? "+" : v < -0.004 ? "−" : "") + fm2(Math.abs(v));
    const parseAmt = v => Math.round(+String(v).replace(/[\s\u00a0]/g, "").replace(",", ".") * 100) / 100;
    const payBar = j => {
      const b = +j.balance || 0;
      return `<div class="pay-bar"><span class="pay-bal${b > 0.004 ? " pos" : b < -0.004 ? " neg" : ""}">Баланс клиента: <b>${sgn(b)} BYN</b></span>`
        + '<button class="btn ghost" type="button" data-pay-new="in">+ Приходный ордер</button>'
        + (b > 0.004 ? '<button class="btn ghost" type="button" data-pay-new="alloc">Отнести к заказу</button><button class="btn ghost" type="button" data-pay-new="out">Выдать клиенту</button>' : "")
        + '</div><div class="pay-box" data-pay-box hidden></div>';
    };
    const payTable = list => {
      let bal = 0;
      return `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Документ</th><th>Дата</th><th>Заказ</th><th class="num">Сумма, BYN</th><th class="num">Баланс, BYN</th><th></th></tr></thead><tbody>`
        + list.map(p => {
          bal += p.kind === "in" ? p.amount - p.to_lead : -p.amount;
          const ord = p.lead_id ? `№${p.lead_id}` + (p.kind === "in" && p.to_lead < p.amount - 0.004 ? `: ${fm2(p.to_lead)}` : "") : "—";
          return `<tr><td>${PAYK[p.kind][0]} ${esc(p.num)}${p.note ? `<br><span class="small">${esc(p.note)}</span>` : ""}<br><span class="muted small">провёл(а): ${esc(p.who || "—")}</span></td>`
            + `<td>${day(p.paid_on)}</td><td>${ord}</td><td class="num">${sgn(PAYK[p.kind][1] * p.amount)}</td><td class="num">${sgn(bal)}</td>`
            + `<td><button class="cbtn ghost" type="button" data-pay-del="${p.id}" data-pay-num="${esc(p.num)}">Удалить</button></td></tr>`;
        }).join("") + "</tbody></table></div>";
    };
    const payOpts = list => list.map(l => `<option value="${l.id}">Заявка №${l.id} от ${day(l.created_at)} — ${+l.total > 0 ? (l.pay === "paid" ? "оплачен" : "осталось " + fm2(payLeft(l)) + " BYN") : "сумма не задана"}</option>`).join("");
    const paySel = box => { const s = $("[data-pay-lead]", box), lid = s ? +s.value : 0; return [lid, SHOWN.leads.find(x => +x.id === lid)]; };
    const payDef = box => {  // сумма по умолчанию: выдача — весь баланс, зачёт — сколько хватает на остаток заказа
      const bal = SHOWN.balance, [, l] = paySel(box);
      return box.dataset.k === "alloc" && l && +l.total > 0 ? Math.min(bal, payLeft(l)) : bal;
    };
    const payHint = box => {  // приходный ордер: сколько в заказ, сколько на баланс
      const h = $("[data-pay-hint]", box);
      if (!h) return;
      const amt = parseAmt($("[data-pay-amt]", box).value), [lid, l] = paySel(box);
      const to = !lid ? 0 : l && +l.total > 0 ? Math.min(amt, payLeft(l)) : amt, rest = Math.round((amt - to) * 100) / 100;
      h.hidden = !(amt > 0) || (lid && !(rest > 0.004));
      h.textContent = !lid ? `${fm2(amt)} BYN ляжет на баланс клиента (аванс).` : `${fm2(to)} BYN уйдёт в оплату заявки №${lid}, ${fm2(rest)} BYN ляжет на баланс клиента.`;
    };
    const payClick = async ev => {
      const box = $("[data-pay-box]", panel), nb = ev.target.closest("[data-pay-new]");
      if (nb && box) {
        const k = nb.dataset.payNew, open = (SHOWN.leads || []).filter(l => l.pay !== "paid"), bal = SHOWN.balance;
        const title = { in: "Приходный ордер", alloc: "Отнести к заказу с баланса", out: "Выдать клиенту с баланса" }[k];
        const sel = k === "out" ? "" : `<label class="wide">Заказ<select data-pay-lead>${payOpts(open)}${k === "in" ? '<option value="0">Без заказа — на баланс клиента</option>' : ""}</select></label>`;
        box.dataset.k = k;
        box.innerHTML = `<h4>${title}</h4>` + (k !== "in" ? `<p class="muted small">На балансе ${fm2(bal)} BYN.</p>` : "")
          + (k === "alloc" && !open.length ? '<p>Неоплаченных заказов нет.</p><p class="acts"><button class="btn ghost" type="button" data-pay-x>Закрыть</button></p>'
            : `<div class="pay-f"><label>Дата<input type="date" data-pay-date value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}"></label>`
              + `<label>Сумма, BYN<input type="text" inputmode="decimal" data-pay-amt placeholder="1 250,00"></label>${sel}`
              + `<label class="wide">Комментарий<input type="text" maxlength="300" data-pay-note placeholder="${k === "out" ? "наличными / на карту, п/п №" : "наличные, кассовый чек / безнал, п/п №"}"></label></div>`
              + '<p class="pay-hint" data-pay-hint hidden></p>'
              + `<p class="acts"><button class="btn" type="button" data-pay-go>${k === "out" ? "Выдать" : "Провести"}</button> <button class="btn ghost" type="button" data-pay-x>Отмена</button> <span class="msg small" data-pay-msg role="status"></span></p>`);
        box.oninput = () => payHint(box);
        box.onchange = e => { if (e.target.closest("[data-pay-lead]") && k === "alloc") $("[data-pay-amt]", box).value = fm2(payDef(box)); payHint(box); };
        box.hidden = false;
        const a = $("[data-pay-amt]", box);
        if (a) { if (k !== "in") a.value = fm2(payDef(box)); a.focus(); }
        return true;
      }
      if (ev.target.closest("[data-pay-x]") && box) { box.hidden = true; box.innerHTML = ""; return true; }
      const go = ev.target.closest("[data-pay-go]");
      if (go && box) {
        const k = box.dataset.k, msg = $("[data-pay-msg]", box), [lid, l] = paySel(box), bal = SHOWN.balance, amt = parseAmt($("[data-pay-amt]", box).value);
        const bad = t => { msg.textContent = t; msg.className = "msg small bad"; return true; };
        if (!(amt > 0)) return bad("Впишите сумму.");
        if (k !== "in" && amt > bal + 0.005) return bad(`На балансе только ${fm2(bal)} BYN.`);
        if (k === "alloc" && l && +l.total > 0 && amt > payLeft(l) + 0.005) return bad(`По заявке №${lid} осталось ${fm2(payLeft(l))} BYN.`);
        go.disabled = true; msg.textContent = "Проводим…"; msg.className = "msg small";
        const r = await kabApi(k === "in" ? "pay_add" : k === "alloc" ? "pay_alloc" : "pay_out",
          { lead_id: lid, client: SHOWN.ckey, amount: amt, date: $("[data-pay-date]", box).value, note: $("[data-pay-note]", box).value }).catch(() => ({}));
        go.disabled = false;
        if (!r.ok) return bad(r.error === "balance" ? "На балансе не хватает — обновите страницу." : r.error === "left" ? "Сумма больше остатка по заказу." : "Не удалось провести — обновите страницу и попробуйте ещё раз.");
        const text = k === "in" ? `Приходный ордер ${r.num} проведён: ${fm2(r.amount)} BYN${lid ? ` по заявке №${lid}` : " на баланс клиента"}${lid && r.rest > 0.004 ? `, ${fm2(r.rest)} BYN — на баланс клиента` : ""}.`
          : k === "alloc" ? `Зачёт аванса ${r.num}: ${fm2(r.amount)} BYN с баланса отнесено к заявке №${lid}.` : `Выдача клиенту ${r.num}: ${fm2(r.amount)} BYN с баланса.`;
        try { sessionStorage.setItem("hdl-flash", JSON.stringify(lid ? { text, lid } : { text })); } catch {}
        route();
        return true;
      }
      const del = ev.target.closest("[data-pay-del]");
      if (del) {
        if (!confirm(`Удалить ${del.dataset.payNum}? Оплата и баланс клиента пересчитаются.`)) return true;
        const r = await kabApi("pay_del", { id: +del.dataset.payDel }).catch(() => ({}));
        if (!r.ok && r.error === "used") { alert(`Деньги из ${del.dataset.payNum} уже отнесены к заказу или выданы клиенту. Сначала удалите тот зачёт или выдачу.`); return true; }
        if (r.ok) try { sessionStorage.setItem("hdl-flash", JSON.stringify({ text: `${del.dataset.payNum} удалён.` })); } catch {}
        route();
        return true;
      }
      return false;
    };
    // расходные накладные (сотрудник, 07.11.2026)
    const shipTable = list => `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Накладная</th><th>Дата</th><th>Заказ</th><th>Что отгружено</th><th></th></tr></thead><tbody>`
      + list.map(s => `<tr><td>${esc(s.num)}${s.note ? `<br><span class="small">${esc(s.note)}</span>` : ""}<br><span class="muted small">провёл(а): ${esc(s.who || "—")}</span></td>`
        + `<td>${day(s.shipped_on)}</td><td>Заявка №${s.lead_id}</td><td>${s.lines.length} поз., ${s.lines.reduce((t, x) => t + x.q, 0)} шт.`
        + `<details><summary>Состав</summary><ul>${s.lines.map(x => `<li>${x.a && x.a !== "своя строка" ? esc(x.a) + " — " : ""}${esc(x.n)} × ${x.q}</li>`).join("")}</ul></details></td>`
        + `<td class="acts"><button class="cbtn ghost" type="button" data-ship-pdf="${s.id}">PDF</button> <button class="cbtn ghost" type="button" data-ship-del="${s.id}" data-ship-num="${esc(s.num)}">Удалить</button></td></tr>`).join("")
      + "</tbody></table></div>";
    const shipPrint = s => {  // накладная для печати: шапка, покупатель, основание, позиции, подписи — без цен
      // печать через скрытую рамку: без всплывающего окна, которое браузер может заблокировать; имя файла PDF — номер накладной
      const p = PERSON || {}, f = document.createElement("iframe");
      f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(f);
      const w = f.contentWindow;
      w.document.open();
      w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(s.num)}</title><style>body{font:14px/1.45 Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:6px 0 14px}table{width:100%;border-collapse:collapse;margin:14px 0}td,th{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eee}.n{text-align:right}.sig{display:flex;gap:40px;margin-top:40px}.sig div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:12px;color:#444}@media print{body{margin:10mm}}</style></head><body>`
        + `<div>ЧТУП «ОллВижн» · hdl.by · +375 (29) 370-20-20</div><h1>Расходная накладная ${esc(s.num)} от ${day(s.shipped_on)}</h1>`
        + `<div>Покупатель: <b>${esc(p.name || "—")}</b>${p.company ? ", " + esc(p.company) : ""}${p.phone ? ", " + esc(p.phone) : ""}</div><div>Основание: заявка №${s.lead_id}</div>${s.note ? `<div>Комментарий: ${esc(s.note)}</div>` : ""}`
        + `<table><tr><th>№</th><th>Артикул</th><th>Наименование</th><th class="n">Кол-во</th><th>Ед.</th></tr>${s.lines.map((x, i) => `<tr><td>${i + 1}</td><td>${x.a && x.a !== "своя строка" ? esc(x.a) : ""}</td><td>${esc(x.n)}</td><td class="n">${x.q}</td><td>шт.</td></tr>`).join("")}`
        + `<tr><td colspan="3"><b>Всего</b></td><td class="n"><b>${s.lines.reduce((t, x) => t + x.q, 0)}</b></td><td></td></tr></table>`
        + `<div class="sig"><div>Отпустил (подпись, ФИО)</div><div>Получил (подпись, ФИО)</div></div></body></html>`);
      w.document.close();
      const t0 = document.title;
      document.title = s.num;
      setTimeout(() => { w.focus(); w.print(); document.title = t0; setTimeout(() => f.remove(), 60000); }, 300);
    };
    const shipClick = async ev => {
      const box = $("[data-ship-box]", panel), nb = ev.target.closest("[data-ship-new]");
      if (nb && box) {
        const l = SHOWN.leads.find(x => +x.id === +nb.dataset.shipNew);
        if (!l) return true;
        box.dataset.lid = l.id;
        box.innerHTML = `<h4>Расходная накладная по заявке №${l.id}</h4><div class="pay-f"><label>Дата<input type="date" data-ship-date value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}"></label>`
          + `<label class="wide">Комментарий<input type="text" maxlength="300" data-ship-note placeholder="самовывоз / доставка, кто забрал"></label></div>`
          + `<div class="tbl-wrap"><table class="kab-tbl ship-tbl"><thead><tr><th>Позиция</th><th class="num">В заказе</th><th class="num">Отгружено раньше</th><th class="num">Отгрузить сейчас</th></tr></thead><tbody>`
          + l.ship_need.map(x => { const left = x.q - x.done;
            return `<tr><td>${x.a && x.a !== "своя строка" ? esc(x.a) + " — " : ""}${esc(x.n)}</td><td class="num">${x.q}</td><td class="num">${x.done}</td><td class="num">${left > 0 ? `<input type="number" min="0" max="${left}" step="1" value="${left}" data-ship-q="${esc(x.k)}" aria-label="Отгрузить сейчас">` : '<span class="muted">отгружено</span>'}</td></tr>`; }).join("")
          + `</tbody></table></div><p class="acts"><button class="btn" type="button" data-ship-go>Провести</button> <button class="btn ghost" type="button" data-ship-x>Отмена</button> <span class="msg small" data-ship-msg role="status"></span></p>`;
        box.hidden = false;
        box.scrollIntoView({ block: "start", behavior: "smooth" });
        return true;
      }
      if (ev.target.closest("[data-ship-x]") && box) { box.hidden = true; box.innerHTML = ""; return true; }
      const go = ev.target.closest("[data-ship-go]");
      if (go && box) {
        const msg = $("[data-ship-msg]", box), lid = +box.dataset.lid, bad = t => { msg.textContent = t; msg.className = "msg small bad"; return true; };
        const lines = $$("[data-ship-q]", box).map(i => ({ k: i.dataset.shipQ, q: Math.floor(+i.value || 0), max: +i.max })).filter(x => x.q > 0);
        if (lines.some(x => x.q > x.max)) return bad("Больше, чем осталось отгрузить, нельзя.");
        if (!lines.length) return bad("Впишите, сколько отгружаете.");
        go.disabled = true; msg.textContent = "Проводим…"; msg.className = "msg small";
        const r = await kabApi("ship_add", { lead_id: lid, date: $("[data-ship-date]", box).value, note: $("[data-ship-note]", box).value, lines: lines.map(({ k, q }) => ({ k, q })) }).catch(() => ({}));
        go.disabled = false;
        if (!r.ok) return bad(r.error === "more" ? "Больше, чем осталось отгрузить, — обновите страницу." : "Не удалось провести — обновите страницу и попробуйте ещё раз.");
        try { sessionStorage.setItem("hdl-flash", JSON.stringify({ text: `Расходная накладная ${r.num} проведена: ${r.n} поз., ${r.q} шт. по заявке №${lid}.`, lid })); } catch {}
        route();
        return true;
      }
      const pdf = ev.target.closest("[data-ship-pdf]");
      if (pdf) { const s = SHOWN.ships.find(x => +x.id === +pdf.dataset.shipPdf); if (s) shipPrint(s); return true; }
      const del = ev.target.closest("[data-ship-del]");
      if (del) {
        if (!confirm(`Удалить ${del.dataset.shipNum}? Отгрузка по заказу пересчитается.`)) return true;
        const r = await kabApi("ship_del", { id: +del.dataset.shipDel }).catch(() => ({}));
        if (r.ok) try { sessionStorage.setItem("hdl-flash", JSON.stringify({ text: `${del.dataset.shipNum} удалена.` })); } catch {}
        route();
        return true;
      }
      return false;
    };
    const listClicks = async ev => {
      if (await pdClick(ev)) return;
      if (await payClick(ev)) return;
      if (await shipClick(ev)) return;
      const o = ev.target.closest("[data-open]"), lo = ev.target.closest("[data-lopen]"), d = ev.target.closest("[data-del]"), nw = ev.target.closest("[data-new]");
      if (o || lo) {
        const b = o || lo;
        b.disabled = true;
        const j = await kabApi(o ? "smeta_get&id=" + encodeURIComponent(o.dataset.open) : "lead_get&id=" + encodeURIComponent(lo.dataset.lopen)).catch(() => ({}));
        b.disabled = false;
        if (!j.ok) { $(".kab-flash", panel)?.remove(); panelMsg(j.status === 404 ? "Не нашли: возможно, её удалили. Обновите страницу." : "Не удалось открыть — обновите страницу.", true); return; }
        return o ? openSmeta(j.smeta) : openLead(j.lead);
      }
      if (nw && PERSON) newDoc(nw.dataset.new, PERSON);
      if (d && confirm("Удалить смету из кабинета?")) { await kabApi("smeta_del", { id: +d.dataset.del }).catch(() => {}); route(); }
    };
    // смена состояния — только по «Подтвердить»; галка «Сообщить клиенту в Telegram» по умолчанию включена (владелец 07.11.2026)
    const statusChange = ev => {
      const s = ev.target.closest("[data-st]"); if (!s) return;
      const col = s.closest(".st-col"), conf = $(".st-conf", col), note = $(".st-note", col);
      note.hidden = true;
      if (s.value === s.dataset.prev) { conf.hidden = true; return; }
      const tg = !!s.dataset.tg, msg = s.value !== "new";
      conf.innerHTML = (msg ? `<label class="small${tg ? "" : " muted"}"><input type="checkbox" data-st-tg${tg ? " checked" : " disabled"}> сообщить в Telegram</label>${tg ? "" : '<span class="muted small">у клиента нет Telegram — позвоните</span>'}` : "")
        + '<span class="st-btns"><button class="cbtn" type="button" data-st-ok>Подтвердить</button><button class="cbtn ghost" type="button" data-st-x>Отмена</button></span>';
      conf.hidden = false;
    };
    panel.addEventListener("click", async ev => {
      const ok = ev.target.closest("[data-st-ok]"), x = ev.target.closest("[data-st-x]");
      if (!ok && !x) return;
      const col = (ok || x).closest(".st-col"), s = $("[data-st]", col), conf = $(".st-conf", col), note = $(".st-note", col);
      if (x) { s.value = s.dataset.prev; conf.hidden = true; return; }
      const notify = !!$("[data-st-tg]", conf)?.checked;
      ok.disabled = true;
      const r = await kabApi("lead_status", { id: +s.dataset.st, status: s.value, notify }).catch(() => ({}));
      ok.disabled = false;
      if (!r.ok) { note.className = "st-note small bad"; note.textContent = "Не сохранилось — обновите страницу."; note.hidden = false; return; }
      s.dataset.prev = s.value; conf.hidden = true;
      note.className = "st-note small ok";
      note.textContent = "✓ Сохранено" + (r.sent ? ", клиенту ушло сообщение в Telegram" : notify && r.tg ? ", но сообщение в Telegram не ушло" : "");
      note.hidden = false;
    });
    const pdKeys = ev => {  // Enter — сохранить, Esc — отмена
      if (!ev.target.closest("[data-pd-in]")) return;
      if (ev.key === "Enter") { ev.preventDefault(); $("[data-pd-save]", panel)?.click(); }
      if (ev.key === "Escape") route();
    };

    const tabSmetas = async () => {
      wait();
      const [j, tj] = await Promise.all([kabApi("smetas" + (staff ? "&all=1" : "")).catch(() => ({})), staff ? Promise.resolve({}) : kabApi("trips_my").catch(() => ({}))]);
      if (!j.ok) return failed();
      // расчёты командировочных, выложенные клиенту сотрудником (07.11.2026) — отдельным разделом над сметами
      const tl = tj.ok ? tj.trips : [], fm = v => Math.round(v).toLocaleString("ru-RU");
      const trips = tl.length ? `<h3 class="kab-sub">Командировочные расходы</h3><div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Расчёт</th><th>Объект</th><th class="num">Сумма</th><th>Обновлён</th><th></th></tr></thead><tbody>`
        + tl.map(t => `<tr><td><b>${esc(t.num)}</b></td><td>${esc(t.place || "—")}</td><td class="num">${fm(t.total)} BYN${t.vat ? '<br><span class="muted small">с НДС</span>' : ""}</td><td>${day(t.saved_at)}</td>`
          + `<td><a class="cbtn" href="/kabinet/komandirovki/#${encodeURIComponent(t.num)}">Открыть</a></td></tr>`).join("") + "</tbody></table></div>"
        + (j.smetas.length ? '<h3 class="kab-sub">Сметы</h3>' : "") : "";
      if (!j.smetas.length) { panel.innerHTML = trips + (tl.length ? "" : '<p>Сохранённых смет пока нет. Соберите список в <a href="/katalog/">каталоге</a>, затем на странице <a href="/smeta/">«Смета»</a> нажмите «Сохранить в кабинет».</p>'); return flash(); }
      SHOWN = { leads: [], smetas: j.smetas };
      panel.innerHTML = trips + smetaTable(j.smetas, staff) + smetaNote();
      panel.onclick = listClicks;
      flash();
    };

    // проекты (владелец 07.11.2026): папки объектов с компьютера AllVision, в каждой — сметы, сохранённые «Сохранить в проект»
    const tabProjects = async () => {
      wait();
      const j = await kabApi("projects").catch(() => ({}));
      if (!j.ok) return failed();
      SHOWN = { leads: [], smetas: j.smetas };
      const by = {};
      j.smetas.forEach(s => { (by[s.project] = by[s.project] || []).push(s); });
      const names = j.projects.concat(Object.keys(by).filter(n => !j.projects.includes(n)));  // папку убрали, а сметы в проекте остались — показываем
      const full = names.filter(n => by[n]), empty = names.filter(n => !by[n]);
      panel.innerHTML = (names.length ? "" : "<p>Список проектов ещё не пришёл с компьютера AllVision — он обновляется раз в 10 минут.</p>")
        + full.map(n => `<section class="kab-proj"><h3>${esc(n)} <span class="muted small">· ${by[n].length} ${by[n].length % 10 === 1 && by[n].length % 100 !== 11 ? "смета" : [2, 3, 4].includes(by[n].length % 10) && ![12, 13, 14].includes(by[n].length % 100) ? "сметы" : "смет"}${j.projects.includes(n) ? "" : " · папки на компьютере больше нет"}</span></h3>${smetaTable(by[n], true)}</section>`).join("")
        + (empty.length ? `<p class="muted small kab-proj-empty"><b>Без смет:</b> ${empty.map(esc).join(" · ")}</p>` : "")
        + '<p class="muted small">Проекты — папки «Объекты» на компьютере AllVision (папки на «_» не показываем). Смету в проект сохраняют на странице сметы кнопкой «Сохранить в проект»; копия файлом Excel ложится в папку объекта, в «Сметы с сайта», в течение 10 минут после каждого сохранения.'
        + (j.synced && j.synced.at ? ` Список проектов обновлён ${esc(j.synced.at.slice(8, 10) + "." + j.synced.at.slice(5, 7) + " " + j.synced.at.slice(11, 16))}.` : "") + "</p>";
      panel.onclick = listClicks;
      flash();
    };

    // командировочные бригады (владелец 07.11.2026): расчёты сотрудников с номерами КР-ГГГГ-NNN; сам расчёт — /kabinet/komandirovki/
    const tabTrips = async () => {
      wait();
      const j = await kabApi("trips").catch(() => ({}));
      if (!j.ok) return failed();
      const fm = v => Math.round(v).toLocaleString("ru-RU");
      const draw = q => {
        q = low(q.trim());
        const rows = j.trips.filter(t => !q || low([t.num, t.who, t.place, t.project, t.saved_at ? day(t.saved_at) : ""].join(" ")).includes(q));
        $("[data-trips-list]", panel).innerHTML = rows.length ? `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Номер</th><th>Клиент · объект</th><th>Проект</th><th class="num">Сумма</th><th>Сохранён</th><th>У клиента</th></tr></thead><tbody>`
          + rows.map(t => `<tr><td><a href="/kabinet/komandirovki/#${encodeURIComponent(t.num)}"><b>${esc(t.num)}</b></a>${t.version > 1 ? `<br><span class="muted small">ред. ${t.version}</span>` : ""}</td>`
            + `<td>${esc(t.who || "без клиента")}${t.place ? ` · ${esc(t.place)}` : ""}${t.dist ? `<br><span class="muted small">${fm(t.dist)} км</span>` : ""}</td><td>${esc(t.project || "—")}</td>`
            + `<td class="num">${fm(t.total)} BYN${t.vat ? '<br><span class="muted small">с НДС</span>' : ""}</td><td>${t.saved_at ? day(t.saved_at) : ""}${t.saved_by ? `<br><span class="muted small">${esc(t.saved_by)}</span>` : ""}</td>`
            + `<td>${t.pub ? `<span class="st ok">выложен</span><br><span class="muted small">${day(t.pub_at)}</span>` : '<span class="muted small">нет</span>'}</td></tr>`).join("")
          + "</tbody></table></div>" : `<p>${j.trips.length ? "Ничего не найдено." : "Расчётов пока нет."}</p>`;
      };
      panel.innerHTML = '<div class="kab-trips-top"><input type="search" data-trips-q placeholder="Поиск: номер, клиент, объект, дата" aria-label="Поиск расчётов"> <a class="btn" href="/kabinet/komandirovki/">Новый расчёт</a></div><div data-trips-list></div>'
        + '<p class="muted small">Расчёт командировочных и транспортных расходов бригады: питание, жильё, транспорт, прочие строки. Номер даётся при первом сохранении, каждое следующее сохранение — новая редакция того же номера.</p>';
      draw("");
      panel.oninput = ev => { if (ev.target.closest("[data-trips-q]")) draw(ev.target.value); };
      flash();
    };

    const tabLeads = async () => {
      wait();
      const j = await kabApi("leads").catch(() => ({}));
      if (!j.ok) return failed();
      if (!j.leads.length) { panel.innerHTML = staff ? "<p>Заявок пока нет.</p>" : "<p>Заявок пока нет. Заявки, отправленные с сайта после входа, появятся здесь вместе с их состоянием.</p>"; return flash(); }
      SHOWN = { leads: j.leads, smetas: [] };
      panel.innerHTML = leadTable(j.leads, staff) + leadNote();
      panel.onclick = listClicks;
      if (staff) panel.onchange = statusChange;
      flash();
    };

    // карточка человека (сотрудник): #p=u<номер> — пользователь кабинета, #p=t<телефон> — оставлял заявки без входа
    const tabPerson = async key => {
      wait();
      const j = await kabApi("person&" + (key[0] === "u" ? "uid=" : "phone=") + encodeURIComponent(key.slice(1))).catch(() => ({}));
      if (!j.ok) { panel.innerHTML = j.status === 404 ? "<p>Такого человека не нашли. Поищите по имени или телефону.</p>" : ""; if (j.status !== 404) failed(); else flash(); return; }
      const p = PERSON = j.person, blocked = p.status === "blocked";
      SHOWN = { leads: j.leads, smetas: j.smetas, pays: j.pays || [], balance: +j.balance || 0, ckey: j.ckey || "", ships: j.ships || [] };
      const disc = p.id ? `<span data-pd>${p.discount > 0 ? "скидка " + pct(p.discount) : "без скидки"}${blocked ? "" : ' <button class="cbtn ghost" type="button" data-pd-edit>Изменить</button>'}</span>` : "";
      const info = [p.phone && `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>`, p.company && esc(p.company), p.id ? esc(ROLE[p.role] || "") : "без кабинета на сайте",
        disc, p.tg_username && "@" + esc(p.tg_username), blocked && "заблокирован"].filter(Boolean).join(" · ");
      panel.innerHTML = `<div class="kab-person"><div><h2>${esc(p.name || "—")}</h2><p class="muted">${info}</p></div>`
        + (blocked ? "" : `<div class="acts">${p.id ? '<button class="btn" type="button" data-new="s">Новая смета</button>' : ""}<button class="btn${p.id ? " ghost" : ""}" type="button" data-new="l">Новая заявка</button></div>`) + "</div>"
        // сметы — над заявками, чтобы состояния заявок были снизу рядом с оплатами и отгрузками (владелец 07.11.2026)
        + (p.id ? "<h3>Сметы</h3>" + (j.smetas.length ? smetaTable(j.smetas, false) + smetaNote() : '<p class="muted">Смет нет.</p>')
          : '<p class="muted small">У человека нет кабинета на сайте: смету ему сохранить некуда. Оформите заявку и пошлите PDF.</p>')
        + "<h3>Заявки</h3>" + (admin && j.ckey ? payBar(j) : "") + '<div class="pay-box" data-ship-box hidden></div>'
        + (j.leads.length ? leadTable(j.leads, false, true) + '<p class="muted small pay-legend"><span class="pay-b paid">оплачен</span> <span class="pay-b part">частично</span> <span class="pay-b none">не оплачен</span></p>' : '<p class="muted">Заявок нет.</p>')
        + (admin && (j.pays || []).length ? "<h3>Движение денег</h3>" + payTable(j.pays) : "")
        + ((j.ships || []).length ? "<h3>Отгрузки</h3>" + shipTable(j.ships) : "");
      panel.onclick = listClicks;
      panel.onchange = statusChange;
      panel.onkeydown = pdKeys;
      flash();
    };

    // открыта правка, а сотрудник в кабинете — строка «Открыта правка заявки №12 (Иван): Продолжить · Закрыть» над вкладками
    const edBanner = () => {
      const el = $("[data-kab-ed]"), m = smGet();
      if (!el) return;
      el.hidden = !(staff && m && m.edit);
      if (el.hidden) return;
      el.innerHTML = `Открыта правка ${esc(edName(m))}${dirty(m) ? " — <b>есть несохранённые изменения</b>" : ""}: <a href="/smeta/">Продолжить</a> · <button class="cbtn ghost" type="button" data-ed-drop>Закрыть</button>`;
    };
    $("[data-kab-ed]")?.addEventListener("click", ev => {
      if (!ev.target.closest("[data-ed-drop]")) return;
      const m = smGet();
      if (m && dirty(m) && !confirm(`В правке ${edName(m)} есть несохранённые изменения. Закрыть без сохранения?`)) return;
      smSet(null); save({}); docSet(""); edBanner();  // сначала правка, потом список — шапка пересчитывается без неё
    });

    // поиск клиента (сотрудник): имя, телефон, компания, @ник. Список людей грузится один раз и обновляется раз в минуту; ищет страница
    const findBox = $("[data-kab-find]"), findIn = $("[data-kab-q]"), findRes = $("[data-kab-res]");
    let people = null, peopleAt = 0;
    const peopleLoad = async () => {
      if (people && Date.now() - peopleAt < 60000) return people;
      const j = await kabApi("people").catch(() => ({}));
      if (j.ok) { people = j.people; peopleAt = Date.now(); }
      return people || [];
    };
    const findDraw = async () => {
      const q = findIn.value.trim();
      if (q.length < 2) { findRes.hidden = true; return; }
      const list = await peopleLoad();
      if (findIn.value.trim() !== q) return;  // пока грузили, запрос сменился
      const toks = q.split(/\s+/).filter(Boolean), isPh = w => /^[+\d()\-]+$/.test(w) && /\d/.test(w);  // телефон — только слова из цифр и знаков
      let qd = toks.filter(isPh).join("").replace(/\D/g, "");
      if (/^80\d/.test(qd)) qd = "375" + qd.slice(2);  // 8029… — то же, что +37529…
      const words = toks.filter(w => !isPh(w)).map(w => low(w).replace(/^@/, "")).filter(w => w.length > 1);  // «@ivan», «petr1985» — целиком
      const hit = p => {
        const pd = String(p.phone || "").replace(/\D/g, ""), text = low([p.name, p.company, p.tg_username].join(" "));
        if (qd.length >= 3 && !(pd.includes(qd) || (qd.length >= 7 && pd.endsWith(qd.slice(-9))))) return false;
        return words.every(w => text.includes(w)) && (qd.length >= 3 || words.length > 0);
      };
      const found = list.filter(hit).sort((a, b) => (b.nl + b.ns) - (a.nl + a.ns)).slice(0, 8);
      const cnt = p => [p.nl && `заявок ${p.nl}`, p.ns && `смет ${p.ns}`].filter(Boolean).join(" · ") || "пусто";
      findRes.innerHTML = found.map(p => `<a href="#p=${p.id ? "u" + p.id : "t" + p.key}"><span><b>${esc(p.name || "—")}</b> <span class="muted small">${[esc(p.phone), esc(p.company), p.id ? esc(ROLE[p.role] || "") : "без кабинета"].filter(Boolean).join(" · ")}</span></span><span class="muted small">${cnt(p)}</span></a>`).join("")
        + (found.length ? "" : '<p class="muted small">Никого не нашли.</p>')
        + `<button class="cbtn ghost" type="button" data-find-new>Новая заявка: ${esc(q)}</button>`;
      findRes.hidden = false;
    };
    if (findBox) {
      let t = null;
      findIn.addEventListener("input", () => { clearTimeout(t); t = setTimeout(findDraw, 150); });
      findIn.addEventListener("focus", () => { peopleLoad(); if (findIn.value.trim().length > 1) findDraw(); });
      findRes.addEventListener("click", ev => {
        if (ev.target.closest("a")) { findRes.hidden = true; return; }
        if (!ev.target.closest("[data-find-new]")) return;
        const q = findIn.value.trim(), ph = (q.match(/\d/g) || []).length >= 7;  // цифры — это телефон, иначе имя
        newDoc("l", { id: 0, name: ph ? q.replace(/[+\d()\-\s]{7,}/g, "").trim() : q, phone: ph ? (q.match(/[+\d()\-\s]{7,}/) || [""])[0].trim() : "" }, backHere("#leads"));
      });
      document.addEventListener("click", ev => { if (!ev.target.closest("[data-kab-find]")) findRes.hidden = true; });
      findIn.addEventListener("keydown", ev => {
        if (ev.key === "Escape") findRes.hidden = true;
        if (ev.key === "Enter") { ev.preventDefault(); clearTimeout(t); findDraw().then(() => { if (!findRes.hidden) $("a", findRes)?.click(); }); }
      });
    }

    const tabUsers = async () => {
      wait();
      const j = await kabApi("users").catch(() => ({}));
      if (!j.ok) return failed();
      // категорию, суперадмина, подтверждение запросов и блокировку меняет суперадмин; сотрудник — только скидку (владелец 05.11.2026)
      const who = u => u.owner ? "суперадмин, владелец" : u.admin ? "суперадмин" : ROLE[u.role];
      // фильтр по категории (владелец 07.11.2026): кнопки с числом людей, выбор запоминается
      const UCAT = [["all", "Все", () => true], ["new", "Без прав", u => u.status !== "blocked" && u.role === "user" && !u.wanted], ["wait", "Запросы", u => !!u.wanted],
        ["client", "Клиенты", u => u.status !== "blocked" && u.role === "client"], ["dealer", "Дилеры", u => u.status !== "blocked" && u.role === "dealer"],
        ["staff", "Сотрудники", u => u.status !== "blocked" && u.role === "staff"], ["blocked", "Заблокированные", u => u.status === "blocked"]];
      let uf = "all"; try { uf = localStorage.getItem("hdl-kf") || "all"; } catch {}
      const ucnt = Object.fromEntries(UCAT.map(([k, , f]) => [k, j.users.filter(f).length]));
      if (!UCAT.some(c => c[0] === uf) || (uf !== "all" && !ucnt[uf])) uf = "all";  // в выбранной категории никого не осталось — все
      // сверху — у кого неоплаченные заказы, потом частично оплаченные, потом по числу активных; остальные — как отдал сервер (07.11.2026)
      const shown = j.users.filter(UCAT.find(c => c[0] === uf)[2]).map((u, i) => [u, i])
        .sort(([a, i], [b, k]) => (b.unpaid - a.unpaid) || (b.part - a.part) || (b.active - a.active) || i - k).map(([u]) => u);
      panel.innerHTML = `<div class="kab-cats" role="group" aria-label="Категория"><span class="muted small">Категория:</span>`
        + UCAT.filter(([k]) => k === "all" || ucnt[k] || k === "new").map(([k, t]) => `<button type="button" class="kab-cat${k === uf ? " on" : ""}" data-ucat="${k}" aria-pressed="${k === uf}">${t} <b>${ucnt[k]}</b></button>`).join("") + "</div>"
        + `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Кто</th><th>Категория</th><th class="num">Активных заказов</th><th>Скидка, %</th><th></th></tr></thead><tbody>`
        + shown.map(u => {
          const self = +u.id === +j.me, blocked = u.status === "blocked", edit = admin && !self && !u.owner;
          const info = [u.phone, u.company, u.unp && "УНП " + u.unp, u.status === "form" && "анкета не заполнена"].filter(Boolean).map(esc).join(" · ");
          const role = u.wanted ? `<span class="st wait">хочет: ${ROLE[u.wanted]}</span><br><span class="muted small">сейчас: ${ROLE[u.role]}</span>`
            : edit ? `<select data-role aria-label="Категория">${Object.entries(ROLE).map(([k, t]) => `<option value="${k}"${k === u.role ? " selected" : ""}>${t}</option>`).join("")}</select>`
              + (u.role === "staff" && !blocked ? `<label class="kab-adm"><input type="checkbox" data-adm${u.admin ? " checked" : ""}> суперадмин</label>` : "")
            : esc(who(u));
          const acts = u.wanted ? (admin ? '<button class="cbtn" type="button" data-do="approve">Подтвердить</button> <button class="cbtn ghost" type="button" data-do="reject">Отклонить</button>'
              : '<span class="muted small">Подтверждает суперадмин</span>')
            : '<button class="cbtn ghost" type="button" data-do="set">Сохранить</button>' + (edit ? ` <button class="cbtn ghost" type="button" data-do="${blocked ? "unblock" : "block"}">${blocked ? "Разблокировать" : "Заблокировать"}</button>` : "");
          return `<tr data-id="${u.id}"${blocked ? ' class="blocked"' : ""}><td><a href="#p=u${u.id}"><b>${esc(u.name || u.tg_name || "—")}</b></a>${u.tg_username ? ` · @${esc(u.tg_username)}` : ""}${blocked ? " · заблокирован" : ""}${u.role === "user" && !u.wanted && !blocked ? ' <span class="st new">без прав</span>' : ""}<br><span class="muted small">${info}</span></td>`
            + `<td>${role}</td><td class="num">${u.active ? `<a href="#p=u${u.id}"><b>${u.active}</b></a>` + (u.unpaid ? `<br><span class="pay-b none">${u.unpaid} не оплачено</span>` : "") + (u.part ? `<br><span class="pay-b part">${u.part} частично</span>` : "") : '<span class="muted">—</span>'}</td><td><input class="pct" type="number" min="0" max="50" step="0.5" value="${+u.discount || 0}" data-disc aria-label="Скидка, %"></td><td class="acts">${acts}<p class="msg small"></p></td></tr>`;
        }).join("") + '</tbody></table></div><p class="muted small">'
        + (admin ? "Все регистрируются пользователями — им доступны сметы и заявки. Категорию и скидку отмечаете вы, затем «Сохранить»; человеку придёт сообщение в Telegram. Клиент — ещё документы по объекту, дилер — цены дилера. Суперадмин — сотрудник, который тоже может блокировать и назначать категории."
          : "Вы можете менять скидку: впишите процент и нажмите «Сохранить», человеку придёт сообщение в Telegram. Категорию, блокировку и подтверждение запросов меняет суперадмин.")
        + " Скидка — процент от розничной цены, до 50 %, действует на всём сайте и в смете. Вверху — кому права ещё не отмечены.</p>";
      const send = async (tr, d, b) => {
        const msg = $(".msg", tr);
        if (b) b.disabled = true;
        const r = await kabApi("user_set", { id: +tr.dataset.id, do: d, discount: +$("[data-disc]", tr).value || 0, role: $("[data-role]", tr)?.value }).catch(() => ({}));
        if (b) b.disabled = false;
        if (!r.ok) { msg.className = "msg small bad"; msg.textContent = r.status === 409 ? "Так нельзя" : r.status === 403 ? "Нужны права суперадмина" : "Не удалось"; return; }
        const id = tr.dataset.id;
        await tabUsers();  // метка «без прав» и порядок — по новой категории
        const m = $(`tr[data-id="${id}"] .msg`, panel);
        if (m && d !== "block" && d !== "unblock") { m.className = "msg small ok"; m.textContent = "Сохранено"; }
      };
      panel.onclick = ev => {
        const c = ev.target.closest("[data-ucat]");
        if (c) { try { localStorage.setItem("hdl-kf", c.dataset.ucat); } catch {} return tabUsers(); }
        const b = ev.target.closest("[data-do]"); if (!b) return;
        if (b.dataset.do === "block" && !confirm("Заблокировать? Человек не сможет войти, пока его не разблокируют.")) return;
        send(b.closest("tr"), b.dataset.do, b);
      };
      panel.onchange = ev => {  // отметка «суперадмин» сохраняется сразу
        const c = ev.target.closest("[data-adm]"); if (!c) return;
        if (!confirm(c.checked ? "Сделать суперадмином? Он сможет блокировать пользователей и назначать категории." : "Снять права суперадмина?")) { c.checked = !c.checked; return; }
        send(c.closest("tr"), c.checked ? "admin" : "unadmin");
      };
    };

    // ---- этап 2: документы по объекту клиента (загружает сотрудник) и закрытые материалы сотрудников. Файлы отдаёт kab.php?a=file только тем, кому можно ----
    const size = n => n >= 1048576 ? String(Math.round(n / 104857.6) / 10).replace(".", ",") + " МБ" : Math.max(1, Math.round(n / 1024)) + " КБ";
    const fileLink = f => `<a href="/kab.php?a=file&id=${f.id}" target="_blank" rel="noopener">${esc(f.title || f.name)}</a> <span class="muted small">${esc((f.name.split(".").pop() || "").toUpperCase())} · ${size(f.size)} · ${day(f.created_at)}</span>`;
    const groups = (files, empty) => {
      const by = {};
      files.forEach(f => { (by[f.object || empty] = by[f.object || empty] || []).push(f); });
      return Object.keys(by).sort((a, b) => (a === empty) - (b === empty) || a.localeCompare(b, "ru")).map(k => [k, by[k]]);
    };
    const upload = (kind, j, people) => {
      const objects = [...new Set(j.files.map(f => f.object).filter(Boolean))];
      return `<form class="kab-up" data-up novalidate><h3>${kind === "doc" ? "Загрузить документы клиенту" : "Загрузить материалы"}</h3><div class="row3">`
        + (kind === "doc" ? `<label>Кому *<select name="user_id"><option value="">${people.length ? "— выберите клиента —" : "— нет клиентов: отметьте во вкладке «Пользователи» —"}</option>${people.map(u => `<option value="${u.id}">${esc(u.name || u.tg_name)}${u.company ? " · " + esc(u.company) : ""}${u.phone ? " · " + esc(u.phone) : ""}</option>`).join("")}</select></label>` : "")
        + `<label>${kind === "doc" ? "Объект" : "Раздел"}<input name="object" maxlength="120" list="kab-obj" placeholder="${kind === "doc" ? "Например: квартира, ул. Притыцкого" : "Например: прошивки, инструкции"}"></label>`
        + `<label>Название<input name="title" maxlength="160" placeholder="Если пусто — имя файла"></label></div><datalist id="kab-obj">${objects.map(o => `<option value="${esc(o)}">`).join("")}</datalist>`
        + `<label>Файлы *<input type="file" name="file" multiple></label>`
        + (kind === "doc" ? '<label class="consent"><input type="checkbox" name="notify" checked> Сообщить клиенту в Telegram</label>' : "")
        + `<p class="muted small">До ${size(j.max)} каждый: ${j.ext.join(", ")}.</p><button class="btn" type="submit">Загрузить</button><p class="msg" role="status"></p></form>`;
    };
    const sendFiles = async (form, kind, j, again) => {
      const msg = $(".msg", form), files = [...form.elements.file.files], user = form.elements.user_id?.value;
      if (kind === "doc" && !user) return bad(msg, "Выберите, кому загрузить.");
      if (!files.length) return bad(msg, "Выберите файлы.");
      const big = files.find(f => f.size > j.max);
      if (big) return bad(msg, `Файл «${big.name}» больше ${size(j.max)} — так много хостинг не принимает.`);
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      for (let k = 0; k < files.length; k++) {
        msg.className = "msg"; msg.textContent = `Загружаем ${k + 1} из ${files.length}…`;
        const fd = new FormData();
        fd.append("kind", kind); fd.append("file", files[k]); fd.append("object", form.elements.object.value);
        if (files.length === 1) fd.append("title", form.elements.title.value);
        if (kind === "doc") { fd.append("user_id", user); fd.append("notify", k === files.length - 1 && form.elements.notify.checked ? files.length : 0); }
        let r = {};
        try { const res = await fetch("/kab.php?a=upload", { method: "POST", credentials: "same-origin", headers: { "X-HDL": "1" }, body: fd }); r = await res.json(); } catch {}
        if (!r.ok) {
          btn.disabled = false;
          const why = { size: `больше ${size(r.max || j.max)}`, type: "такой тип файла не принимаем" }[r.error] || "не удалось загрузить";
          return bad(msg, `«${files[k].name}»: ${why}.` + (k ? ` Загружено ${k} из ${files.length}.` : ""));
        }
      }
      again();
    };
    const tabDocs = async () => {
      wait();
      if (!staff) {
        const j = await kabApi("files&kind=doc").catch(() => ({}));
        if (!j.ok) return failed();
        panel.innerHTML = j.files.length ? groups(j.files, "Без объекта").map(([o, fs]) => `<h3>${esc(o)}</h3><ul class="kab-files">${fs.map(f => `<li>${fileLink(f)}</li>`).join("")}</ul>`).join("")
          : "<p>Документов пока нет. Здесь появятся КП, схемы и паспорта по вашему объекту — их загружают наши сотрудники.</p>";
        return;
      }
      const [j, u] = await Promise.all([kabApi("files&kind=doc"), kabApi("users")]).catch(() => [{}, {}]);
      if (!j.ok || !u.ok) return failed();
      const people = u.users.filter(x => x.role === "client" && x.status === "active");  // документы — клиентам: «Документы» есть только у них
      panel.innerHTML = upload("doc", j, people) + (j.files.length
        ? `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Кому</th><th>Объект</th><th>Документ</th><th></th></tr></thead><tbody>${j.files.map(f => `<tr><td>${esc(f.uname || f.tg_name || "—")}${f.company ? `<br><span class="muted small">${esc(f.company)}</span>` : ""}</td><td>${esc(f.object || "—")}</td><td>${fileLink(f)}</td><td class="acts"><button class="cbtn ghost" type="button" data-fdel="${f.id}">Удалить</button></td></tr>`).join("")}</tbody></table></div>`
        : "<p>Документов пока нет.</p>");
      const form = $("[data-up]", panel);
      form.addEventListener("submit", ev => { ev.preventDefault(); sendFiles(form, "doc", j, tabDocs); });
      panel.onclick = async ev => { const d = ev.target.closest("[data-fdel]"); if (d && confirm("Удалить документ? Клиент перестанет его видеть.")) { await kabApi("file_del", { id: +d.dataset.fdel }).catch(() => {}); tabDocs(); } };
    };
    const tabMats = async () => {
      wait();
      const j = await kabApi("files&kind=mat").catch(() => ({}));
      if (!j.ok) return failed();
      panel.innerHTML = upload("mat", j, []) + (j.files.length
        ? groups(j.files, "Без раздела").map(([o, fs]) => `<h3>${esc(o)}</h3><ul class="kab-files">${fs.map(f => `<li>${fileLink(f)} <button class="cbtn ghost" type="button" data-fdel="${f.id}">Удалить</button></li>`).join("")}</ul>`).join("")
        : "<p>Материалов пока нет: схемы, прошивки, программы и инструкции для монтажников видят только сотрудники.</p>");
      const form = $("[data-up]", panel);
      form.addEventListener("submit", ev => { ev.preventDefault(); sendFiles(form, "mat", j, tabMats); });
      panel.onclick = async ev => { const d = ev.target.closest("[data-fdel]"); if (d && confirm("Удалить файл из материалов?")) { await kabApi("file_del", { id: +d.dataset.fdel }).catch(() => {}); tabMats(); } };
    };

    // ---- этап 3: ассортимент (владелец 05.11.2026). Сотрудник правит позицию или добавляет новую; на сайт — сборкой на компьютере AllVision
    // (cabinet_sync.py): ночью или по «Обновить сайт сейчас». Правка по артикулу, как в смете: цена — этого артикула (цвета), название,
    // описание и фото — всей карточки. Цена — розничная USD с НДС, как в прайсе; пустое поле — как в прайсе ----
    const GROUPS_K = JSON.parse(kab.dataset.groups || "{}");
    const PLAT_K = [["buspro", "HDL Buspro"], ["knx", "HDL KNX"], ["wireless", "HDL Buspro Wireless"]];
    const tabCat = async note => {
      wait();
      const j = await kabApi("cat_list").catch(() => ({}));
      if (!j.ok) return failed();
      const byArt = Object.fromEntries(j.edits.map(e => [e.art, e]));
      const when = s => s ? `${day(s)} ${s.slice(11, 16)}` : "";
      const pend = j.edits.filter(e => e.pending).length, req = j.request, last = j.last;
      const what = e => e.deleted ? "отменена — станет как в прайсе" : [e.is_new && `новая, ${esc(GROUPS_K[e.gnum] || "")}`, e.hidden && "скрыть с сайта",
        e.name && `название «${esc(e.name)}»`, e.price != null && `цена ${String(e.price).replace(".", ",")} USD`, e.about && "описание", e.photo && "фото"].filter(Boolean).join("; ");
      panel.innerHTML = '<div class="kab-cat">'
        + (j.ready ? "" : '<p class="msg bad">Компьютер сборки ещё не подключён: правки сохраняются, но на сайт попадут, когда владелец настроит ключ сборки.</p>')
        + (note ? `<p class="msg ok">${esc(note)}</p>` : "")
        + `<p>${pend ? `Ждут сборки: <b>${pend}</b>.` : "Все правки на сайте."}${last ? ` Последняя сборка: ${when(last.at)}${last.ok ? "" : ` — <span class="bad">не выложено: ${esc(last.note)}</span>`}.` : ""}</p>`
        + `<p class="cat-now"><button class="btn" type="button" data-cat-now${req ? " disabled" : ""}>${req ? `Запрошено ${when(req.at)}` : "Обновить сайт сейчас"}</button> `
        + `<span class="muted small">${req ? "Компьютер AllVision заберёт правки в течение 10 минут, если он включён." : "Без запроса правки уходят на сайт ночью."}</span></p>`
        + '<div class="kab-up"><h3>Найти позицию</h3><div class="cat-find"><input type="search" placeholder="Артикул или название" data-cat-q aria-label="Артикул или название"> '
        + '<button class="cbtn ghost" type="button" data-cat-new>+ Новая позиция</button></div><ul class="cat-hits" data-cat-hits></ul></div>'
        + '<form class="kab-up" data-cat-form hidden novalidate></form><h3>Правки</h3>'
        + (j.edits.length ? `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Артикул</th><th>Что меняется</th><th>Кто, когда</th><th>Состояние</th><th></th></tr></thead><tbody>`
          + j.edits.map(e => `<tr><td><b>${esc(e.art)}</b>${D.items[e.art] ? `<br><span class="muted small">${esc(D.items[e.art].n)}</span>` : ""}</td><td>${what(e)}</td>`
            + `<td>${esc(e.by || "")}<br><span class="muted small">${when(e.at)}</span></td><td><span class="st ${e.pending ? "wait" : "closed"}">${e.pending ? "ждёт сборки" : "на сайте"}</span></td>`
            + `<td class="acts">${e.deleted ? "" : `<button class="cbtn" type="button" data-cat-edit="${esc(e.art)}">Изменить</button> <button class="cbtn ghost" type="button" data-cat-del="${esc(e.art)}">Отменить</button>`}</td></tr>`).join("")
          + "</tbody></table></div>" : '<p class="muted">Правок пока нет.</p>')
        + '<p class="muted small">Цена — розничная в USD с НДС, как в прайсе; на сайте пересчитывается в BYN по курсу НБРБ. Пустое поле — как в прайсе. '
        + "Правка по артикулу: цена — этого артикула (цвета), название, описание и фото — всей карточки. «Отменить» возвращает позицию как в прайсе.</p></div>";
      const f = $("[data-cat-form]", panel), hits = $("[data-cat-hits]", panel);
      const priceIn = () => { const v = String(f.elements.price?.value || "").trim().replace(",", "."); return v === "" || isNaN(+v) ? null : +v; };
      const bynHint = () => { const p = priceIn(), el = $("[data-cat-byn]", f); if (el) el.textContent = p != null ? `На сайте будет ≈ ${fmt(Math.round(p * D.rate))} BYN по курсу ${String(D.rate).replace(".", ",")}.` : ""; };
      const form = (art, isNew) => {
        const e = byArt[art] || {}, it = D.items[art], cur = it ? (it.rb ?? it.b) : null, usd = cur != null ? (cur / D.rate).toFixed(2).replace(".", ",") : "";
        f.innerHTML = `<h3>${isNew ? "Новая позиция" : "Правка: " + esc(art)}</h3>`
          + (it ? `<p class="muted small">Сейчас на сайте: ${esc(it.n)}, ${cur != null ? `${fmt(cur)} BYN (≈ ${usd} USD)` : "по запросу"}. <a href="${esc(it.u)}" target="_blank" rel="noopener">Открыть карточку</a></p>` : "")
          + '<div class="row3">' + (isNew ? `<label>Артикул *<input name="art" maxlength="80" value="${esc(art || "")}"></label>` : `<input type="hidden" name="art" value="${esc(art)}">`)
          + `<label>Название${isNew ? " *" : ""}<input name="name" maxlength="200" value="${esc(e.name || "")}" placeholder="${it ? esc(it.n) : ""}"></label>`
          + `<label>Цена, USD с НДС<input name="price" inputmode="decimal" value="${e.price != null ? String(e.price).replace(".", ",") : ""}" placeholder="${isNew ? "пусто — по запросу" : usd ? "как в прайсе: " + usd : "по запросу"}"></label>`
          + (isNew ? `<label>Раздел *<select name="gnum"><option value="">— выберите —</option>${Object.entries(GROUPS_K).map(([k, t]) => `<option value="${k}"${k === e.gnum ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`
            + `<label>Система<select name="platform">${PLAT_K.map(([k, t]) => `<option value="${k}"${k === e.platform ? " selected" : ""}>${t}</option>`).join("")}</select></label>` : "")
          + `</div><label>Описание<textarea name="about" rows="4" maxlength="4000" placeholder="${isNew ? "Каждая строка — абзац." : "Пусто — как сейчас. Каждая строка — абзац."}">${esc(e.about || "")}</textarea></label>`
          + `<label>Фото${e.photo ? " — загружено, новое заменит его" : ", станет главным на карточке"}<input type="file" name="photo" accept=".jpg,.jpeg,.png,.webp"></label>`
          + (e.photo ? '<label class="consent"><input type="checkbox" name="drop_photo"> Убрать загруженное фото</label>' : "")
          + (isNew ? "" : `<label class="consent"><input type="checkbox" name="hidden"${e.hidden ? " checked" : ""}> Скрыть с сайта</label>`)
          + '<p class="muted small" data-cat-byn></p><button class="btn" type="submit">Сохранить</button> <button class="btn ghost" type="button" data-cat-close>Закрыть</button><p class="msg" role="status"></p>';
        f.dataset.new = isNew ? "1" : "";
        f.hidden = false; bynHint(); f.scrollIntoView({ block: "start" });
      };
      panel.oninput = ev => {
        if (ev.target.closest("[data-cat-q]")) {
          const q = low(ev.target.value.trim()), qa = q.replace(/[^a-z0-9а-я]/g, "");
          const found = q.length < 2 ? [] : Object.entries(D.items).filter(([a, it]) => low(a).replace(/[^a-z0-9а-я]/g, "").includes(qa) || low(it.n).includes(q)).slice(0, 15);
          hits.innerHTML = found.map(([a, it]) => `<li><span><b>${esc(a)}</b> ${esc(it.n)} · ${(it.rb ?? it.b) != null ? fmt(it.rb ?? it.b) + " BYN" : "по запросу"}</span> <button class="cbtn" type="button" data-cat-edit="${esc(a)}">Изменить</button></li>`).join("")
            || (q.length >= 2 ? '<li class="muted">Не нашлось. Новая позиция — кнопкой «+ Новая позиция».</li>' : "");
        }
        if (ev.target.name === "price") bynHint();
      };
      panel.onclick = async ev => {
        const ed = ev.target.closest("[data-cat-edit]"), del = ev.target.closest("[data-cat-del]");
        if (ed) form(ed.dataset.catEdit, !!(byArt[ed.dataset.catEdit]?.is_new));
        if (ev.target.closest("[data-cat-new]")) form("", true);
        if (ev.target.closest("[data-cat-close]")) f.hidden = true;
        if (del && confirm(`Отменить правку ${del.dataset.catDel}? Позиция станет как в прайсе${byArt[del.dataset.catDel]?.is_new ? " (новая — исчезнет с сайта)" : ""}.`)) {
          const r = await kabApi("cat_del", { art: del.dataset.catDel }).catch(() => ({}));
          tabCat(r.ok ? "Правка отменена." : "");
        }
        if (ev.target.closest("[data-cat-now]")) {
          const r = await kabApi("rebuild", {}).catch(() => ({}));
          tabCat(r.ok ? "Запрос отправлен: компьютер AllVision соберёт и выложит сайт в течение 10 минут, если он включён." : "");
        }
      };
      f.onsubmit = async ev => {
        ev.preventDefault();
        const msg = $(".msg", f), btn = $("button[type=submit]", f), isNew = !!f.dataset.new, art = f.elements.art.value.trim();
        // артикул уже на сайте — это правка, а не новая позиция (своя новая после сборки — правка её же)
        if (isNew && D.items[art] && !byArt[art]?.is_new) { msg.className = "msg bad"; msg.textContent = "Такой артикул уже есть на сайте — найдите его поиском и нажмите «Изменить»."; return; }
        const fd = new FormData(f);
        if (isNew) fd.append("is_new", "1");
        btn.disabled = true; msg.className = "msg"; msg.textContent = "Сохраняем…";
        let r = {};
        try { const x = await fetch("/kab.php?a=cat_set", { method: "POST", credentials: "same-origin", headers: { "X-HDL": "1" }, body: fd }); r = Object.assign({ status: x.status }, await x.json()); } catch {}
        btn.disabled = false;
        if (!r.ok) {
          msg.className = "msg bad";
          msg.textContent = { new: "Укажите артикул, название и раздел.", photo: "Фото — jpg, png или webp.", nothing: "Нечего сохранять: заполните хотя бы одно поле или отметьте «Скрыть с сайта»." }[r.error]
            || (r.status === 413 ? "Фото слишком большое." : "Не удалось сохранить.");
          return;
        }
        tabCat(`Сохранено: ${art}. На сайте — после сборки.`);
      };
    };

    const tabProfile = () => {
      panel.innerHTML = "";
      setupForm(false);
      panel.appendChild(form);
      form.hidden = false;
      if (!staff) panel.insertAdjacentHTML("beforeend", '<p class="kab-del"><button class="cbtn ghost" type="button" data-forget>Удалить мои данные</button></p>');
      panel.onclick = async ev => {
        if (!ev.target.closest("[data-forget]") || !confirm("Удалить ваши данные и сметы из кабинета? Отправленные заявки останутся у нас без привязки к вам.")) return;
        const r = await kabApi("delete_me", {}).catch(() => ({}));
        if (r.ok) out();
      };
    };

    const route = () => {
      panel.onclick = panel.onchange = panel.oninput = panel.onkeydown = null;
      if (!user) return showLogin();
      if (user.status === "form") { main.before(form); setupForm(true); return show(form); }
      show(main); head();
      // документы — клиентам (владелец 03.11.2026: у дилера их нет), материалы — только сотрудникам
      const tabs = staff ? [["users", "Пользователи"], ["leads", "Заявки"], ["smetas", "Сметы"], ["projects", "Проекты"], ["trips", "Командировки"], ["cat", "Ассортимент"], ["docs", "Документы"], ["mats", "Материалы"], ["profile", "Мои данные"]]
        : [["smetas", "Сметы"], ["leads", "Заявки"], ...(user.role === "client" ? [["docs", "Документы"]] : []), ["profile", "Мои данные"]];
      // карточка человека из поиска: #p=u<номер> или #p=t<телефон> — вкладки без выбранной (владелец 06.11.2026)
      const pk = staff && /^#p=[ut]\d+$/.test(location.hash) ? location.hash.slice(3) : "";
      const cur = pk ? "" : (tabs.find(t => "#" + t[0] === location.hash) || tabs[0])[0];
      $("[data-kab-tabs]").innerHTML = tabs.map(([k, t]) => `<a href="#${k}" class="tab${k === cur ? " on" : ""}"${k === cur ? ' aria-current="page"' : ""}>${t}</a>`).join("");
      if (findBox) findBox.hidden = !staff;
      edBanner();
      PERSON = null;
      if (pk) return tabPerson(pk);
      ({ users: tabUsers, leads: tabLeads, smetas: tabSmetas, projects: tabProjects, trips: tabTrips, cat: tabCat, docs: tabDocs, mats: tabMats, profile: tabProfile })[cur]();
    };
    addEventListener("hashchange", () => { if (user && user.status !== "form") route(); });
    $("[data-kab-logout]").addEventListener("click", async () => {
      const m = smGet();  // правка с несохранённым — после выхода она пропадёт (на общем компьютере её нельзя оставлять)
      if (staff && m && m.edit && dirty(m) && !confirm(`В правке ${edName(m)} есть несохранённые изменения — после выхода они пропадут. Выйти?`)) return;
      await kabApi("logout", {}).catch(() => {});
      out();
    });
    const boot = () => kabApi("me").then(j => {
      if (j.ok) { user = j.user; staff = !!j.staff; admin = !!j.admin; remember(user); setAcc(user); }
      // личную скидку поменяли, а страница считает по старой (DISC берётся при загрузке) — один раз перезагрузить, как на других страницах
      const d = j.ok && j.user ? +j.user.discount || 0 : DISC;
      let again = "";
      try { again = sessionStorage.getItem("hdl-me-r"); } catch {}
      if (d !== DISC && again !== location.href) { try { sessionStorage.setItem("hdl-me-r", location.href); } catch {} location.reload(); return; }
      try { sessionStorage.removeItem("hdl-me-r"); } catch {}
      route();
    }).catch(route);
    boot();
    // «Назад» вернул кабинет из кэша браузера — списки и карточку заново с сервера (06.11.2026: открывалась версия до сохранения)
    addEventListener("pageshow", ev => { if (ev.persisted) { people = null; boot(); } });
  }

  // ---- снимки в интерьере (data-lb): просмотр поверх страницы вместо нового окна, стрелки листают снимки коллекции по кругу (владелец 03.11.2026).
  // Закрывают крестик, Esc, тёмный фон и «Назад» на телефоне: при открытии — запись в истории, закрытие её снимает ----
  const lbLinks = $$("a[data-lb]");
  if (lbLinks.length) {
    const box = document.createElement("div");
    box.className = "lb"; box.hidden = true;
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Просмотр фото");
    box.innerHTML = '<img alt=""><button type="button" class="lb-x" aria-label="Закрыть">✕</button>'
      + '<button type="button" class="lb-prev" aria-label="Предыдущее фото">‹</button><button type="button" class="lb-next" aria-label="Следующее фото">›</button><p class="lb-n"></p>';
    document.body.appendChild(box);
    const img = $("img", box), num = $(".lb-n", box);
    let list = [], at = 0, back = null;
    const show = i => {
      at = (i + list.length) % list.length;
      img.src = list[at].src; img.alt = list[at].alt;
      num.textContent = list.length > 1 ? `${at + 1} / ${list.length}` : "";
      if (list.length > 1) new Image().src = list[(at + 1) % list.length].src;  // следующий снимок — заранее
    };
    const open = a => {
      const seen = new Set();  // обложка коллекции — тот же снимок, что в галерее
      list = $$("a[data-lb]").filter(x => x.dataset.lb === a.dataset.lb && !seen.has(x.href) && seen.add(x.href)).map(x => ({ src: x.href, alt: $("img", x)?.alt || "" }));
      $$(".lb-prev, .lb-next", box).forEach(b => b.hidden = list.length < 2);
      show(list.findIndex(x => x.src === a.href));
      back = a; box.hidden = false; document.body.classList.add("lb-open");
      history.pushState({ lb: 1 }, "");
      $(".lb-x", box).focus();
    };
    const close = () => { box.hidden = true; img.removeAttribute("src"); document.body.classList.remove("lb-open"); back?.focus(); };
    const shut = () => { if (!box.hidden) history.back(); };
    addEventListener("popstate", () => { if (!box.hidden) close(); });
    lbLinks.forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); open(a); }));
    $(".lb-x", box).addEventListener("click", shut);
    $(".lb-prev", box).addEventListener("click", () => show(at - 1));
    $(".lb-next", box).addEventListener("click", () => show(at + 1));
    box.addEventListener("click", ev => { if (ev.target === box) shut(); });
    document.addEventListener("keydown", ev => {
      if (box.hidden) return;
      if (ev.key === "Escape") shut();
      else if (ev.key === "ArrowLeft") show(at - 1);
      else if (ev.key === "ArrowRight") show(at + 1);
    });
    let x0 = null;  // на телефоне — листать пальцем
    box.addEventListener("touchstart", ev => { x0 = ev.touches.length === 1 ? ev.touches[0].clientX : null; }, { passive: true });
    box.addEventListener("touchend", ev => {
      if (x0 === null || list.length < 2) return;
      const dx = ev.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1));
    });
  }
  // ---- «Умный дом: с чего начать» (владелец 04.11.2026): лампочки «реле, диммер, DALI» и конфигуратор жилья ----
  const lamps = $("[data-lamps]");
  if (lamps) {
    const l = n => $(`[data-l="${n}"]`, lamps), glow = (el, c, a) => { el.style.background = `rgba(${c},${a})`; el.style.boxShadow = a > .05 ? `0 0 ${Math.round(30 * a)}px ${Math.round(8 * a)}px rgba(${c},${(a * .55).toFixed(2)})` : "none"; };
    const rb = $("[data-relay]", lamps); let on = false;
    const p1 = () => { glow(l(1), "255,205,110", on ? 1 : 0); rb.textContent = on ? "Выключить" : "Включить"; };
    rb.addEventListener("click", () => { on = !on; p1(); }); p1();
    const dm = $("[data-dim]", lamps), p2 = () => glow(l(2), "255,205,110", dm.value / 100);
    dm.addEventListener("input", p2); p2();
    const db = $("[data-dali-b]", lamps), dk = $("[data-dali-k]", lamps), kv = $("[data-kv]", lamps);
    const p3 = () => { const t = (dk.value - 2800) / 3200, c = [255 - 55 * t, 176 + 46 * t, 90 + 165 * t].map(Math.round).join(","); glow(l(3), c, db.value / 100); kv.textContent = dk.value + " K"; };
    db.addEventListener("input", p3); dk.addEventListener("input", p3); p3();
  }

  // конфигуратор: по комнатам и желаниям — что человек получит и ориентир по оборудованию HDL Buspro по ценам каталога
  // (D.items, со скидкой дилера). Объёмы на комнату — ориентиры квартир из мозга [оценка], подбор модулей — как в КП: каналы с запасом ~10 %
  const cfgBox = $("[data-cfg]");
  if (cfgBox) {
    const C = JSON.parse(cfgBox.dataset.cfg), out = $("[data-cfg-out]", cfgBox), I = C.items;
    const st = { home: "flat", rooms: 2, baths: 1, n: {}, light: "dim", ac: 0, curt: 0, street: 0, water: 0, w: { heat: 1, leak: 1, pir: 1 } };
    const T = C.tk;
    // два вопроса, как в объявлении (владелец 04.11.2026: «легко запутаться… проще»): N комнат = гостиная + (N − 1) спален,
    // санузлов сколько указали, кухня и прихожая всегда; у дома ещё котельная и блок «Для дома и участка»
    const pick = (attr, v) => $$(`[data-${attr}]`, cfgBox).forEach(x => x.setAttribute("aria-checked", String(x.dataset[attr] === String(v))));
    const rooms = () => {
      st.n = { gost: 1, spal: st.rooms - 1, kuh: 1, van: st.baths, prih: 1, kot: st.home === "house" ? 1 : 0 };
      pick("rooms", st.rooms); pick("baths", st.baths);
    };
    // дом отличается участком (владелец 04.11.2026: «в доме уличный свет группы, автополив и т. д.»): по умолчанию 3 группы уличного света
    const setHome = h => {
      st.home = h; Object.assign(st, C.start[h]); st.street = h === "house" ? 3 : 0; st.water = 0; rooms();
      $("[data-houseonly]", cfgBox).hidden = h !== "house";
    };
    const it = role => D.items[I[role]] || {}, pr = role => it(role).b;
    const LIGHT = { relay: "вкл/выкл", dim: "с регулировкой яркости", dali: "с яркостью и оттенком" };
    const grp = n => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "группа" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "группы" : "групп");
    const calc = () => {
      const rs = C.rooms.filter(r => st.n[r.k] > 0), sum = f => rs.reduce((s, r) => s + f(r) * st.n[r.k], 0), W = k => !!st.w[k];
      const live = sum(r => r.live ? r.g : 0), serv = sum(r => r.live ? 0 : r.g);
      const heat = W("heat") ? sum(r => r.h) : 0, curt = st.curt, leak = W("leak") ? sum(r => r.l) : 0, pir = W("pir") ? sum(r => r.m) : 0;  // штор — сколько выбрали (владелец 04.11.2026)
      const screen = W("screen") && st.n.gost > 0 ? 1 : 0, panels = Math.max(0, sum(r => r.p) - screen);
      const L = [], add = (role, q) => { if (q > 0) L.push([role, q]); };
      // участок дома: уличный свет и зоны полива — по каналу реле, ворота и калитка — 2, подогрев дорожек — 1, котёл по команде системы — 1
      const H = st.home === "house", yard = H ? st.street + st.water + (W("gate") ? 2 : 0) + (W("paths") ? 1 : 0) + (W("heat") ? 1 : 0) : 0;
      let ch = Math.ceil((serv + (st.light === "relay" ? live : 0) + (leak ? 1 : 0) + yard) * 1.1);  // + кран на вводе воды
      const r = { r12: 0, r8: 0, r4: 0 }; while (ch > 8) { r.r12++; ch -= 12; } if (ch > 4) r.r8++; else if (ch > 0) r.r4++;
      let dc = Math.ceil((st.light === "dim" ? live : 0) * 1.1); const d = { d6: 0, d4: 0 }; while (dc > 4) { d.d6++; dc -= 6; } if (dc > 0) d.d4++;
      add("panel", panels); add("panel_k", panels); add("panel_fr", panels); add("screen", screen); add("screen_k", screen); add("screen_fr", screen);  // рамки — сразу
      Object.entries(r).forEach(([k, q]) => add(k, q)); Object.entries(d).forEach(([k, q]) => add(k, q));
      add("dali", st.light === "dali" && live ? Math.ceil(live * 4 / 64) : 0);  // ~4 светильника в группе, 64 адреса на линию DALI
      add("heat", Math.ceil(heat / 6)); add("tsens", heat); add("ir", Math.ceil(st.ac / 4)); add("irp", st.ac);
      add("motor", curt); add("leak", Math.ceil(leak / 4)); add("pir", pir);
      add("outsens", H && (st.street || W("paths")) ? 1 : 0);  // уличный датчик: свет в сумерках, подогрев в мороз
      add(W("voice") ? "gwhk" : "gw", 1);
      const mA = L.filter(([k]) => !["panel_k", "panel_fr", "screen_k", "screen_fr", "tsens", "irp"].includes(k)).reduce((s, [, q]) => s + q, 0) * 30 * 1.3;  // ~30 мА на устройство шины, запас 30 %
      if (mA <= 750) add("psu750", 1); else if (mA <= 1200) add("psu1200", 1); else add("psu2400", Math.ceil(mA / 2400));
      return { rs, heat, curt, leak, pir, screen, live, L };
    };
    const render = () => {
      const R = calc(), W = k => !!st.w[k];
      $("[data-acn]", cfgBox).textContent = st.ac; $("[data-curtn]", cfgBox).textContent = st.curt;
      $("[data-streetn]", cfgBox).textContent = st.street; $("[data-watern]", cfgBox).textContent = st.water;
      const H = st.home === "house", zon = n => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "зона" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "зоны" : "зон");
      const yard = H ? [st.street && `<li><b>Уличный свет</b>: ${grp(st.street)}, включается сам в сумерках</li>`,
        st.water && `<li><b>Автополив</b>: ${zon(st.water)} по расписанию и с телефона</li>`,
        W("gate") && "<li><b>Ворота и калитка</b>: открываются с телефона и кнопкой</li>",
        W("paths") && "<li><b>Подогрев дорожек и крыльца</b>: включается сам в мороз</li>",
        W("heat") && "<li><b>Котёл или тепловой насос</b>: включается, когда комнатам нужно тепло</li>"].filter(Boolean).join("") : "";
      const name = r => r.k === "gost" && st.rooms === 1 ? "Комната" : r.n;  // однокомнатная — одна «Комната»
      const list = R.rs.map(r => {
        const f = [grp(r.g) + " света " + (r.live ? LIGHT[st.light] : "вкл/выкл") + (W("pir") && r.m ? ", по движению" : "")];
        if (r.p) f.push(r.k === "gost" && R.screen ? "панель с экраном" : r.p === 2 ? "две панели: у входа и у кровати" : "кнопочная панель");
        if (W("heat") && r.h) f.push(r.k === "van" ? "тёплый пол к подъёму" : "своя температура");
        if (W("leak") && r.l) f.push("датчик протечки");
        return `<li><b>${esc(name(r))}${st.n[r.k] > 1 ? " × " + st.n[r.k] : ""}</b>: ${esc(f.join(", "))}</li>`;
      }).join("");
      const sc = [["Ушёл — пришёл", "Кнопка у двери выключает всё лишнее, вернулись — всё как было"], ["Отпуск", "Свет включается по расписанию, будто вы дома"]];
      sc.push(["Ночь", "Кнопка у кровати: днём полный свет, ночью мягкий"]);
      if (st.light !== "relay") sc.push(["Вечер", "Мягкий приглушённый свет одной кнопкой"]);
      if (st.curt || st.light !== "relay") sc.push(["Кино", st.curt ? "Шторы закрываются, свет приглушается" : "Свет приглушается до нужного уровня"]);
      if (W("heat") && st.n.van) sc.push(["Утро", "Тёплый пол в ванной к подъёму, свет мягко нарастает"]);
      if (W("leak") && R.leak) sc.push(["Протечка", "Вода перекрыта, на телефоне — где именно"]);
      if (st.light === "dali" && R.live) sc.push(["Циркадный свет", "Днём бодрящий холодный свет, вечером тёплый"]);
      if (W("heat") && st.ac) sc.push(["Климат заодно", "Батареи и кондиционер не спорят друг с другом"]);
      if (H && st.street) sc.push(["Вечер на участке", "В сумерках сам включается уличный свет"]);
      if (H && W("gate")) sc.push(["Приехали домой", "Ворота открываются с телефона, на участке включается свет"]);
      let total = 0, ask = 0;
      const rows = R.L.map(([role, q]) => {
        // шлюз HomeKit — цена по запросу: в ориентире считаем как обычный IP-шлюз, иначе галочка «Голосом» удешевляла бы ориентир
        const x = it(role), p0 = pr(role), p = p0 ?? (role === "gwhk" ? pr("gw") : null); if (p != null) total += p * q; if (p0 == null) ask++;
        return `<tr><td>${x.u ? `<a href="${x.u}">${esc(x.n || I[role])}</a>` : esc(I[role])}</td><td>${q}</td><td>${p0 != null ? fmt(p * q) + " BYN" : p != null ? "≈ " + fmt(p * q) + " BYN, по запросу" : "по запросу"}</td></tr>`;
      }).join("");
      // одна сумма, без коридора −10…+20 % (владелец 04.11.2026: «Да, одну сумму»): «под ключ» — сумма строк расшифровки,
      // ориентир по оборудованию — первая строка, чтобы числа сходились
      // «под ключ»: оборудование + работы и материалы 50 % от него (по опыту AllVision, guide.py TURNKEY)
      // оборудование — точная сумма по каталогу (как на странице комплекта), работы и материалы округлены до 10 BYN
      const tk = [["Оборудование HDL", Math.round(total)], ["Монтаж, кабель, щит с автоматами, настройка", Math.round(total * T.works / 10) * 10]];
      const eq = tk[0][1], all = tk.reduce((s, [, v]) => s + v, 0);
      out.innerHTML = `<p class="cfg-h"><span>✓</span>Ваш умный дом</p><ul class="cfg-list">${list}</ul>`
        + (yard ? `<p class="cfg-sub">Участок</p><ul class="cfg-list">${yard}</ul>` : "")
        + (st.curt ? `<p class="small">Шторы на моторе: ${st.curt}, открываются по кнопке, расписанию и в сценариях.</p>` : "")
        + (st.ac ? `<p class="small">Кондиционеры: ${st.ac}, управление с панелей и телефона.</p>` : "")
        + `<p class="cfg-sub">Ваши сценарии</p><div class="cfg-sc">${sc.map(([a, b]) => `<span><b>${esc(a)}</b>${esc(b)}</span>`).join("")}</div>`
        + (total ? `<div class="cfg-sum"><span>Ориентир по оборудованию HDL</span><b>${fmt(eq)} BYN</b>${ask ? "<small>Шлюз для Siri и Apple Home — цена по запросу, в ориентире — как у обычного шлюза.</small>" : ""}</div>` : "")
        + (total ? `<div class="cfg-sum cfg-tk"><span>Под ключ ориентировочно</span><b>${fmt(all)} BYN</b>`
          + `<ul>${tk.map(([a, v]) => `<li><span>${esc(a)}</span><b>${fmt(v)} BYN</b></li>`).join("")}</ul></div>` : "")
        + `<p class="muted small">Под ключ не входят: проект, штробы в стенах, обычные розетки, светильники и драйверы, термоприводы, датчики протечки и краны, карнизы и кондиционеры${H ? ", кабель по участку" : ""}${H && st.water ? ", клапаны полива" : ""}${H && W("gate") ? ", приводы ворот" : ""}${H && W("paths") ? ", греющий кабель" : ""}. Оборудование — по ценам каталога в BYN с НДС.</p>`
        // «Посмотреть комплект» — рядом с «Перенести в смету», открывает в новой вкладке страницу комплекта с фото и правкой количества (владелец 04.11.2026)
        + `<p class="cfg-btns"><button class="btn" type="button" data-cfg-lead>Получить точную смету</button> <button class="btn ghost" type="button" data-cfg-smeta>Перенести в смету</button>`
        + ` <a class="btn ghost" href="/umnyj-dom/komplekt/?k=${encodeURIComponent(R.L.map(([k, q]) => k + "*" + q).join(","))}" target="_blank" rel="noopener">Посмотреть комплект</a></p>`;
      void rows;
      out.dataset.sum = `${st.home === "house" ? "Дом" : "Квартира"}, комнат: ${st.rooms}${st.rooms === 6 ? "+" : ""}, санузлов: ${st.baths}. Свет: ${LIGHT[st.light]}.`
        + [["heat", "климат по комнатам"], ["leak", "протечка"], ["pir", "свет по движению"], ["screen", "экран"], ["voice", "голос: Алиса или Siri, Apple Home"]].filter(([k]) => W(k)).map(([, t]) => " " + t[0].toUpperCase() + t.slice(1) + ".").join("")
        + (st.curt ? ` Штор на моторе: ${st.curt}.` : "") + (st.ac ? ` Кондиционеров: ${st.ac}.` : "")
        + (H ? `${st.street ? ` Уличный свет: ${grp(st.street)}.` : ""}${st.water ? ` Автополив: ${zon(st.water)}.` : ""}${W("gate") ? " Ворота и калитка." : ""}${W("paths") ? " Подогрев дорожек." : ""}` : "")
        + (total ? ` Ориентир по оборудованию: ${fmt(eq)} BYN, под ключ ориентировочно: ${fmt(all)} BYN.` : "");
      cfgBox._L = R.L;
    };
    cfgBox.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.home) { $$("[data-home]", cfgBox).forEach(x => x.setAttribute("aria-checked", String(x === b))); setHome(b.dataset.home); }
      else if (b.dataset.light) { $$("[data-light]", cfgBox).forEach(x => x.setAttribute("aria-checked", String(x === b))); st.light = b.dataset.light; }
      else if (b.dataset.rooms) { st.rooms = +b.dataset.rooms; rooms(); }
      else if (b.dataset.baths) { st.baths = +b.dataset.baths; rooms(); }
      else if (b.dataset.ac) st.ac = Math.max(0, Math.min(12, st.ac + +b.dataset.ac));
      else if (b.dataset.curt) st.curt = Math.max(0, Math.min(20, st.curt + +b.dataset.curt));
      else if (b.dataset.street) st.street = Math.max(0, Math.min(20, st.street + +b.dataset.street));
      else if (b.dataset.water) st.water = Math.max(0, Math.min(20, st.water + +b.dataset.water));
      else if (b.hasAttribute("data-cfg-smeta")) {
        const s = load(); (cfgBox._L || []).forEach(([role, q]) => { s[I[role]] = (s[I[role]] || 0) + q; }); save(s);
        b.outerHTML = '<a class="btn ghost" href="/smeta/">В смете ✓ Открыть</a>'; return;
      } else if (b.hasAttribute("data-cfg-lead")) {
        const f = $("#zayavka form"), c = f && f.elements.comment;
        if (c) c.value = ("Конфигуратор: " + out.dataset.sum + (c.value ? "\n" + c.value : "")).slice(0, 1000);
        $("#zayavka").scrollIntoView({ behavior: "smooth" }); return;
      } else return;
      render();
    });
    cfgBox.addEventListener("change", ev => { const x = ev.target.closest("[data-w]"); if (x) { st.w[x.dataset.w] = x.checked; render(); } });    setHome("flat"); render();
  }

  // ---- комплект из конфигуратора (/umnyj-dom/komplekt/?k=роль*кол-во): фото, количество правится, блок питания и IP-шлюз не убираются,
  // перенос в смету (владелец 04.11.2026). Цены — каталога (D.items, со скидкой дилера) ----
  const kitp = $("[data-kitp]");
  if (kitp) {
    const K = JSON.parse(kitp.dataset.kitp), list = $("[data-kit-list]", kitp), q = {};
    (new URLSearchParams(location.search).get("k") || "").split(",").forEach(x => { const [r, n] = x.split("*"); if (K.items[r] && +n > 0) q[r] = Math.min(999, Math.round(+n)); });
    const lock = r => K.locked.includes(r), min = r => lock(r) ? 1 : 0;
    // к каждой панели — свой соединитель и рамка: меняем их вместе с числом панелей (отдельно их тоже можно поправить)
    const LINK = { panel: ["panel_k", "panel_fr"], screen: ["screen_k", "screen_fr"] };
    const set = (r, n) => { q[r] = Math.max(min(r), Math.min(999, n)); (LINK[r] || []).forEach(x => { if (x in q || q[r]) q[x] = q[r]; }); };
    const draw = () => {
      let total = 0, ask = 0;
      list.innerHTML = K.groups.map(([title, roles]) => {
        const rs = roles.filter(r => r in q); if (!rs.length) return "";
        return `<h2 class="kitp-h">${esc(title)}</h2><div class="kitp-rows">` + rs.map(r => {
          // шлюз HomeKit — цена по запросу: в итоге — как обычный IP-шлюз, как в конфигураторе (владелец 04.11.2026: «непонятно, что по запросу за плюс»)
          const a = K.items[r], it = D.items[a] || {}, p0 = it.b, p = p0 ?? (r === "gwhk" ? (D.items[K.items.gw] || {}).b : null), n = q[r];
          if (p != null) total += p * n; if (p0 == null && n > 0) ask++;
          return `<div class="kitp-row" data-r="${r}"><a class="kitp-img" href="${esc(it.u || "#")}" target="_blank" rel="noopener">${it.t ? `<img src="${esc(it.t)}" alt="" width="72" height="72" loading="lazy">` : ""}</a>`
            + `<div class="kitp-name"><a href="${esc(it.u || "#")}" target="_blank" rel="noopener">${esc(it.n || a)}</a><small>${esc(a.split(" · ")[0])}${lock(r) ? " · нужен всегда" : ""}</small></div>`
            + `<div class="kitp-price">${p0 != null ? fmt(p) + " BYN" : p != null ? "≈ " + fmt(p) + " BYN<br>по запросу" : "по запросу"}</div>`
            + `<div class="cfg-step"><button type="button" data-kq="-1" aria-label="Меньше"${n <= min(r) ? " disabled" : ""}>−</button><input type="number" min="${min(r)}" max="999" value="${n}" data-kn aria-label="Количество"><button type="button" data-kq="1" aria-label="Больше">+</button></div>`
            + `<div class="kitp-sum">${p != null ? (p0 == null ? "≈ " : "") + fmt(p * n) + " BYN" : "—"}</div></div>`;
        }).join("") + "</div>";
      }).join("");
      // под ключ — как в конфигураторе: оборудование + 50 % на монтаж, кабель, щит с автоматами и настройку (guide.py TURNKEY)
      total = Math.round(total); const works = Math.round(total * K.tk.works / 10) * 10;
      $("[data-kit-total]", kitp).textContent = fmt(total) + " BYN";
      $("[data-kit-ask]", kitp).hidden = !ask;
      $("[data-kit-tk]", kitp).textContent = fmt(total + works) + " BYN";
      $("[data-kit-works]", kitp).textContent = `Оборудование + ${fmt(works)} BYN: монтаж, кабель, щит с автоматами, настройка`;
      $("[data-kit-empty]", kitp).hidden = Object.values(q).some(n => n > 0);
    };
    kitp.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.kq) { const r = b.closest("[data-r]").dataset.r; set(r, q[r] + +b.dataset.kq); draw(); }
      else if (b.hasAttribute("data-kit-smeta")) {
        const s = load(); Object.entries(q).forEach(([r, n]) => { if (n > 0) s[K.items[r]] = (s[K.items[r]] || 0) + n; }); save(s);
        b.outerHTML = '<a class="btn" href="/smeta/">В смете ✓ Открыть смету</a>';
      }
    });
    kitp.addEventListener("change", ev => {
      const x = ev.target.closest("[data-kn]"); if (!x) return;
      const r = x.closest("[data-r]").dataset.r; set(r, Math.round(+x.value) || 0); draw();
    });
    draw();
  }

})();

// шапка «плавает», как на allvision.by (владелец 09.11.2026): прокрутка вниз — прячется, вверх — возвращается; не прячется, пока открыто меню, поиск или курсор над ней
(()=>{const t=document.querySelector("header.top");if(!t)return;const r=document.documentElement,hov=matchMedia("(hover:hover)");let y=scrollY;const busy=()=>t.matches(".nav-open,.open,.cat-open,.search-open")||!!t.querySelector('[aria-expanded="true"]')||(t.contains(document.activeElement)&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))||(hov.matches&&t.matches(":hover"))||r.classList.contains("nav-lock")||document.body.classList.contains("nav-lock");addEventListener("scroll",()=>{const c=scrollY,d=c-y;if(Math.abs(d)<6&&c>80)return;const a=d>0&&c>Math.max(80,t.offsetHeight)&&!busy();if(a!==t.classList.contains("away")){t.classList.toggle("away",a);r.classList.toggle("top-away",a);r.style.setProperty("--top-h",(a?0:t.offsetHeight)+"px");}y=c},{passive:true})})();
