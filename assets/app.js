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
  }));
  const qi = $("[data-qty-input]");
  $$("[data-qty]").forEach(b => b.addEventListener("click", () => { qi.value = Math.max(1, (+qi.value || 1) + +b.dataset.qty); }));
  if (add) add.addEventListener("click", () => {
    const s = load(), a = add.dataset.add, q = Math.max(1, +(qi?.value) || 1);
    s[a] = (s[a] || 0) + q; save(s);
    add.textContent = "Добавлено ✓";
    setTimeout(() => { add.textContent = "В смету"; }, 1600);
  });

  // ---- фильтр каталога ----
  const search = $("[data-search]");
  if (search) {
    let fp = "", fg = "";
    const cards = $$(".grid .card");
    const found = $("[data-found]");
    const apply = () => {
      const q = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let n = 0;
      cards.forEach(c => {
        const ok = (!fp || c.dataset.p === fp) && (!fg || c.dataset.g === fg) && q.every(w => c.dataset.q.includes(w));
        c.hidden = !ok; if (ok) n++;
      });
      found.textContent = n === cards.length ? "" : `Найдено: ${n}`;
    };
    const chips = (sel, attr, set) => $$(sel + " button").forEach(b => b.addEventListener("click", () => {
      $$(sel + " button").forEach(x => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true"); set(b.dataset[attr]); apply();
    }));
    chips("[data-chips-p]", "fp", v => fp = v);
    chips("[data-chips-g]", "fg", v => fg = v);
    search.addEventListener("input", apply);
    const u = new URLSearchParams(location.search).get("q");
    if (u) { search.value = u; apply(); }
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
