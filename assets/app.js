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
  const disc = b => DISC ? Math.round(b * (1 - DISC / 100)) : b;
  const pct = d => String(d).replace(".", ",") + " %";
  if (DISC) {
    Object.values(D.items).forEach(it => { if (it.b != null) it.b = disc(it.b); });
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
  const topH = () => { const t = $(".top"); if (t) document.documentElement.style.setProperty("--top-h", t.offsetHeight + "px"); };
  topH();
  addEventListener("resize", topH);

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
  $$("[data-qty]").forEach(b => b.addEventListener("click", () => { qi.value = Math.max(1, (+qi.value || 1) + +b.dataset.qty); }));
  let beamOpt = () => "";  // угол и цвет света для строки сметы — задаёт блок «Угол луча» ниже
  if (add) add.addEventListener("click", () => {
    const a = add.dataset.add;
    if (!a) {  // светильник: исполнение ещё не выбрано
      const need = $("[data-need]");
      // красная подсказка и рамка вокруг исполнений; повторный щелчок снова встряхивает подсказку (владелец 03.11.2026: «было явно видно»).
      // В подсказке исполнения кнопками с ценой (уже со скидкой дилера): щелчок — в смету без драйвера (владелец 03.11.2026, вариант Б)
      if (need) {
        const box = $("[data-need-opts]", need);
        if (box && !box.children.length) box.innerHTML = $$(".variants button").map(b =>
          `<button type="button" data-a="${esc(b.dataset.a)}">${esc($("span", b)?.textContent || b.dataset.a)}${b.dataset.byn ? ` <span>· ${fmt(+b.dataset.byn)} BYN</span>` : ""}</button>`).join("");
        need.hidden = false;
        need.classList.remove("shake"); void need.offsetWidth; need.classList.add("shake");
        const v = $(".variants");
        v?.classList.add("need-pick");
        v?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }
    const s = load(), q = Math.max(1, +(qi?.value) || 1), d = add.dataset.add2, key = a + (add.dataset.opt || "");
    s[key] = (s[key] || 0) + q;
    if (d) s[d] = (s[d] || 0) + q;  // драйвер — по одному на светильник
    save(s);
    add.textContent = d ? "Добавлено с драйвером ✓" : "Добавлено ✓";
    setTimeout(() => { add.textContent = "В смету"; }, 1600);
  });
  $("[data-need-opts]")?.addEventListener("click", ev => {
    const b = ev.target.closest("button[data-a]"); if (!b || b.disabled) return;
    const s = load(), q = Math.max(1, +(qi?.value) || 1), key = b.dataset.a + beamOpt(b.dataset.a);
    s[key] = (s[key] || 0) + q;
    save(s);
    const t = b.innerHTML; b.textContent = "Добавлено ✓"; b.disabled = true;
    setTimeout(() => {
      b.innerHTML = t; b.disabled = false;
      $("[data-need]").hidden = true; $(".variants")?.classList.remove("need-pick");
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
    const pick = o => { opts.forEach(x => x.setAttribute("aria-checked", String(x === o))); show(); };
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
      $("[data-need]", ctl).hidden = true;
      $(".variants")?.classList.remove("need-pick");
      const lab = $("[data-art-l]"); if (lab) lab.textContent = "Артикул";  // до выбора исполнения там модель
      pick(opts.find(o => o.dataset.v === b.dataset.a) || opts.find(o => o.dataset.v === "*"));
    }));
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
    // смена исполнения и сброс «Без драйвера» — после обработчиков карточки
    document.addEventListener("click", ev => { if (ev.target.closest(".variants button, .ctl-opts button:not([data-x])")) setTimeout(() => render(true), 0); });
    render(true);
  }

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
      <tbody>${tr}</tbody><tfoot><tr><td class="hide-m"></td><td colspan="3">Итого с НДС${DISC ? `<br><span class="muted small">цены со скидкой ${pct(DISC)}</span>` : ""}${ask ? `<br><span class="muted small">без ${ask} поз. по запросу</span>` : ""}</td><td class="num">${fmt(sum)} BYN</td><td class="no-print"></td></tr></tfoot></table>
      <p class="muted small">Цены по курсу НБРБ ${String(D.rate).replace(".", ",")} на ${D.rateDate.split("-").reverse().join(".")}. Монтаж и настройка считаем отдельно.</p>`;
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
    // открыта ссылка на чужую смету: ?s=артикул*количество,…
    const shared = new URLSearchParams(location.search).get("s");
    if (shared) {
      const got = {};
      shared.split(",").forEach(x => { const [a, q] = x.split("*"); if (D.items[a] || D.items[a.split(" · ")[0]]) got[a] = Math.max(1, +q || 1); });
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
    // вошедшему — «Сохранить в кабинет»: смета откроется с любого устройства (вкладка «Сметы» в кабинете)
    const keep = $("[data-smeta-save]");
    if (keep && ME) {
      keep.hidden = false;
      keep.addEventListener("click", async () => {
        const title = window.prompt("Название сметы, например «Квартира, ул. Притыцкого»:", "");
        if (title === null) return;
        const j = await kabApi("smeta_save", { title, items: load() }).catch(() => ({}));
        tmsg.textContent = j.ok ? `Сохранено в кабинете: «${j.title}»` : j.status === 401 ? "Войдите в кабинет заново, затем сохраните." : "Не удалось сохранить.";
        setTimeout(() => { tmsg.textContent = ""; }, 5000);
      });
    }
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

  // ---- телефон: в пустом поле «+375 », дальше код оператора и номер по образцу +375 29 123-45-67; стёрли «+375» — любой номер как есть ----
  const BY = "+375 ";
  $$('input[name="phone"]').forEach(i => {
    i.addEventListener("focus", () => { if (!i.value) { i.value = BY; requestAnimationFrame(() => i.setSelectionRange(BY.length, BY.length)); } });
    i.addEventListener("blur", () => { if (i.value.trim() === "+375") i.value = ""; });
    i.addEventListener("input", ev => {
      if (!i.value.startsWith("+375") || (ev.inputType || "").startsWith("delete")) return;  // свой номер или стирание — не мешаем
      const d = i.value.slice(4).replace(/\D/g, "").slice(0, 9);
      i.value = BY + d.slice(0, 2) + (d.length > 2 ? " " + d.slice(2, 5) : "") + (d.length > 5 ? "-" + d.slice(5, 7) : "") + (d.length > 7 ? "-" + d.slice(7, 9) : "");
    });
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
    if (box) body.items = rows().map(({ a, q, it }) => ({ a, n: it.n, q, b: it.b }));
    btn.disabled = true; msg.textContent = "Отправляем…";
    try {
      const r = await fetch("/lead.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "fail");
      msg.textContent = "Спасибо! Заявка принята, перезвоним в рабочее время."; msg.classList.add("ok");
      f.reset();
      prefill(f);
      if (box) { save({}); renderSmeta(); }
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
    let user = null, staff = false;
    const show = el => [loginBox, form, main].forEach(x => { x.hidden = x !== el; });
    const bad = (el, t) => { el.className = "msg bad"; el.textContent = t; };
    const wait = () => { panel.innerHTML = '<p class="muted">Загружаем…</p>'; };
    const failed = () => { panel.innerHTML = '<p class="msg bad">Не удалось загрузить. Обновите страницу или войдите заново.</p>'; };
    const done = j => { user = j.user; staff = !!j.staff; remember(user); setAcc(user); route(); };
    const out = () => { remember(null); setAcc(null); user = null; staff = false; history.replaceState(null, "", location.pathname); route(); };

    const showLogin = async () => {
      show(loginBox);
      const msg = $("[data-kab-msg]"), slot = $("[data-tg-btn]");
      if (slot.childElementCount) return;
      const j = await kabApi("bot").catch(() => ({}));
      if (!j.ok) { bad(msg, "Вход временно недоступен. Позвоните: +375 29 370-20-20."); return; }
      window.hdlTgAuth = async tg => {
        msg.className = "msg"; msg.textContent = "Входим…";
        const r = await kabApi("login", tg).catch(() => ({}));
        if (r.ok) { msg.textContent = ""; done(r); }
        else bad(msg, r.error === "blocked" ? "Доступ закрыт. Позвоните: +375 29 370-20-20." : "Не получилось войти. Попробуйте ещё раз.");
      };
      const s = document.createElement("script");
      s.async = true; s.src = "https://telegram.org/js/telegram-widget.js?22";
      Object.assign(s.dataset, { telegramLogin: j.bot, size: "large", radius: "10", requestAccess: "write", onauth: "hdlTgAuth(user)" });
      slot.appendChild(s);
    };

    // анкета при первом входе; та же форма — во вкладке «Мои данные». Роль не выбирают: права отмечает сотрудник (владелец 03.11.2026)
    const setupForm = first => {
      $("h3", form).textContent = first ? "Расскажите о себе" : "Ваши данные";
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
      $("[data-kab-role]").textContent = " · " + ROLE[user.role] + (user.discount > 0 ? " · скидка " + pct(user.discount) : "");
      const p = $("[data-kab-pending]");
      p.hidden = !user.wanted;
      p.textContent = user.wanted ? `Запрос статуса «${ROLE[user.wanted]}» на рассмотрении. Когда сотрудник подтвердит, придёт сообщение в Telegram`
        + (user.wanted === "dealer" ? ", а цены на сайте станут дилерскими." : ".") : "";
    };

    const tabSmetas = async () => {
      wait();
      const j = await kabApi("smetas" + (staff ? "&all=1" : "")).catch(() => ({}));
      if (!j.ok) return failed();
      if (!j.smetas.length) { panel.innerHTML = '<p>Сохранённых смет пока нет. Соберите список в <a href="/katalog/">каталоге</a>, затем на странице <a href="/smeta/">«Смета»</a> нажмите «Сохранить в кабинет».</p>'; return; }
      const sum = items => Object.entries(items).reduce((s, [a, q]) => { const it = D.items[a] || D.items[a.split(" · ")[0]]; return it && it.b != null ? s + it.b * q : s; }, 0);
      panel.innerHTML = `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Смета</th>${staff ? "<th>Чья</th>" : ""}<th class="num">Позиций</th><th class="num">Сумма*</th><th>Обновлена</th><th></th></tr></thead><tbody>`
        + j.smetas.map(s => `<tr><td>${esc(s.title)}</td>${staff ? `<td>${esc(s.name)}${s.company ? `<br><span class="muted small">${esc(s.company)}</span>` : ""}</td>` : ""}`
          + `<td class="num">${Object.keys(s.items).length}</td><td class="num">${fmt(sum(s.items))} BYN</td><td>${day(s.updated_at)}</td>`
          + `<td class="acts"><button class="cbtn" type="button" data-open="${s.id}">Открыть</button>${+s.user_id === +user.id ? ` <button class="cbtn ghost" type="button" data-del="${s.id}">Удалить</button>` : ""}</td></tr>`).join("")
        + `</tbody></table></div><p class="muted small">* По сегодняшним ценам${DISC ? ` со скидкой ${pct(DISC)}` : ""}, без позиций «по запросу». «Открыть» заменяет текущий список для сметы.</p>`;
      panel.onclick = async ev => {
        const o = ev.target.closest("[data-open]"), d = ev.target.closest("[data-del]");
        if (o) {
          const s = j.smetas.find(x => String(x.id) === o.dataset.open);
          if (Object.keys(load()).length && !confirm("Заменить текущий список для сметы этой сметой?")) return;
          save(s.items); location.href = "/smeta/";
        }
        if (d && confirm("Удалить смету из кабинета?")) { await kabApi("smeta_del", { id: +d.dataset.del }).catch(() => {}); tabSmetas(); }
      };
    };

    const tabLeads = async () => {
      wait();
      const j = await kabApi("leads").catch(() => ({}));
      if (!j.ok) return failed();
      if (!j.leads.length) { panel.innerHTML = staff ? "<p>Заявок пока нет.</p>" : "<p>Заявок пока нет. Заявки, отправленные с сайта после входа, появятся здесь вместе с их состоянием.</p>"; return; }
      const list = l => { try { return JSON.parse(l.items || "[]"); } catch { return []; } };
      panel.innerHTML = `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>№</th><th>Дата</th>${staff ? "<th>Кто</th>" : ""}<th>Что</th><th>Состояние</th></tr></thead><tbody>`
        + j.leads.map(l => {
          const it = list(l);
          return `<tr><td>${l.id}</td><td>${day(l.created_at)}</td>`
            + (staff ? `<td>${esc(l.name || "—")}<br><a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>${l.role ? `<br><span class="muted small">${esc(ROLE[l.role] || "")}${l.company ? ", " + esc(l.company) : ""}</span>` : ""}</td>` : "")
            + `<td>${esc(l.topic || "Заявка")}${it.length ? ` · ${it.length} поз.${l.total ? ", " + fmt(+l.total) + " BYN" : ""}` : ""}${l.comment ? `<br><span class="muted small">${esc(l.comment)}</span>` : ""}`
            + (it.length ? `<details><summary>Состав</summary><ul>${it.map(x => `<li>${esc(x.a)} — ${esc(x.n)} × ${x.q}${x.b != null ? ", " + fmt(x.b * x.q) + " BYN" : ""}</li>`).join("")}</ul></details>` : "") + "</td>"
            + `<td>${staff ? `<select data-st="${l.id}" aria-label="Состояние заявки №${l.id}">${Object.entries(ST).map(([k, t]) => `<option value="${k}"${k === l.status ? " selected" : ""}>${t}</option>`).join("")}</select>`
              : `<span class="st ${esc(l.status)}">${ST[l.status] || esc(l.status)}</span>`}</td></tr>`;
        }).join("") + "</tbody></table></div>";
      if (staff) panel.onchange = async ev => {
        const s = ev.target.closest("[data-st]"); if (!s) return;
        const r = await kabApi("lead_status", { id: +s.dataset.st, status: s.value }).catch(() => ({}));
        s.classList.toggle("bad", !r.ok);
      };
    };

    const tabUsers = async () => {
      wait();
      const j = await kabApi("users").catch(() => ({}));
      if (!j.ok) return failed();
      panel.innerHTML = `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Кто</th><th>Роль</th><th>Скидка, %</th><th></th></tr></thead><tbody>`
        + j.users.map(u => {
          const self = +u.id === +j.me, blocked = u.status === "blocked";
          const info = [u.phone, u.company, u.unp && "УНП " + u.unp, u.status === "form" && "анкета не заполнена"].filter(Boolean).map(esc).join(" · ");
          const role = u.wanted ? `<span class="st wait">хочет: ${ROLE[u.wanted]}</span><br><span class="muted small">сейчас: ${ROLE[u.role]}</span>`
            : `<select data-role aria-label="Роль"${self ? " disabled" : ""}>${Object.entries(ROLE).map(([k, t]) => `<option value="${k}"${k === u.role ? " selected" : ""}>${t}</option>`).join("")}</select>`;
          const acts = u.wanted ? '<button class="cbtn" type="button" data-do="approve">Подтвердить</button> <button class="cbtn ghost" type="button" data-do="reject">Отклонить</button>'
            : '<button class="cbtn ghost" type="button" data-do="set">Сохранить</button>' + (self ? "" : ` <button class="cbtn ghost" type="button" data-do="${blocked ? "unblock" : "block"}">${blocked ? "Разблокировать" : "Заблокировать"}</button>`);
          return `<tr data-id="${u.id}"${blocked ? ' class="blocked"' : ""}><td><b>${esc(u.name || u.tg_name || "—")}</b>${u.tg_username ? ` · @${esc(u.tg_username)}` : ""}${blocked ? " · заблокирован" : ""}${u.role === "user" && !u.wanted && !blocked ? ' <span class="st new">без прав</span>' : ""}<br><span class="muted small">${info}</span></td>`
            + `<td>${role}</td><td><input class="pct" type="number" min="0" max="50" step="0.5" value="${+u.discount || 0}" data-disc aria-label="Скидка, %"></td><td class="acts">${acts}<p class="msg small"></p></td></tr>`;
        }).join("") + '</tbody></table></div><p class="muted small">Все регистрируются пользователями — им доступны сметы и заявки. Права отмечаете вы: роль и скидку, затем «Сохранить»; человеку придёт сообщение в Telegram. Клиент — ещё документы по объекту, дилер — цены дилера. Скидка — процент от розничной цены, до 50 %, действует на всём сайте и в смете. Вверху — кому права ещё не отмечены.</p>';
      panel.onclick = async ev => {
        const b = ev.target.closest("[data-do]"); if (!b) return;
        const tr = b.closest("tr"), msg = $(".msg", tr), d = b.dataset.do;
        if (d === "block" && !confirm("Заблокировать? Человек не сможет войти, пока его не разблокируют.")) return;
        b.disabled = true;
        const r = await kabApi("user_set", { id: +tr.dataset.id, do: d, discount: +$("[data-disc]", tr).value || 0, role: $("[data-role]", tr)?.value }).catch(() => ({}));
        b.disabled = false;
        if (!r.ok) { msg.className = "msg small bad"; msg.textContent = r.status === 409 ? "Себе так нельзя" : "Не удалось"; return; }
        const id = tr.dataset.id;
        await tabUsers();  // метка «без прав» и порядок — по новой роли
        const m = $(`tr[data-id="${id}"] .msg`, panel);
        if (m && d === "set") { m.className = "msg small ok"; m.textContent = "Сохранено"; }
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
      panel.onclick = panel.onchange = null;
      if (!user) return showLogin();
      if (user.status === "form") { main.before(form); setupForm(true); return show(form); }
      show(main); head();
      // документы — клиентам (владелец 03.11.2026: у дилера их нет), материалы — только сотрудникам
      const tabs = staff ? [["users", "Пользователи"], ["leads", "Заявки"], ["smetas", "Сметы"], ["docs", "Документы"], ["mats", "Материалы"], ["profile", "Мои данные"]]
        : [["smetas", "Сметы"], ["leads", "Заявки"], ...(user.role === "client" ? [["docs", "Документы"]] : []), ["profile", "Мои данные"]];
      const cur = (tabs.find(t => "#" + t[0] === location.hash) || tabs[0])[0];
      $("[data-kab-tabs]").innerHTML = tabs.map(([k, t]) => `<a href="#${k}" class="tab${k === cur ? " on" : ""}"${k === cur ? ' aria-current="page"' : ""}>${t}</a>`).join("");
      ({ users: tabUsers, leads: tabLeads, smetas: tabSmetas, docs: tabDocs, mats: tabMats, profile: tabProfile })[cur]();
    };
    addEventListener("hashchange", () => { if (user && user.status !== "form") route(); });
    $("[data-kab-logout]").addEventListener("click", async () => { await kabApi("logout", {}).catch(() => {}); out(); });
    kabApi("me").then(j => { if (j.ok) { user = j.user; staff = !!j.staff; remember(user); setAcc(user); } route(); }).catch(route);
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
})();
