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
  // название документа сметы («Коммерческое предложение»…) — идёт вместе со списком: по ссылке, из кабинета (владелец 05.11.2026)
  const DOC_KEY = "hdl-doc", DOC0 = "Список для сметы";
  const docGet = () => { try { return localStorage.getItem(DOC_KEY) || DOC0; } catch { return DOC0; } };
  const docSet = d => { try { if (d && d !== DOC0) localStorage.setItem(DOC_KEY, d); else localStorage.removeItem(DOC_KEY); } catch {} };
  // смета из кабинета (этап 2): { d — скидка в смете вместо личной (null — личная), id, uid — чья, title }. Приходит только из кабинета:
  // ссылкой скидку не передать. Список опустел или пришёл по ссылке — сбрасывается
  const SM_KEY = "hdl-sm";
  const smGet = () => { try { return JSON.parse(localStorage.getItem(SM_KEY)) || null; } catch { return null; } };
  const smSet = m => { try { if (m) localStorage.setItem(SM_KEY, JSON.stringify(m)); else localStorage.removeItem(SM_KEY); } catch {} };
  // скидка, по которой считается смета: скидка сметы, иначе личная. Сотрудник, открыв чужую смету или заявку, видит её с личной скидкой
  // клиента (m.ud), а не со своей
  const effD = () => { const m = smGet(); return m && m.d != null ? +m.d : m && m.ud != null ? +m.ud : DISC; };
  // сотрудник правит открытую из кабинета заявку (m.edit = "l", m.lid) или смету ("s", m.id) — владелец 06.11.2026
  const editing = () => { const m = smGet(); return STAFF && !!(m && m.edit); };
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
    const s = load(), q = Math.max(1, +(qi?.value) || 1), d = add.dataset.add2, key = a + (add.dataset.opt || "") + (nodrv ? " · без драйвера" : "");
    s[key] = (s[key] || 0) + q;
    if (d) s[d] = (s[d] || 0) + q;  // драйвер — по одному на светильник
    save(s);
    add.textContent = d ? "Добавлено с драйвером ✓" : nodrv ? "Добавлено без драйвера ✓" : "Добавлено ✓";
    setTimeout(() => { add.textContent = "В смету"; }, 1600);
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
    save(s);
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
  // строки сметы (владелец 05.11.2026): из каталога и свои — то, чего нет в каталоге (монтаж, кабель, щит). Скидка строки — своя
  // (m.ld[артикул], у своей строки d), иначе общая: скидка сметы m.d, иначе личная. Цена со скидкой — за штуку до рубля, как в каталоге
  const smLines = (items, m) => {
    m = m || {};
    const D0 = m.d != null ? +m.d : m.ud != null ? +m.ud : DISC, LD = m.ld || {};
    const ls = Object.entries(items).map(([a, q]) => { const it = itemOf(a); return { key: a, a, q, it, n: it.n, rb: it.rb ?? it.b, disc: LD[a] ?? D0 }; })
      .concat((m.extra || []).map((x, i) => ({ key: "~" + i, x, i, q: +x.q || 1, n: x.n, u: x.u, rb: x.b == null || x.b === "" ? null : +x.b, disc: x.d ?? D0 })));
    ls.forEach(l => {
      l.u1 = l.rb == null ? null : l.disc ? Math.round(l.rb * (1 - l.disc / 100)) : l.rb;
      l.t = l.u1 == null ? null : l.u1 * l.q;
      l.off = l.t == null ? 0 : l.rb * l.q - l.t;
    });
    return ls;
  };
  // строки для заявки — как их видит посетитель: цена за штуку уже со скидкой; свои строки — «своя строка», единица после запятой
  const leadRows = m => smLines(load(), m).map(l => ({ a: l.x ? "своя строка" : l.a, n: l.x ? `${l.n}, ${l.u || "шт."}` : l.n, q: l.q, b: l.u1 }));
  let PRINT = false;  // печать: без полей ввода, колонки скидки — только если она есть
  const renderSmeta = () => {
    if (!box) return;
    const r = rows(), m = smGet() || {}, n = r.length + (m.extra || []).length;
    $("[data-smeta-form]").hidden = !n || editing();  // правку заявки сохраняют в неё же, новой заявкой не отправляют
    $("[data-smeta-tools]").hidden = !n;
    renderHints(r);
    const di = $("[data-sm-d]");
    if (di && document.activeElement !== di) di.value = m.d != null ? m.d : "";
    if (!n) { if (!STAFF) smSet(null); box.innerHTML = '<p>Список пуст. Добавляйте позиции кнопкой «В смету» в <a href="/katalog/">каталоге</a> или загрузите готовый список артикулов.</p>'; return; }
    // скидка — расшифровкой: розничная цена, процент, сумма скидки по строке и всего (владелец 05.11.2026); «без скидки − скидка = итого» до рубля
    const ed = STAFF && !PRINT, D0 = effD(), ls = smLines(load(), m);
    const anyD = ls.some(l => l.t != null && l.disc > 0), showD = anyD || ed, pcts = new Set(ls.filter(l => l.t != null).map(l => +l.disc));
    const one = pcts.size === 1 ? [...pcts][0] : null, money = v => v != null ? fmt(v) + " BYN" : "по запросу";
    let sum = 0, full = 0, ask = 0;
    ls.forEach(l => { if (l.t != null) { sum += l.t; full += l.rb * l.q; } else ask++; });
    const tr = ls.map(l => {
      const own = !!l.x, k = esc(l.key);
      const dval = own ? (l.x.d ?? "") : ((m.ld || {})[l.a] ?? "");
      const dcell = l.rb == null ? "" : ed ? `<input class="pct-in" type="number" min="0" max="50" step="0.5" value="${dval}" placeholder="${D0 || 0}" ${own ? `data-x="${l.i}" data-f="d"` : `data-ld="${k}"`} aria-label="Скидка в строке, %">` : pct(l.disc);
      const name = own ? (ed ? `<input class="x-n" data-x="${l.i}" data-f="n" value="${esc(l.n)}" placeholder="Название, например: монтаж и настройка" maxlength="200" aria-label="Название"> <input class="x-u" data-x="${l.i}" data-f="u" value="${esc(l.u || "шт.")}" maxlength="20" aria-label="Единица">`
          : `${esc(l.n)}<br><span class="muted small">${esc(l.u || "шт.")}</span>`)
        : `<a href="${esc(l.it.u)}">${esc(l.n)}</a><br><span class="muted small">${esc(l.a)}</span>`;
      const qty = own ? (ed ? `<input class="x-q" type="number" min="1" value="${l.q}" data-x="${l.i}" data-f="q" aria-label="Количество">` : `${l.q}`)
        : `<div class="qty"><button type="button" data-d="-1" data-a="${k}" aria-label="Меньше">−</button><input type="number" min="1" value="${l.q}" data-set="${k}" aria-label="Количество"><button type="button" data-d="1" data-a="${k}" aria-label="Больше">+</button></div>`;
      const price = own && ed ? `<input class="x-b" data-x="${l.i}" data-f="b" inputmode="decimal" value="${l.rb ?? ""}" placeholder="цена, BYN" aria-label="Цена, BYN">` : money(l.rb);
      return `<tr${own ? ' class="own"' : ""}><td class="hide-m">${!own && l.it.t ? `<img src="${esc(l.it.t)}" alt="">` : ""}</td><td>${name}</td><td>${qty}</td><td class="num hide-m">${price}</td>`
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
    // название из списка: ссылку с придуманным заголовком («Счёт на оплату») сайт не примет
    const docBox = $("[data-doc]"), docH = $("[data-doc-h]"), title0 = document.title, staffMe = !!(ME && ME.role === "staff");
    let docs = null;  // названия с сервера; пока не пришли — «Список для сметы»
    const docShow = () => {
      const c = docs && docs.some(x => x.title === docGet()) ? docGet() : DOC0;
      docH.textContent = c;
      document.title = c === DOC0 ? title0 : `${c} от ${new Date().toLocaleDateString("ru-RU")}`;
      if (staffMe && docs) drawDocs(c);
      return c;
    };
    const drawDocs = c => {
      const one = docs.find(x => x.title === c);
      docBox.innerHTML = `<label>Название документа <select data-doc-sel>${[DOC0, ...docs.map(x => x.title)].map(t => `<option value="${esc(t)}"${t === c ? " selected" : ""}>${esc(t)}</option>`).join("")}<option value="+">+ Новое название…</option></select></label>`
        + (one ? ` <button class="cbtn ghost" type="button" data-doc-del="${one.id}">Убрать из списка</button>` : "")
        + '<span class="doc-new" data-doc-new hidden><input maxlength="80" placeholder="Например: Спецификация к договору" data-doc-in aria-label="Новое название"> <button class="cbtn" type="button" data-doc-add>Добавить</button></span><span class="msg small" data-doc-msg role="status"></span>';
      docBox.hidden = false;
    };
    const docSend = async (a, body) => {
      const r = await kabApi(a, body).catch(() => ({}));
      if (r.ok) { docs = r.titles; return true; }
      const m = $("[data-doc-msg]", docBox);
      m.className = "msg small bad"; m.textContent = r.status === 403 ? "Нужен вход сотрудника." : "Не удалось сохранить.";
      return false;
    };
    if (staffMe || sharedDoc || docGet() !== DOC0) kabApi("doc_titles").then(j => { if (j.ok) { docs = j.titles; docShow(); } }).catch(() => {});
    if (staffMe) {
      docBox.addEventListener("change", ev => {
        const s = ev.target.closest("[data-doc-sel]"); if (!s) return;
        if (s.value === "+") { $("[data-doc-new]", docBox).hidden = false; $("[data-doc-in]", docBox).focus(); return; }
        docSet(s.value); docShow();
      });
      docBox.addEventListener("click", async ev => {
        if (ev.target.closest("[data-doc-add]")) {
          const t = $("[data-doc-in]", docBox).value.trim().replace(/\s+/g, " ");
          if (!t) return $("[data-doc-in]", docBox).focus();
          if (await docSend("doc_title_add", { title: t })) { docSet(docs.some(x => x.title === t) ? t : DOC0); docShow(); }
        }
        const d = ev.target.closest("[data-doc-del]");
        if (d && confirm(`Убрать «${docH.textContent}» из списка названий для всех сотрудников?`) && await docSend("doc_title_del", { id: +d.dataset.docDel })) { docSet(DOC0); docShow(); }
      });
      docBox.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.closest("[data-doc-in]")) { ev.preventDefault(); $("[data-doc-add]", docBox).click(); } });
    }
    // открыта ссылка на чужую смету: ?s=артикул*количество,…&d=название документа
    if (shared) {
      const got = {};
      shared.split(",").forEach(x => { const [a, q] = x.split("*"); if (D.items[a] || D.items[a.split(" · ")[0]]) got[a] = Math.max(1, +q || 1); });
      const n = Object.keys(got).length, shareBox = $("[data-smeta-share]");
      history.replaceState(null, "", location.pathname);
      if (n && !Object.keys(load()).length) { save(got); docSet(sharedDoc); smSet(null); shareBox.textContent = `Смета открыта по ссылке: ${n} поз.`; shareBox.hidden = false; }
      else if (n) {
        shareBox.innerHTML = `По ссылке передана смета: ${n} поз. <button class="cbtn" type="button" data-share="replace">Заменить мой список</button> <button class="cbtn ghost" type="button" data-share="add">Добавить к моему</button>`;
        shareBox.hidden = false;
        shareBox.addEventListener("click", ev => {
          const m = ev.target.dataset.share; if (!m) return;
          const s = m === "add" ? load() : {};
          Object.entries(got).forEach(([a, q]) => { s[a] = (s[a] || 0) + q; });
          if (m === "replace") { docSet(sharedDoc); smSet(null); docShow(); }
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
    addEventListener("beforeprint", () => { PRINT = true; renderSmeta(); });
    addEventListener("afterprint", () => { PRINT = false; renderSmeta(); });
    // сотрудник (владелец 05.11.2026: «Скидку ручную не добавил. Добавить товары тоже нету»): общая скидка на всю смету, свой процент в строке,
    // «Добавить» из каталога прямо здесь и свои строки — то, чего нет в каталоге. Хранится в hdl-sm вместе со скидкой сметы
    const stBox = $("[data-sm-staff]");
    if (stBox && staffMe) {
      stBox.hidden = false;
      const dIn = $("[data-sm-d]", stBox), hitsEl = $("[data-sm-hits]", stBox);
      const mset = f => { const m = smGet() || {}; f(m); smSet(m); renderSmeta(); };
      const num = v => { v = String(v).trim().replace(",", "."); return v === "" || isNaN(+v) ? null : +v; };
      dIn.value = (smGet() || {}).d ?? "";
      dIn.addEventListener("input", () => mset(m => { const v = num(dIn.value); if (v == null) delete m.d; else m.d = Math.max(0, Math.min(50, v)); }));
      stBox.addEventListener("input", ev => {
        if (!ev.target.closest("[data-sm-q]")) return;
        const q = low(ev.target.value.trim()), qa = q.replace(/[^a-z0-9а-я]/g, "");
        const found = q.length < 2 ? [] : Object.entries(D.items).filter(([a, it]) => low(a).replace(/[^a-z0-9а-я]/g, "").includes(qa) || low(it.n).includes(q)).slice(0, 12);
        hitsEl.innerHTML = found.map(([a, it]) => `<li><span><b>${esc(a)}</b> ${esc(it.n)} · ${(it.rb ?? it.b) != null ? fmt(it.rb ?? it.b) + " BYN" : "по запросу"}</span> <button class="cbtn" type="button" data-sm-add="${esc(a)}">Добавить</button></li>`).join("")
          || (q.length >= 2 ? '<li class="muted">В каталоге не нашлось — добавьте своей строкой.</li>' : "");
      });
      stBox.addEventListener("click", ev => {
        const ad = ev.target.closest("[data-sm-add]");
        if (ad) { const s = load(); s[ad.dataset.smAdd] = (s[ad.dataset.smAdd] || 0) + 1; save(s); renderSmeta(); ad.textContent = `Добавлено: ${s[ad.dataset.smAdd]} шт.`; }
        if (ev.target.closest("[data-sm-own]")) {
          mset(m => { (m.extra = m.extra || []).push({ n: "", u: "шт.", q: 1, b: null }); });
          const ins = $$(".own .x-n", box); ins[ins.length - 1]?.focus();
        }
      });
      // правки в таблице — по «change»: таблица перерисовывается, а при наборе курсор не прыгает
      box.addEventListener("change", ev => {
        const ld = ev.target.closest("[data-ld]"), x = ev.target.closest("[data-x]");
        if (ld) mset(m => { m.ld = m.ld || {}; const v = num(ld.value); if (v == null) delete m.ld[ld.dataset.ld]; else m.ld[ld.dataset.ld] = Math.max(0, Math.min(50, v)); });
        if (x) mset(m => {
          const r = (m.extra || [])[+x.dataset.x], f = x.dataset.f;
          if (!r) return;
          if (f === "n" || f === "u") r[f] = x.value.trim();
          else if (f === "q") r.q = Math.max(1, Math.round(num(x.value) || 1));
          else { const v = num(x.value); r[f] = v == null ? null : Math.max(0, f === "d" ? Math.min(50, v) : v); }
        });
      });
      box.addEventListener("click", ev => { const xr = ev.target.closest("[data-xrm]"); if (xr) mset(m => { (m.extra || []).splice(+xr.dataset.xrm, 1); }); });
    }
    // правка заявки или сметы из кабинета (владелец 06.11.2026: «Сотрудник компании должен видеть все заказы, мог заходить и их редактировать»):
    // полоса сверху, «Сохранить изменения» пишет в ту же заявку или смету. Клиент видит новую версию в кабинете, по галочке — сообщение в Telegram.
    // Новая смета или заявка человеку из поиска в кабинете (m.edit «ns» / «nl»): «Создать» — и дальше обычная правка созданного
    const edBox = $("[data-sm-edit]");
    const backTo = m => "/kabinet/#" + (m.uid ? "p=u" + m.uid : m.ph && m.ph.replace(/\D/g, "").length >= 7 ? "p=t" + m.ph.replace(/\D/g, "").slice(-9) : m.edit === "s" || m.edit === "ns" ? "smetas" : "leads");
    const drawEdit = () => {
      const m = smGet() || {};
      edBox.hidden = !editing();
      if (edBox.hidden) return;
      const kind = m.edit, isNew = kind === "ns" || kind === "nl", tg = !!m.wtg;  // wtg: у человека есть кабинет (у своей сметы — нет смысла сообщать)
      const head = { l: "Правка заявки №" + esc(m.lid), s: "Правка сметы «" + esc(m.title || "") + "»", ns: "Новая смета", nl: "Новая заявка" }[kind] || "Правка";
      const forWho = isNew && !m.uid
        ? ' для <input data-ed-name maxlength="120" placeholder="Имя" value="' + esc(m.who || "") + '" aria-label="Имя"> <input data-ed-phone maxlength="40" placeholder="Телефон *" value="' + esc(m.ph || "") + '" aria-label="Телефон">'
        : m.who ? (isNew ? " для " : " · ") + esc(m.who) : "";
      edBox.innerHTML = `<p><b>${head}</b>${forWho}</p>`
        + (kind === "ns" ? `<p><label class="ed-title">Название сметы <input data-ed-title maxlength="120" placeholder="Например: квартира, ул. Притыцкого" value="${esc(m.title || "")}"></label></p>` : "")
        + `<p class="muted small">${isNew ? "Добавьте позиции из каталога или своей строкой, затем «Создать»." : "Меняйте количество, позиции, скидки и свои строки, затем «Сохранить изменения»."} Цены — по сегодняшнему каталогу и курсу`
        + `${m.d == null && m.ud ? `, с личной скидкой клиента ${pct(m.ud)}` : ""}. `
        + (m.uid || kind === "s" ? "Клиент увидит " + (isNew ? "документ" : "изменения") + " в своём кабинете.</p>" : "У человека нет кабинета на сайте: пошлите ему PDF или ссылку сами.</p>")
        + `<div class="ed-acts"><button class="btn" type="button" data-ed-save>${kind === "ns" ? "Создать смету" : kind === "nl" ? "Создать заявку" : "Сохранить изменения"}</button>`
        + (tg ? '<label class="consent"><input type="checkbox" data-ed-tg checked> Сообщить в Telegram</label>' : "")
        + `<button class="btn ghost" type="button" data-ed-close>${isNew ? "Отменить" : "Закрыть правку"}</button></div><p class="msg" data-ed-msg role="status"></p>`;
    };
    if (edBox && staffMe) {
      drawEdit();
      edBox.addEventListener("input", ev => {  // имя и телефон нового человека — сразу в память: не пропадут при переходе в каталог
        const n = ev.target.closest("[data-ed-name]"), p = ev.target.closest("[data-ed-phone]"), t = ev.target.closest("[data-ed-title]");
        if (n || p || t) { const m = smGet() || {}; if (n) m.who = n.value; if (p) m.ph = p.value; if (t) m.title = t.value; smSet(m); }
      });
      edBox.addEventListener("click", async ev => {
        const m = smGet() || {}, msg = $("[data-ed-msg]", edBox), kind = m.edit;
        const bad2 = t => { msg.className = "msg bad"; msg.textContent = t; };
        if (ev.target.closest("[data-ed-save]")) {
          if (!Object.keys(load()).length && !(m.extra || []).length) return bad2("Список пуст — добавьте позиции.");
          if (kind === "nl" && !m.uid && (String(m.ph || "").match(/\d/g) || []).length < 7) return bad2("Укажите телефон.");
          const tg = !!$("[data-ed-tg]", edBox)?.checked, btn = $("[data-ed-save]", edBox), doc = docH.textContent === DOC0 ? "" : docH.textContent;
          const base = { items: load(), ld: m.ld || {}, extra: m.extra || [], doc, notify: tg };
          let a, body;
          if (kind === "l") { a = "lead_save"; body = { ...base, id: m.lid, d: m.d ?? null, rows: leadRows(m) }; }
          else if (kind === "s") { a = "smeta_upd"; body = { ...base, id: m.id, d: m.d ?? null }; }
          else if (kind === "nl") { a = "lead_new"; body = { ...base, user_id: m.uid || 0, name: m.who || "", phone: m.ph || "", d: m.d ?? null, rows: leadRows(m) }; }
          else { a = "smeta_for"; body = { ...base, user_id: m.uid, title: m.title || "", disc: m.d ?? m.ud ?? 0, id: 0 }; }  // скидка в смете = видимая сейчас
          btn.disabled = true; msg.className = "msg"; msg.textContent = "Сохраняем…";
          const r = await kabApi(a, body).catch(() => ({}));
          btn.disabled = false;
          if (!r.ok) return bad2(r.error === "empty" ? "Список пуст — сохранять нечего." : r.error === "phone" ? "Укажите телефон." : r.error === "limit" ? "У человека уже 100 смет — пусть удалит старые."
            : r.status === 403 ? "Нужен вход сотрудника." : r.status === 404 ? "Не нашли: возможно, удалили или заблокировали." : "Не удалось сохранить.");
          // создали — дальше обычная правка созданного документа
          if (kind === "nl") smSet({ ...m, edit: "l", lid: r.id, title: `Заявка №${r.id}` });
          if (kind === "ns") smSet({ ...m, edit: "s", id: r.id, title: r.title, d: body.disc });
          if (isNewKind(kind)) { drawEdit(); renderSmeta(); }
          const m2 = $("[data-ed-msg]", edBox);
          m2.className = "msg ok";
          m2.textContent = (kind === "nl" ? `Заявка №${r.id} создана` : kind === "ns" ? `Смета «${r.title}» создана` : "Сохранено")
            + ` ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}.`
            + (tg ? (r.sent ? " Сообщение в Telegram отправлено." : " Сообщение в Telegram не ушло: человек не разрешил боту писать — сообщите сами.") : "");
        }
        if (ev.target.closest("[data-ed-close]")) {
          if (!confirm(isNewKind(kind) ? "Отменить? Список для сметы очистится." : "Закрыть правку? Несохранённые изменения пропадут, список для сметы очистится.")) return;
          const back = backTo(m);
          save({}); docSet(""); smSet(null); location.href = back;
        }
      });
    }
    function isNewKind(k) { return k === "ns" || k === "nl"; }
    // вошедшему — «Сохранить в кабинет»: смета откроется с любого устройства (вкладка «Сметы» в кабинете)
    const keep = $("[data-smeta-save]");
    if (keep && ME) {
      keep.hidden = false;
      keep.addEventListener("click", async () => {
        const title = window.prompt("Название сметы, например «Квартира, ул. Притыцкого»:", "");
        if (title === null) return;
        const sm = smGet() || {}, j = await kabApi("smeta_save", { title, doc: docH.textContent === DOC0 ? "" : docH.textContent, items: load(), ld: sm.ld, extra: sm.extra }).catch(() => ({}));
        tmsg.textContent = j.ok ? `Сохранено в кабинете: «${j.title}»` : j.status === 401 ? "Войдите в кабинет заново, затем сохраните." : "Не удалось сохранить.";
        setTimeout(() => { tmsg.textContent = ""; }, 5000);
      });
    }
    // этап 2 (владелец 05.11.2026): сотрудник сохраняет смету клиенту или дилеру — у человека в кабинете, со скидкой в смете вместо личной,
    // названием документа и сообщением в Telegram. Пока меняют скидку, таблица считает с ней — видно то, что увидит человек; закрыли без
    // сохранения — как было. Смета, открытая из кабинета, по умолчанию заменяет ту же смету человека
    const forBtn = $("[data-smeta-for]"), forBox = $("[data-for-box]");
    if (forBtn && staffMe) {
      forBtn.hidden = false;
      const ROLE_N = { user: "пользователь", client: "клиент", dealer: "дилер" }, F = forBox.elements;
      let people = null, before = null, saved = false;
      const pctIn = () => Math.max(0, Math.min(50, Math.round((+String(F.disc.value).replace(",", ".") || 0) * 10) / 10));
      const preview = () => { smSet({ ...(smGet() || {}), d: pctIn() }); renderSmeta(); };
      const syncReplace = () => {
        const same = !!(before && before.id && +F.user.value === +before.uid), l = $("[data-for-replace]", forBox);
        l.innerHTML = `<input type="checkbox" name="replace"${same ? " checked" : ""}> Заменить смету «${esc(before?.title || "")}» у этого человека`;
        l.hidden = !same;
      };
      forBtn.addEventListener("click", async () => {
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
          + `<label>Скидка в смете, %<input name="disc" type="number" min="0" max="50" step="0.5" value="${before?.d ?? ""}"></label></div>`
          + '<label class="consent" data-for-replace hidden></label><label class="consent"><input type="checkbox" name="notify" checked> Сообщить в Telegram</label>'
          + `<p class="muted small">Скидка в смете заменяет личную скидку человека. Название документа — «${esc(docH.textContent)}», меняется выше. Человек увидит смету в кабинете, во вкладке «Сметы».</p>`
          + '<button class="btn" type="submit">Сохранить для клиента</button> <button class="btn ghost" type="button" data-for-close>Закрыть</button><p class="msg" role="status"></p>';
        forBox.hidden = false;
        syncReplace();
        forBox.scrollIntoView({ block: "center" });
      });
      forBox.addEventListener("change", ev => {  // выбрали человека — скидка его личная, если это не его же открытая смета
        if (ev.target !== F.user) return;
        // общую скидку уже поставили на странице — она и остаётся; нет — подставляется личная выбранного человека
        if (!(before && before.id && +F.user.value === +before.uid) && (smGet() || {}).d == null) { const d = +(F.user.selectedOptions[0]?.dataset.d || 0); F.disc.value = d ? d : ""; }
        syncReplace(); preview();
      });
      forBox.addEventListener("input", ev => { if (ev.target === F.disc) preview(); });
      forBox.addEventListener("click", ev => {
        if (!ev.target.closest("[data-for-close]")) return;
        forBox.hidden = true;
        if (!saved) { const cur = smGet() || {}; if (before && before.d != null) cur.d = before.d; else delete cur.d; smSet(cur); renderSmeta(); }  // скидка — как была, строки не трогаем
      });
      forBox.addEventListener("submit", async ev => {
        ev.preventDefault();
        const msg = $(".msg", forBox), btn = $("button[type=submit]", forBox);
        if (!F.user.value) { msg.className = "msg bad"; msg.textContent = "Выберите, кому сохранить."; return; }
        const d = pctIn(), uid = +F.user.value, who = F.user.selectedOptions[0].textContent.split(" — ")[0];
        btn.disabled = true; msg.className = "msg"; msg.textContent = "Сохраняем…";
        const r = await kabApi("smeta_for", { user_id: uid, title: F.title.value, doc: docH.textContent === DOC0 ? "" : docH.textContent, disc: d,
          items: load(), ld: (smGet() || {}).ld, extra: (smGet() || {}).extra, id: F.replace?.checked && before?.id ? before.id : 0, notify: F.notify.checked }).catch(() => ({}));
        btn.disabled = false;
        if (!r.ok) { msg.className = "msg bad"; msg.textContent = r.error === "limit" ? "У человека уже 100 смет — пусть удалит старые." : r.status === 403 ? "Нужен вход сотрудника." : "Не удалось сохранить."; return; }
        saved = true;
        before = { ...(smGet() || {}), d, id: r.id, uid, title: r.title };
        smSet(before); renderSmeta(); syncReplace(); F.title.value = r.title;
        msg.className = "msg ok";
        msg.textContent = `Сохранено у «${who}»: «${r.title}».` + (F.notify.checked ? (r.sent ? " Сообщение в Telegram отправлено." : " Сообщение в Telegram не ушло: человек не разрешил боту писать — сообщите сами.") : "");
      });
    }
    $("[data-copy-link]").addEventListener("click", () => copy(location.origin + "/smeta/?s=" + Object.entries(load()).map(([a, q]) => encodeURIComponent(a) + "*" + q).join(",")
      + (docH.textContent !== DOC0 ? "&d=" + encodeURIComponent(docH.textContent) : ""), "Ссылка скопирована"));
    $("[data-copy-text]").addEventListener("click", () => copy(smLines(load(), smGet()).map(l => `${l.x ? "—" : l.a}\t${l.n}${l.x ? ", " + (l.u || "шт.") : ""}\t${l.q}\t${l.t != null ? l.t + " BYN" : "по запросу"}`).join("\n"), "Список скопирован"));
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
    if (box) {  // цены — как в смете; смета от сотрудника — с её скидкой и названием документа
      const m = smGet(), dh = $("[data-doc-h]")?.textContent;
      body.items = leadRows(m);
      // состав для «Открыть» в кабинете; скидки и свои строки сервер берёт из сметы (sid) или заявки (lid) этого человека, а не отсюда
      body.sm = { items: load(), ld: m?.ld || {}, extra: m?.extra || [], d: m?.d ?? null, sid: m?.id || 0, lid: m?.lid || 0 };
      if (m && m.d != null) body.sdisc = +m.d;
      if (dh && dh !== DOC0) body.doc = dh;
    }
    btn.disabled = true; msg.textContent = "Отправляем…";
    try {
      const r = await fetch("/lead.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "fail");
      msg.textContent = "Спасибо! Заявка принята, перезвоним в рабочее время."; msg.classList.add("ok");
      f.reset();
      prefill(f);
      if (box) { save({}); docSet(""); smSet(null); $("[data-doc-h]").textContent = DOC0; renderSmeta(); }
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
    const out = () => { remember(null); setAcc(null); user = null; staff = admin = false; history.replaceState(null, "", location.pathname); route(); };

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
    const ulist = it => `<ul>${it.map(x => `<li>${esc(x.a)} — ${esc(x.n)} × ${x.q}${x.b != null ? ", " + fmt(x.b * x.q) + " BYN" : ""}</li>`).join("")}</ul>`;
    const pkey = ph => { const d = String(ph || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-9) : ""; };  // как kab_phone_key на сервере
    const pLink = (uid, ph, text) => uid ? `<a href="#p=u${uid}">${text}</a>` : pkey(ph) ? `<a href="#p=t${pkey(ph)}">${text}</a>` : text;
    // сумма сметы — со скидкой сметы, иначе с личной скидкой её владельца (сотрудник у чужой сметы — не со своей)
    const smSum = s => smLines(s.items, { d: s.disc, ld: s.ld, extra: s.extra, ...(staff && +s.user_id !== +user.id ? { ud: +s.udisc || 0 } : {}) }).reduce((t, l) => t + (l.t || 0), 0);
    const smFrom = s => (s.made_by ? `<br><span class="muted small">${staff ? "подготовил: " + esc(s.made_name || "сотрудник") : "подготовила AllVision"}${s.disc ? ", скидка " + pct(s.disc) : ""}</span>` : "")
      + (s.edited_at ? `<br><span class="muted small">${staff ? "изменил: " + esc(s.edited_name || "сотрудник") : "изменена AllVision"} ${day(s.edited_at)}</span>` : "");
    const smetaTable = (list, who) => `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Смета</th>${who ? "<th>Чья</th>" : ""}<th class="num">Позиций</th><th class="num">Сумма*</th><th>Обновлена</th><th></th></tr></thead><tbody>`
      + list.map(s => `<tr><td>${esc(s.title)}${s.doc ? `<br><span class="muted small">${esc(s.doc)}</span>` : ""}${smFrom(s)}</td>`
        + (who ? `<td>${pLink(s.user_id, "", esc(s.name))}${s.company ? `<br><span class="muted small">${esc(s.company)}</span>` : ""}</td>` : "")
        + `<td class="num">${Object.keys(s.items).length + (s.extra || []).length}</td><td class="num">${fmt(smSum(s))} BYN</td><td>${day(s.updated_at)}</td>`
        + `<td class="acts"><button class="cbtn" type="button" data-open="${s.id}">Открыть</button>${+s.user_id === +user.id || (staff && +s.made_by === +user.id) ? ` <button class="cbtn ghost" type="button" data-del="${s.id}">Удалить</button>` : ""}</td></tr>`).join("")
      + "</tbody></table></div>";
    const smetaNote = () => `<p class="muted small">* По сегодняшним ценам: со скидкой, указанной в смете, иначе${staff ? " с личной скидкой владельца сметы" : DISC ? ` с вашей скидкой ${pct(DISC)}` : " по розничным"}; без позиций «по запросу». «Открыть» заменяет текущий список для сметы.${staff ? " Открытую смету правят на странице сметы и сохраняют кнопкой «Сохранить изменения»." : ""}</p>`;
    const leadTable = (list, who) => `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>№</th><th>Дата</th>${who ? "<th>Кто</th>" : ""}<th>Что</th><th>Состояние</th></tr></thead><tbody>`
      + list.map(l => {
        const it = jl(l.items), was = staff ? jl(l.items0) : [];
        return `<tr><td>${l.id}</td><td>${day(l.created_at)}</td>`
          + (who ? `<td>${pLink(l.user_id, l.phone, esc(l.name || "—"))}<br><a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>${l.role ? `<br><span class="muted small">${esc(ROLE[l.role] || "")}${l.company ? ", " + esc(l.company) : ""}</span>` : ""}</td>` : "")
          + `<td>${esc(l.topic || "Заявка")}${it.length ? ` · ${it.length} поз.${l.total ? ", " + fmt(+l.total) + " BYN" : ""}` : ""}${l.comment ? `<br><span class="muted small">${esc(l.comment)}</span>` : ""}`
          + (l.made ? `<br><span class="muted small">${staff ? "оформил: " + esc(l.made_name || "сотрудник") : "оформлена AllVision"}</span>` : "")
          + (l.edited_at ? `<br><span class="muted small">${staff ? "изменил: " + esc(l.edited_name || "сотрудник") : "изменена AllVision"} ${day(l.edited_at)}</span>` : "")
          + (it.length ? `<details><summary>Состав</summary>${ulist(it)}</details>` : "")
          + (was.length ? `<details><summary>Как прислал клиент</summary>${ulist(was)}${l.total0 ? `<p class="small">Итого ${fmt(+l.total0)} BYN</p>` : ""}</details>` : "")
          + (it.length || l.sm ? `<p class="acts"><button class="cbtn" type="button" data-lopen="${l.id}">${staff ? "Открыть и поправить" : "Открыть"}</button></p>` : "") + "</td>"
          + `<td>${staff ? `<select data-st="${l.id}" aria-label="Состояние заявки №${l.id}">${Object.entries(ST).map(([k, t]) => `<option value="${k}"${k === l.status ? " selected" : ""}>${t}</option>`).join("")}</select>`
            : `<span class="st ${esc(l.status)}">${ST[l.status] || esc(l.status)}</span>`}</td></tr>`;
      }).join("") + "</tbody></table></div>";
    const leadNote = () => `<p class="muted small">«Открыть» заменяет текущий список для сметы.${staff ? " Открытую заявку правят на странице сметы и сохраняют кнопкой «Сохранить изменения»: клиент увидит новый состав, а здесь останется, как он прислал." : ""}</p>`;
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
    const replaceOk = what => !Object.keys(load()).length || confirm(`Заменить текущий список для сметы ${what}?`);
    const openSmeta = s => {
      if (!s || !replaceOk("этой сметой")) return;
      // сотрудник — в режиме правки: «Сохранить изменения» на странице сметы пишет в эту же смету; чужая — с личной скидкой её владельца
      save(s.items); docSet(s.doc);
      smSet({ d: s.disc, id: s.id, uid: s.user_id, title: s.title, ld: s.ld, extra: s.extra,
        ...(staff ? { edit: "s", who: s.name || "", wtg: +s.user_id !== +user.id, ...(+s.user_id !== +user.id ? { ud: +s.udisc || 0 } : {}) } : {}) });
      location.href = "/smeta/";
    };
    const openLead = l => {
      if (!l || !replaceOk("этой заявкой")) return;
      const sm = l.sm || {}, st = Object.keys(sm.items || {}).length || (sm.extra || []).length ? sm : fromRows(jl(l.items));
      save(st.items || {}); docSet(st.doc || "");
      // сотрудник — в режиме правки, с личной скидкой клиента; заявка без кабинета — по розничным ценам
      smSet({ lid: l.id, title: `Заявка №${l.id}`, d: st.d ?? null, ld: st.ld || {}, extra: st.extra || [],
        ...(staff ? { edit: "l", who: [l.name, l.company].filter(Boolean).join(", "), wtg: !!l.user_id, uid: l.user_id || 0, ph: l.phone || "", ud: l.user_id ? (+l.udisc || 0) : 0 } : {}) });
      location.href = "/smeta/";
    };
    // новая смета или заявка человеку из карточки или из поиска: пустой список и полоса «Новая смета для …» на странице сметы
    const newDoc = (kind, p) => {
      if (Object.keys(load()).length && !confirm("Начать новый документ? Текущий список для сметы очистится.")) return;
      save({}); docSet("");
      smSet({ edit: kind === "s" ? "ns" : "nl", who: p.name || "", uid: p.id || 0, ph: p.phone || "", wtg: !!p.id, ud: p.id ? (+p.discount || 0) : 0, title: "" });
      location.href = "/smeta/";
    };
    const listClicks = async ev => {
      const o = ev.target.closest("[data-open]"), lo = ev.target.closest("[data-lopen]"), d = ev.target.closest("[data-del]"), nw = ev.target.closest("[data-new]");
      if (o) openSmeta(SHOWN.smetas.find(x => String(x.id) === o.dataset.open));
      if (lo) openLead(SHOWN.leads.find(x => String(x.id) === lo.dataset.lopen));
      if (nw && PERSON) newDoc(nw.dataset.new, PERSON);
      if (d && confirm("Удалить смету из кабинета?")) { await kabApi("smeta_del", { id: +d.dataset.del }).catch(() => {}); route(); }
    };
    const statusChange = async ev => {
      const s = ev.target.closest("[data-st]"); if (!s) return;
      const r = await kabApi("lead_status", { id: +s.dataset.st, status: s.value }).catch(() => ({}));
      s.classList.toggle("bad", !r.ok);
    };

    const tabSmetas = async () => {
      wait();
      const j = await kabApi("smetas" + (staff ? "&all=1" : "")).catch(() => ({}));
      if (!j.ok) return failed();
      if (!j.smetas.length) { panel.innerHTML = '<p>Сохранённых смет пока нет. Соберите список в <a href="/katalog/">каталоге</a>, затем на странице <a href="/smeta/">«Смета»</a> нажмите «Сохранить в кабинет».</p>'; return; }
      SHOWN = { leads: [], smetas: j.smetas };
      panel.innerHTML = smetaTable(j.smetas, staff) + smetaNote();
      panel.onclick = listClicks;
    };

    const tabLeads = async () => {
      wait();
      const j = await kabApi("leads").catch(() => ({}));
      if (!j.ok) return failed();
      if (!j.leads.length) { panel.innerHTML = staff ? "<p>Заявок пока нет.</p>" : "<p>Заявок пока нет. Заявки, отправленные с сайта после входа, появятся здесь вместе с их состоянием.</p>"; return; }
      SHOWN = { leads: j.leads, smetas: [] };
      panel.innerHTML = leadTable(j.leads, staff) + leadNote();
      panel.onclick = listClicks;
      if (staff) panel.onchange = statusChange;
    };

    // карточка человека (сотрудник): #p=u<номер> — пользователь кабинета, #p=t<телефон> — оставлял заявки без входа
    const tabPerson = async key => {
      wait();
      const j = await kabApi("person&" + (key[0] === "u" ? "uid=" : "phone=") + encodeURIComponent(key.slice(1))).catch(() => ({}));
      if (!j.ok) { panel.innerHTML = j.status === 404 ? "<p>Такого человека не нашли. Поищите по имени или телефону.</p>" : ""; if (j.status !== 404) failed(); return; }
      const p = PERSON = j.person, blocked = p.status === "blocked";
      SHOWN = { leads: j.leads, smetas: j.smetas };
      const info = [p.phone && `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>`, p.company && esc(p.company), p.id ? esc(ROLE[p.role] || "") : "без кабинета на сайте",
        p.discount > 0 && "скидка " + pct(p.discount), p.tg_username && "@" + esc(p.tg_username), blocked && "заблокирован"].filter(Boolean).join(" · ");
      panel.innerHTML = `<div class="kab-person"><div><h2>${esc(p.name || "—")}</h2><p class="muted">${info}</p></div>`
        + (blocked ? "" : `<div class="acts">${p.id ? '<button class="btn" type="button" data-new="s">Новая смета</button>' : ""}<button class="btn${p.id ? " ghost" : ""}" type="button" data-new="l">Новая заявка</button></div>`) + "</div>"
        + "<h3>Заявки</h3>" + (j.leads.length ? leadTable(j.leads, false) : '<p class="muted">Заявок нет.</p>')
        + (p.id ? "<h3>Сметы</h3>" + (j.smetas.length ? smetaTable(j.smetas, false) + smetaNote() : '<p class="muted">Смет нет.</p>')
          : '<p class="muted small">У человека нет кабинета на сайте: смету ему сохранить некуда. Оформите заявку, а PDF или ссылку пошлите сами.</p>');
      panel.onclick = listClicks;
      panel.onchange = statusChange;
    };

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
      let qd = q.replace(/\D/g, "");
      if (/^80\d/.test(qd)) qd = "375" + qd.slice(2);  // 8029… — то же, что +37529…
      const words = low(q).replace(/[+\d()\-]/g, " ").split(/\s+/).filter(w => w.length > 1);
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
        newDoc("l", { id: 0, name: ph ? q.replace(/[+\d()\-\s]{7,}/g, "").trim() : q, phone: ph ? (q.match(/[+\d()\-\s]{7,}/) || [""])[0].trim() : "" });
      });
      document.addEventListener("click", ev => { if (!ev.target.closest("[data-kab-find]")) findRes.hidden = true; });
      findIn.addEventListener("keydown", ev => {
        if (ev.key === "Escape") findRes.hidden = true;
        if (ev.key === "Enter") { ev.preventDefault(); $("a", findRes)?.click(); }
      });
    }

    const tabUsers = async () => {
      wait();
      const j = await kabApi("users").catch(() => ({}));
      if (!j.ok) return failed();
      // категорию, суперадмина, подтверждение запросов и блокировку меняет суперадмин; сотрудник — только скидку (владелец 05.11.2026)
      const who = u => u.owner ? "суперадмин, владелец" : u.admin ? "суперадмин" : ROLE[u.role];
      panel.innerHTML = `<div class="tbl-wrap"><table class="kab-tbl"><thead><tr><th>Кто</th><th>Категория</th><th>Скидка, %</th><th></th></tr></thead><tbody>`
        + j.users.map(u => {
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
            + `<td>${role}</td><td><input class="pct" type="number" min="0" max="50" step="0.5" value="${+u.discount || 0}" data-disc aria-label="Скидка, %"></td><td class="acts">${acts}<p class="msg small"></p></td></tr>`;
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
      panel.onclick = panel.onchange = panel.oninput = null;
      if (!user) return showLogin();
      if (user.status === "form") { main.before(form); setupForm(true); return show(form); }
      show(main); head();
      // документы — клиентам (владелец 03.11.2026: у дилера их нет), материалы — только сотрудникам
      const tabs = staff ? [["users", "Пользователи"], ["leads", "Заявки"], ["smetas", "Сметы"], ["cat", "Ассортимент"], ["docs", "Документы"], ["mats", "Материалы"], ["profile", "Мои данные"]]
        : [["smetas", "Сметы"], ["leads", "Заявки"], ...(user.role === "client" ? [["docs", "Документы"]] : []), ["profile", "Мои данные"]];
      // карточка человека из поиска: #p=u<номер> или #p=t<телефон> — вкладки без выбранной (владелец 06.11.2026)
      const pk = staff && /^#p=[ut]\d+$/.test(location.hash) ? location.hash.slice(3) : "";
      const cur = pk ? "" : (tabs.find(t => "#" + t[0] === location.hash) || tabs[0])[0];
      $("[data-kab-tabs]").innerHTML = tabs.map(([k, t]) => `<a href="#${k}" class="tab${k === cur ? " on" : ""}"${k === cur ? ' aria-current="page"' : ""}>${t}</a>`).join("");
      if (findBox) findBox.hidden = !staff;
      PERSON = null;
      if (pk) return tabPerson(pk);
      ({ users: tabUsers, leads: tabLeads, smetas: tabSmetas, cat: tabCat, docs: tabDocs, mats: tabMats, profile: tabProfile })[cur]();
    };
    addEventListener("hashchange", () => { if (user && user.status !== "form") route(); });
    $("[data-kab-logout]").addEventListener("click", async () => { await kabApi("logout", {}).catch(() => {}); out(); });
    kabApi("me").then(j => { if (j.ok) { user = j.user; staff = !!j.staff; admin = !!j.admin; remember(user); setAcc(user); } route(); }).catch(route);
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
