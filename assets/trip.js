/* Командировочные бригады — калькулятор с claude.ai (06.11.2026), на сайте с 07.11.2026. Расчёт — как в артефакте; сохранение — в базу сайта */
(function(){
const KEY='travel-calc-v3';
const DEF_GROUPS=[
  {id:'g1',name:'Монтажники',people:2,days:10,overnight:true,meal:true},
  {id:'g2',name:'Инженеры (ПНР)',people:1,days:3,overnight:true,meal:true}
];
const DEF_FIELDS={place:'',dist:180,rot:5,meal:30,house:'hotel',hotel:55,flat:90,flatCap:4,
  trOn:true,timeOn:true,trAuto:true,seats:3,speed:70,hour:15,fuelSel:'ДТ|2.72',cons:10,wear:'0.20',
  delivOn:false,delivTrips:1,reserveOn:false,reserve:10,vat:false,rate:2.9915,rateDate:'2026-11-06',noteExtra:''};
let groups=clone(DEF_GROUPS), cars=[], custom=[], view='detail', seq=10;
const $=id=>document.getElementById(id);
function clone(o){return JSON.parse(JSON.stringify(o))}
const num=v=>{v=parseFloat(String(v).replace(',','.'));return isFinite(v)?v:0};
const r1=v=>Math.round(v*10)/10, r2=v=>Math.round(v*100)/100;
const money=v=>v.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const int=v=>Math.round(v).toLocaleString('ru-RU');
const qtyF=v=>v.toLocaleString('ru-RU',{maximumFractionDigits:1});
const plain=v=>String(v).replace('.',',');
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function plural(n,f){n=Math.abs(Math.round(n))%100;const n1=n%10;if(n>10&&n<20)return f[2];if(n1>1&&n1<5)return f[1];if(n1===1)return f[0];return f[2]}
const P={trip:['рейс','рейса','рейсов'],night:['ночь','ночи','ночей'],day:['рабочий день','рабочих дня','рабочих дней'],man:['человек','человека','человек'],car:['машина','машины','машин']};
function ruDate(iso){if(!iso)return'';const [y,m,d]=iso.split('-');return `${d}.${m}.${y}`}
function today(){return new Date().toLocaleDateString('ru-RU')}

const FIELD_IDS=Object.keys(DEF_FIELDS);
function setField(id,v){const el=$(id);if(el.type==='checkbox')el.checked=!!v;else el.value=v;}
function getField(id){const el=$(id);return el.type==='checkbox'?el.checked:el.value;}

function params(){
  const [fuelName,fuelPrice]=$('fuelSel').value.split('|');
  return {place:$('place').value.trim(),dist:Math.max(0,num($('dist').value)),rot:Math.max(1,Math.round(num($('rot').value))),
    meal:num($('meal').value),house:$('house').value,hotel:num($('hotel').value),flat:num($('flat').value),flatCap:Math.max(1,Math.round(num($('flatCap').value))),
    trOn:$('trOn').checked,timeOn:$('timeOn').checked,trAuto:$('trAuto').checked,
    seats:Math.max(1,Math.round(num($('seats').value))),speed:Math.max(1,num($('speed').value)),hour:num($('hour').value),
    fuelName,fuel:num(fuelPrice),cons:num($('cons').value),wear:num($('wear').value),
    delivOn:$('delivOn').checked,delivTrips:Math.max(1,Math.round(num($('delivTrips').value))),
    reserveOn:$('reserveOn').checked,reserve:num($('reserve').value),vat:$('vat').checked,
    rate:num($('rate').value),rateDate:$('rateDate').value,noteExtra:$('noteExtra').value.trim()};
}
// trips and nights of one group
function gInfo(g,p,overnight){
  const n=g.people,D=g.days; const ov=overnight===undefined?g.overnight:overnight;
  const trips=ov?Math.ceil(D/p.rot):D;
  return {n,D,trips,nights:ov?Math.max(0,D-trips):0,ov};
}
const active=g=>g.people>0&&g.days>0;

/* ---------- groups UI ---------- */
function renderGroups(){
  const box=$('groups');box.innerHTML='';
  groups.forEach(g=>{
    const el=document.createElement('div');el.className='group';
    el.innerHTML=`
      <div class="ghead"><input id="${g.id}-name" type="text" value="${esc(g.name)}" aria-label="Название группы">
        ${groups.length>1?`<button class="x" type="button" id="${g.id}-del" aria-label="Удалить группу">×</button>`:''}</div>
      <div class="two">
        <label><b>Человек</b><input id="${g.id}-people" type="number" min="0" step="1" value="${g.people}"></label>
        <label><b>Рабочих дней</b><input id="${g.id}-days" type="number" min="0" step="1" value="${g.days}"></label>
      </div>
      <div class="checks">
        <label class="check"><input type="checkbox" id="${g.id}-overnight"${g.overnight?' checked':''}><span>Ночёвка на объекте (проживание)</span></label>
        <label class="check"><input type="checkbox" id="${g.id}-meal"${g.meal?' checked':''}><span>Питание</span></label>
      </div>
      <div class="tip" id="${g.id}-tip"></div>`;
    box.appendChild(el);
    ['name','people','days'].forEach(k=>$(`${g.id}-${k}`).addEventListener('input',e=>{
      g[k]=k==='name'?e.target.value:Math.max(0,num(e.target.value));calc();}));
    ['overnight','meal'].forEach(k=>$(`${g.id}-${k}`).addEventListener('change',e=>{g[k]=e.target.checked;calc();}));
    const del=$(`${g.id}-del`);
    if(del)del.addEventListener('click',()=>{groups=groups.filter(x=>x!==g);renderGroups();calc();});
  });
}
$('addGroup').addEventListener('click',()=>{
  groups.push({id:'g'+(++seq),name:'Новая группа',people:1,days:1,overnight:false,meal:true});renderGroups();calc();
});

/* ---------- transport: automatic plan from groups ---------- */
// groups with the same overnight mode travel together; each person rides only his own trips
function autoPlan(p){
  const plan=[];
  [true,false].forEach(ov=>{
    const gs=groups.filter(g=>active(g)&&!!g.overnight===ov);
    if(!gs.length)return;
    const infos=gs.map(g=>gInfo(g,p));
    const trips=Math.max(...infos.map(i=>i.trips));
    const people=infos.reduce((a,i)=>a+i.n,0);
    const personTrips=infos.reduce((a,i)=>a+i.n*i.trips,0);
    const nCars=Math.ceil(people/p.seats);
    plan.push({ov,names:gs.map(g=>g.name.trim()||'группа'),trips,people,personTrips,cars:nCars});
  });
  return plan;
}
function planToCars(p){
  const out=[];
  autoPlan(p).forEach(b=>{
    let left=b.people;
    for(let i=0;i<b.cars;i++){const ppl=Math.min(p.seats,left);left-=ppl;
      out.push({id:'t'+(++seq),name:`Автомобиль ${out.length+1}${b.ov?'':' (каждый день)'}`,kind:'car',trips:b.trips,people:ppl,cons:p.cons});}
  });
  return out;
}

/* ---------- transport: manual rows UI ---------- */
function renderCars(){
  const box=$('trRows');box.innerHTML='';
  if(!cars.length){box.innerHTML='<div class="hint">Нет машин. Добавьте строку.</div>';return;}
  cars.forEach(c=>{
    const el=document.createElement('div');el.className='trow';
    el.innerHTML=`<label><b>Название</b><input type="text" id="${c.id}-name" value="${esc(c.name)}"></label>
      <label><b>Рейсов</b><input type="number" min="0" step="1" id="${c.id}-trips" value="${c.trips}"></label>
      <label><b>Человек</b><input type="number" min="0" step="1" id="${c.id}-people" value="${c.people}"></label>
      <label><b>Л/100 км</b><input type="number" min="0" step="0.5" id="${c.id}-cons" value="${c.cons}"></label>
      <button class="x" type="button" id="${c.id}-del" aria-label="Удалить строку">×</button>`;
    box.appendChild(el);
    $(`${c.id}-name`).addEventListener('input',e=>{c.name=e.target.value;calc();});
    ['trips','people','cons'].forEach(k=>$(`${c.id}-${k}`).addEventListener('input',e=>{c[k]=Math.max(0,num(e.target.value));calc();}));
    $(`${c.id}-del`).addEventListener('click',()=>{cars=cars.filter(x=>x!==c);renderCars();calc();});
  });
}
$('addCar').addEventListener('click',()=>{const p=params();cars.push({id:'t'+(++seq),name:`Автомобиль ${cars.length+1}`,kind:'car',trips:1,people:Math.min(p.seats,2),cons:p.cons});renderCars();calc();});
$('trAuto').addEventListener('change',()=>{
  if(!$('trAuto').checked&&!cars.length){cars=planToCars(params());}
  renderCars();calc();
});

/* ---------- custom lines UI ---------- */
function renderCustom(){
  const box=$('customList');box.innerHTML='';
  if(!custom.length){box.innerHTML='<div class="hint">Строк нет.</div>';return;}
  box.insertAdjacentHTML('beforeend','<div class="custom chead hint"><span></span><span>Название</span><span>Ед.</span><span>Кол-во</span><span>Цена, BYN</span><span></span></div>');
  custom.forEach(c=>{
    const el=document.createElement('div');el.className='custom';
    el.innerHTML=`<input type="checkbox" id="${c.id}-on"${c.on?' checked':''} aria-label="Включить строку">
      <input class="cname" type="text" id="${c.id}-name" value="${esc(c.name)}" placeholder="Название" aria-label="Название">
      <input type="text" id="${c.id}-unit" value="${esc(c.unit)}" placeholder="ед." aria-label="Единица">
      <input type="number" id="${c.id}-qty" min="0" step="1" value="${c.qty}" aria-label="Количество">
      <input type="number" id="${c.id}-price" min="0" step="0.01" value="${c.price}" aria-label="Цена, BYN">
      <button class="x" type="button" id="${c.id}-del" aria-label="Удалить строку">×</button>`;
    box.appendChild(el);
    $(`${c.id}-on`).addEventListener('change',e=>{c.on=e.target.checked;calc();});
    ['name','unit'].forEach(k=>$(`${c.id}-${k}`).addEventListener('input',e=>{c[k]=e.target.value;calc();}));
    ['qty','price'].forEach(k=>$(`${c.id}-${k}`).addEventListener('input',e=>{c[k]=num(e.target.value);calc();}));
    $(`${c.id}-del`).addEventListener('click',()=>{custom=custom.filter(x=>x!==c);renderCustom();calc();});
  });
}
$('addCustom').addEventListener('click',()=>{custom.push({id:'c'+(++seq),on:true,name:'Платная стоянка',unit:'сут.',qty:1,price:10});renderCustom();calc();});

/* ---------- calculation ---------- */
function line(cat,name,unit,qty,price){return {cat,name,unit,qty,price,sum:r2(qty*price)}}
const CAT={meal:'Питание',house:'Проживание',transport:'Транспорт',other:'Прочие расходы'};
let model=null;

function housingLines(p,list){
  const st=list.map(g=>({g,i:gInfo(g,p)})).filter(x=>x.i.nights>0);
  if(!st.length)return [];
  if(p.house==='hotel') return st.map(x=>line('house',x.g.name.trim()||'Группа','чел.-ноч.',x.i.n*x.i.nights,p.hotel));
  // shared flat: groups live together from the first night; count flats needed each night
  const maxN=Math.max(...st.map(x=>x.i.nights)); let flatNights=0, maxFlats=0;
  for(let k=0;k<maxN;k++){const occ=st.reduce((a,x)=>a+(k<x.i.nights?x.i.n:0),0);const f=Math.ceil(occ/p.flatCap);flatNights+=f;maxFlats=Math.max(maxFlats,f);}
  const who=st.map(x=>x.g.name.trim()||'группа').join(', ');
  return [line('house',`Квартира посуточно (${who}; до ${p.flatCap} мест${maxFlats>1?`, ${maxFlats} кв.`:''})`,'кв.-ноч.',flatNights,p.flat)];
}

function transportLines(p){
  const L=[]; let km=0, persH=0, desc=[]; const fuelRows=[];
  if(p.trAuto){
    autoPlan(p).forEach(b=>{
      const leg=2*p.dist;
      km+=b.trips*leg*b.cars;
      desc.push(`${b.cars} ${plural(b.cars,P.car)} × ${b.trips} ${plural(b.trips,P.trip)} туда-обратно${b.ov?'':' (каждый день)'}, ${b.people} чел.`);
      persH+=b.personTrips*leg/p.speed;
    });
  }else{
    cars.forEach(c=>{if(!(c.trips>0))return;const leg=2*p.dist;
      const k=c.trips*leg;km+=k;const cn=c.cons===undefined||c.cons===''?p.cons:num(c.cons);
      fuelRows.push({name:c.name.trim()||'Автомобиль',km:k,cons:cn});
      desc.push(`${c.name.trim()||'автомобиль'}: ${c.trips} ${plural(c.trips,P.trip)}, ${c.people} чел.`);
      persH+=c.trips*leg/p.speed*c.people;
    });
  }
  if(km>0){
    if(fuelRows.length) fuelRows.forEach(f=>{if(f.km>0)L.push(line('transport',`Топливо ${p.fuelName}: ${f.name} — ${int(f.km)} км × ${qtyF(f.cons)} л/100 км`,'л',r1(f.km*f.cons/100),p.fuel));});
    else L.push(line('transport',`Топливо ${p.fuelName}: ${int(km)} км × ${qtyF(p.cons)} л/100 км`,'л',r1(km*p.cons/100),p.fuel));
    L.push(line('transport',`Износ и обслуживание автомобил${fuelRows.length>1?'ей':'я'}`,'км',km,p.wear));
  }
  if(p.timeOn&&persH>0) L.push(line('transport','Время в дороге','чел.-ч',r1(persH),p.hour));
  if(p.delivOn){
    const leg=2*p.dist;
    const perTrip=r2(leg*(p.cons/100*p.fuel+p.wear)+(p.timeOn?leg/p.speed*p.hour:0));
    L.push(line('transport',`Доставка оборудования и материалов отдельным рейсом (${int(leg)} км${p.timeOn?', с временем водителя':''})`,'рейс',p.delivTrips,perTrip));
  }
  return {lines:L.filter(x=>x.sum>0),desc};
}

function calc(){
  const p=params();
  // visibility of dependent fields
  $('hotelBox').hidden=p.house!=='hotel'; $('flatBox').hidden=p.house!=='flat'; $('capBox').hidden=p.house!=='flat';
  $('manualBox').hidden=p.trAuto; $('delivFields').hidden=!p.delivOn; $('reserve').disabled=!p.reserveOn;
  document.querySelectorAll('.check').forEach(l=>{const i=l.querySelector('input');if(i)l.classList.toggle('off',!i.checked);});

  const act=groups.filter(active);
  const sections=[];
  // meals
  const meal=act.filter(g=>g.meal).map(g=>line('meal',g.name.trim()||'Группа','чел.-дн.',g.people*g.days,p.meal)).filter(x=>x.sum>0);
  if(meal.length) sections.push({key:'meal',title:`Питание, ${money(p.meal)} BYN на человека в день`,art:'Питание',lines:meal});
  // housing
  const house=housingLines(p,act.filter(g=>g.overnight)).filter(x=>x.sum>0);
  if(house.length) sections.push({key:'house',title:p.house==='hotel'?`Проживание в гостинице, ${money(p.hotel)} BYN на человека за ночь`:`Проживание: квартира посуточно, ${money(p.flat)} BYN за ночь`,art:'Проживание',lines:house});
  // transport
  let trDesc=[];
  if(p.trOn){const t=transportLines(p);trDesc=t.desc;
    if(t.lines.length) sections.push({key:'transport',title:`Транспорт${t.desc.length?': '+t.desc.join('; '):''}`,art:'Транспорт',lines:t.lines});}
  // custom
  const cl=custom.filter(c=>c.on).map(c=>line('other',c.name.trim()||'Прочие расходы',c.unit.trim()||'шт.',c.qty,c.price)).filter(x=>x.sum>0);
  if(cl.length) sections.push({key:'other',title:'Прочие расходы',art:'Прочие расходы',lines:cl});

  sections.forEach(s=>s.total=r2(s.lines.reduce((a,b)=>a+b.sum,0)));
  const subtotal=r2(sections.reduce((a,s)=>a+s.total,0));
  const reserve=p.reserveOn&&p.reserve>0?r2(subtotal*p.reserve/100):0;
  const vat=p.vat?r2((subtotal+reserve)*0.2):0;
  const total=r2(subtotal+reserve+vat);
  model={p,sections,subtotal,reserve,vat,total,act};

  // per-group tips: overnight vs daily (housing + own trips)
  groups.forEach(g=>{
    const tip=$(`${g.id}-tip`); if(!tip)return;
    if(!active(g)){tip.textContent='Укажите людей и дни.';return;}
    const cost=ov=>{const i=gInfo(g,p,ov);const leg=2*p.dist;
      let c=0;
      if(ov&&i.nights>0) c+= p.house==='hotel'? i.n*i.nights*p.hotel : Math.ceil(i.n/p.flatCap)*i.nights*p.flat;
      if(p.trOn){ c+= Math.ceil(i.n/p.seats)*i.trips*leg*(p.cons/100*p.fuel+p.wear);
        if(p.timeOn) c+= i.n*i.trips*leg/p.speed*p.hour; }
      return c;};
    const s=cost(true), d=cost(false);
    const better=Math.abs(s-d)<1?'same':(s<d?'stay':'daily'); const cur=g.overnight?'stay':'daily';
    let html=`Жильё и дорога, если группа едет одна: с ночёвкой ${int(s)} · без ночёвки ${int(d)} BYN.`;
    if(better!=='same'&&better!==cur) html+=` <b>Дешевле ${better==='stay'?'с ночёвкой':'без ночёвки'}.</b> <button class="link" type="button">Выбрать</button>`;
    tip.innerHTML=html;
    const b=tip.querySelector('button'); if(b) b.addEventListener('click',()=>{g.overnight=(better==='stay');$(`${g.id}-overnight`).checked=g.overnight;calc();});
  });

  // auto transport info
  if(p.trAuto){
    const plan=autoPlan(p);
    $('autoInfo').textContent=plan.length&&p.trOn?'Рейсы: '+plan.map(b=>`${b.names.join(' + ')} — ${b.cars} ${plural(b.cars,P.car)}, ${b.trips} ${plural(b.trips,P.trip)} туда-обратно${b.ov?'':' (каждый день)'}`).join('; ')+'. Снимите галочку, чтобы задать машины и рейсы вручную.':'';
  }else $('autoInfo').textContent='';

  // summary
  const tb=$('breakdown');tb.innerHTML='';
  sections.forEach(s=>{
    tb.insertAdjacentHTML('beforeend',`<tr><td>${CAT[s.key]}</td><td class="n">${money(s.total)}</td></tr>`);
    if(s.key==='transport'){const agg=new Map();
      s.lines.forEach(l=>{const k=l.name.split(':')[0].replace(/ \(.*$/,'');agg.set(k,(agg.get(k)||0)+l.sum);});
      agg.forEach((v,k)=>tb.insertAdjacentHTML('beforeend',`<tr class="det"><td>${esc(k)}</td><td class="n">${money(v)}</td></tr>`));}
  });
  if(reserve>0)tb.insertAdjacentHTML('beforeend',`<tr><td>Запас ${qtyF(p.reserve)}%</td><td class="n">${money(reserve)}</td></tr>`);
  if(vat>0)tb.insertAdjacentHTML('beforeend',`<tr><td>НДС 20%</td><td class="n">${money(vat)}</td></tr>`);
  if(!sections.length)tb.insertAdjacentHTML('beforeend',`<tr><td colspan="2" class="hint">Ни одна строка не отмечена.</td></tr>`);
  tb.insertAdjacentHTML('beforeend',`<tr class="sum"><td>Итого</td><td class="n">${money(total)}</td></tr>`);
  $('total').innerHTML=`${int(total)}<small>BYN</small>`;
  $('totalUsd').textContent=p.rate>0?`≈ ${int(total/p.rate)} USD по курсу ${p.rate.toLocaleString('ru-RU',{minimumFractionDigits:4})}`:'';
  renderKp();
  save();
}

/* ---------- KP form ---------- */
function crewText(){
  const {p,act}=model;
  return act.map(g=>{const i=gInfo(g,p);
    return `${g.name.trim()||'Группа'} — ${i.n} чел., ${i.D} ${plural(i.D,P.day)}, ${i.ov&&i.nights>0?`с ночёвкой (${i.nights} ${plural(i.nights,P.night)})`:'без ночёвки'}`;}).join('; ');
}
function kpRows(){
  const {p,sections,subtotal,reserve,vat,total}=model; const rows=[]; let i=0;
  if(view==='detail'){
    sections.forEach(s=>{
      rows.push({t:'sec',name:s.title});
      s.lines.forEach(l=>rows.push({t:'line',no:++i,name:l.name,unit:l.unit,qty:l.qty,price:l.price,sum:l.sum}));
      if(sections.length>1) rows.push({t:'subt',name:`Итого: ${s.art.toLowerCase()}`,sum:s.total});
    });
  }else if(view==='art'){
    sections.forEach(s=>rows.push({t:'line',no:++i,name:s.key==='transport'?s.title:s.art,unit:'',qty:'',price:'',sum:s.total}));
  }else{
    const what=sections.map(s=>s.art.toLowerCase()).join(', ');
    if(sections.length) rows.push({t:'line',no:1,name:`Командировочные и транспортные расходы (${what})`,unit:'компл.',qty:1,price:subtotal,sum:subtotal});
  }
  if(reserve>0||vat>0) rows.push({t:'subt',name:'Итого без запаса и НДС',sum:subtotal});
  if(reserve>0) rows.push({t:'subt',name:`Запас на непредвиденные расходы ${qtyF(p.reserve)}%`,sum:reserve});
  if(vat>0) rows.push({t:'subt',name:'НДС 20%',sum:vat});
  rows.push({t:'grand',name:p.vat?'Всего с НДС':'Всего',sum:total});
  return rows;
}
function kpNote(){
  const {p,total}=model; const parts=[];
  parts.push(`Расчёт для объекта${p.place?` «${p.place}»`:''} в ${int(p.dist)} км от Минска. Суммы в белорусских рублях${p.vat?', с НДС 20%':''}.`);
  if(p.rate>0) parts.push(`Справочно: ${int(total/p.rate)} USD по курсу НБРБ${p.rateDate?` на ${ruDate(p.rateDate)}`:''}, 1 USD = ${p.rate.toLocaleString('ru-RU',{minimumFractionDigits:4})} BYN.`);
  if(p.noteExtra) parts.push(p.noteExtra);
  return parts.join('\n');
}
function metaParts(){const {p}=model;const cl=clientName(cur.clientId);return [cur.num?`Расчёт № ${dispNum(cur.num)}${cur.version>1?` (ред. ${cur.version})`:''}`:'',cl?`Клиент: ${cl}`:'',p.place?`Объект: ${p.place}`:'',`Расстояние от Минска: ${int(p.dist)} км`,`Дата расчёта: ${cur.savedAt?new Date(String(cur.savedAt).replace(' ','T')).toLocaleDateString('ru-RU'):today()}`].filter(Boolean);}
// снимок формы КП — то, что видит клиент (владелец 07.11.2026: ставки и настройки расчёта клиенту не отдаём)
function docSnap(){return {meta:metaParts(),crew:crewText(),rows:kpRows(),note:kpNote(),view};}
function renderKp(){renderDoc(docSnap());}
function renderDoc(d){
  const rows=d.rows||[];
  $('kpMeta').innerHTML=(d.meta||[]).map(x=>`<span>${esc(x)}</span>`).join('');
  const crew=d.crew||''; $('kpCrew').textContent=crew?`Бригада: ${crew}.`:'';
  let h='<thead><tr><th class="num">№</th><th>Наименование</th><th>Ед. изм.</th><th class="n">Кол-во</th><th class="n">Цена, BYN</th><th class="n">Сумма, BYN</th></tr></thead><tbody>';
  rows.forEach(r=>{
    if(r.t==='sec') h+=`<tr class="sec"><td colspan="6">${esc(r.name)}</td></tr>`;
    else if(r.t==='line') h+=`<tr><td class="c">${r.no}</td><td>${esc(r.name)}</td><td class="c">${esc(r.unit)}</td><td class="n">${r.qty===''?'':qtyF(r.qty)}</td><td class="n">${r.price===''?'':money(r.price)}</td><td class="n">${money(r.sum)}</td></tr>`;
    else h+=`<tr class="${r.t}"><td></td><td colspan="4">${esc(r.name)}</td><td class="n">${money(r.sum)}</td></tr>`;
  });
  $('kpTable').innerHTML=h+'</tbody>';
  $('kpNote').textContent=d.note||'';
}
function kpTsv(){
  const rows=kpRows(); const out=['ЧТУП «ОллВижн»','Командировочные и транспортные расходы',metaParts().join('; ')];
  const crew=crewText(); if(crew) out.push(`Бригада: ${crew}.`);
  out.push('');out.push(['№','Наименование','Ед. изм.','Кол-во','Цена, BYN','Сумма, BYN'].join('\t'));
  rows.forEach(r=>{
    if(r.t==='sec') out.push(['',r.name,'','','',''].join('\t'));
    else if(r.t==='line') out.push([r.no,r.name,r.unit,r.qty===''?'':plain(r.qty),r.price===''?'':plain(r.price.toFixed(2)),plain(r.sum.toFixed(2))].join('\t'));
    else out.push(['',r.name,'','','',plain(r.sum.toFixed(2))].join('\t'));
  });
  out.push('');kpNote().split('\n').forEach(x=>out.push(x));
  return out.join('\n');
}
function kpHtml(){
  const rows=kpRows(); const crew=crewText();
  const f='font-family:Arial,sans-serif;';
  const b=f+'border:1px solid #9aa0a8;padding:4px 6px;font-size:10pt;';
  const R=b+'text-align:right;white-space:nowrap;', C=b+'text-align:center;';
  let h=`<p style="${f}font-size:9pt;color:#555;margin:0">ЧТУП «ОллВижн»</p>
<p style="${f}font-size:13pt;font-weight:bold;margin:2pt 0">Командировочные и транспортные расходы</p>
<p style="${f}font-size:10pt;margin:0">${esc(metaParts().join(' · '))}</p>
${crew?`<p style="${f}font-size:10pt;margin:2pt 0 6pt">Бригада: ${esc(crew)}.</p>`:''}
<table style="border-collapse:collapse;width:100%"><tr>
<th style="${C}background:#eef0f3">№</th><th style="${b}background:#eef0f3;text-align:left">Наименование</th><th style="${C}background:#eef0f3">Ед. изм.</th><th style="${R}background:#eef0f3">Кол-во</th><th style="${R}background:#eef0f3">Цена, BYN</th><th style="${R}background:#eef0f3">Сумма, BYN</th></tr>`;
  rows.forEach(r=>{
    if(r.t==='sec') h+=`<tr><td colspan="6" style="${b}background:#f5f6f8;font-weight:bold">${esc(r.name)}</td></tr>`;
    else if(r.t==='line') h+=`<tr><td style="${C}">${r.no}</td><td style="${b}">${esc(r.name)}</td><td style="${C}">${esc(r.unit)}</td><td style="${R}">${r.qty===''?'':qtyF(r.qty)}</td><td style="${R}">${r.price===''?'':money(r.price)}</td><td style="${R}">${money(r.sum)}</td></tr>`;
    else h+=`<tr><td style="${b}"></td><td colspan="4" style="${b}font-weight:bold">${esc(r.name)}</td><td style="${R}font-weight:bold">${money(r.sum)}</td></tr>`;
  });
  return h+`</table><p style="${f}font-size:9pt;color:#555">${esc(kpNote()).replace(/\n/g,'<br>')}</p>`;
}
function kpText(){
  const {p,sections,reserve,vat,total}=model; const out=[];
  out.push(`Командировочные и транспортные расходы${p.place?` (${p.place})`:''}: ${money(total)} BYN${p.vat?' с НДС':''}.`);
  const crew=crewText(); if(crew) out.push(`Бригада: ${crew}.`);
  sections.forEach(s=>{out.push(`${s.art} — ${money(s.total)} BYN`);
    if(view==='detail') s.lines.forEach(l=>out.push(`  · ${l.name}: ${qtyF(l.qty)} ${l.unit} × ${money(l.price)} = ${money(l.sum)}`));});
  if(reserve>0) out.push(`Запас ${qtyF(p.reserve)}% — ${money(reserve)} BYN`);
  if(vat>0) out.push(`НДС 20% — ${money(vat)} BYN`);
  out.push(kpNote());
  return out.join('\n');
}
function showFallback(text,msg){const ta=$('copyOut');ta.value=text;ta.hidden=false;ta.focus();ta.select();$('copyMsg').textContent=msg;}
$('copyTable').addEventListener('click',()=>{
  const tsv=kpTsv(), html=kpHtml();
  const ok=()=>{$('copyOut').hidden=true;$('copyMsg').textContent='Таблица скопирована: вставьте в Excel или Word.';};
  const viaText=()=>{try{navigator.clipboard.writeText(tsv).then(ok,()=>showFallback(tsv,'Не удалось скопировать: выделите текст ниже и скопируйте вручную.'));}catch(e){showFallback(tsv,'Выделите текст ниже и скопируйте вручную.');}};
  try{
    if(window.ClipboardItem&&navigator.clipboard&&navigator.clipboard.write){
      navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([tsv],{type:'text/plain'})})]).then(ok,viaText);
    }else viaText();
  }catch(e){viaText();}
});
$('copyText').addEventListener('click',()=>{
  const t=kpText();
  try{navigator.clipboard.writeText(t).then(()=>{$('copyOut').hidden=true;$('copyMsg').textContent='Текст скопирован.';},()=>showFallback(t,'Выделите текст ниже и скопируйте вручную.'));}
  catch(e){showFallback(t,'Выделите текст ниже и скопируйте вручную.');}
});
document.querySelectorAll('input[name="view"]').forEach(r=>r.addEventListener('change',e=>{view=e.target.value;renderKp();save();}));

/* ---------- storage ---------- */
function save(){try{const o={groups,cars,custom,view,seq,cur};FIELD_IDS.forEach(id=>o[id]=getField(id));localStorage.setItem(KEY,JSON.stringify(o));}catch(e){}}
function load(){
  try{const o=JSON.parse(localStorage.getItem(KEY)||'null');if(!o)return;
    FIELD_IDS.forEach(id=>{if(id in o)setField(id,o[id]);});
    if(Array.isArray(o.groups)&&o.groups.length)groups=o.groups;
    if(Array.isArray(o.cars))cars=o.cars.map(c=>Object.assign(c,{kind:'car'}));
    if(Array.isArray(o.custom))custom=o.custom;
    if(o.view){const r=document.querySelector(`input[name="view"][value="${o.view}"]`);if(r){r.checked=true;view=o.view;}}
    if(o.seq)seq=o.seq;
    if(o.cur&&typeof o.cur==='object')cur=Object.assign(blankCur(),o.cur);
  }catch(e){}
}
FIELD_IDS.forEach(id=>{const el=$(id);
  if(el.type==='checkbox'||el.tagName==='SELECT'||el.type==='date'){el.addEventListener('change',calc);if(el.tagName==='SELECT')el.addEventListener('input',calc);}
  else el.addEventListener('input',calc);});
$('resetBtn').addEventListener('click',()=>{
  try{localStorage.removeItem(KEY);}catch(e){}
  FIELD_IDS.forEach(id=>setField(id,DEF_FIELDS[id]));
  groups=clone(DEF_GROUPS);cars=[];custom=[];view='detail';cur=blankCur();document.querySelector('input[name="view"][value="detail"]').checked=true;
  renderGroups();renderCars();renderCustom();calc();$('copyMsg').textContent='';
});
/* ---------- сохранённые расчёты — в базе сайта (kab.php: trips, trip_get, trip_save), владелец 07.11.2026 ----------
   Номер КР-ГГГГ-NNN даёт сервер. Каждое «Сохранить» — новая редакция того же номера. Черновик на этой странице — в памяти браузера (KEY). */
function blankCur(){return {num:'',version:0,clientId:'',project:'',savedAt:'',pub:false,pubAt:''};}
var cur=blankCur();
let clients=[], dirty=false, staff=false, editMode=false;
// сохранённый расчёт закрыт для правки, пока не нажали «Редактировать»; новый — открыт сразу
function applyLock(){
  const lk=!!cur.num&&!editMode&&staff;
  const r=document.querySelector('.trip'); if(r)r.classList.toggle('locked',lk);
  document.querySelectorAll('.trip .grid input,.trip .grid select,.trip .grid textarea,.trip .grid button,#client,#project,#noteExtra').forEach(el=>{el.disabled=lk;});
}
const dispNum=n=>String(n).replace(/^KR-/,'КР-');
function clientName(id){const c=clients.find(x=>String(x.id)===String(id));return c?c.name:'';}
function dbMsg(t,err){const m=$('dbMsg');m.textContent=t||'';m.classList.toggle('err',!!err);}
const api=async(a,body)=>{const r=await fetch('/kab.php?a='+a,body===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-HDL':'1'},body:JSON.stringify(body)});
  let j={};try{j=await r.json();}catch(e){} j.status=r.status; return j;};
const isoAt=s=>s?String(s).replace(' ','T'):'';
function snapshotState(){const o={groups:clone(groups),cars:clone(cars),custom:clone(custom),view};FIELD_IDS.forEach(id=>o[id]=getField(id));return o;}
function applyState(o){
  FIELD_IDS.forEach(id=>{if(id in o)setField(id,o[id]);});
  groups=Array.isArray(o.groups)&&o.groups.length?clone(o.groups):clone(DEF_GROUPS);
  cars=Array.isArray(o.cars)?o.cars.map(c=>Object.assign({},c,{kind:'car'})):[];
  custom=Array.isArray(o.custom)?clone(o.custom):[];
  view=o.view||'detail';const r=document.querySelector(`input[name="view"][value="${view}"]`);if(r)r.checked=true;
  [...groups,...cars,...custom].forEach(x=>{const n=parseInt(String(x.id).replace(/\D/g,''),10);if(n>seq)seq=n;});
  renderGroups();renderCars();renderCustom();calc();
}
function renderHeader(){
  $('calcNum').innerHTML=cur.num?`${esc(dispNum(cur.num))}<small>${cur.version>1?'ред. '+cur.version+' · ':''}${cur.savedAt?esc(new Date(isoAt(cur.savedAt)).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})):''}${dirty?' · есть несохранённые правки':''}</small>`:`Новый расчёт<small>${dirty?'не сохранён':'не сохранён'}</small>`;
  const lk=!!cur.num&&!editMode;
  $('saveBtn').textContent=cur.num?'Сохранить изменения':'Сохранить';
  $('saveBtn').hidden=lk; $('editBtn').hidden=!lk; $('cancelBtn').hidden=!(cur.num&&editMode);
  $('saveNewBtn').hidden=!cur.num;
  const ok=$('savedOk'); ok.hidden=!lk; ok.textContent=lk&&cur.savedAt?`✓ Сохранено ${new Date(isoAt(cur.savedAt)).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})}`:'';
  applyLock();
  renderPub();
  document.title=(cur.num?dispNum(cur.num)+' — ':'')+'Командировочные бригады — HDL в Беларуси';
}
function renderClients(){
  const sel=$('client'), v=cur.clientId;
  sel.innerHTML='<option value="">— без клиента —</option>'+clients.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  sel.value=clients.some(c=>String(c.id)===String(v))?String(v):'';
}
function renderProjects(list){
  const sel=$('project'), v=cur.project, names=list.slice(); if(v&&!names.includes(v))names.push(v);
  sel.innerHTML='<option value="">— без проекта —</option>'+names.map(n=>`<option>${esc(n)}</option>`).join('');
  sel.value=v||'';
}
async function openNum(num){
  const j=await api('trip_get&num='+encodeURIComponent(num));
  if(!j.ok){dbMsg(j.status===404?`Расчёт ${num} не найден.`:'Не удалось открыть расчёт.',true);return;}
  const t=j.trip;
  cur={num:t.num,version:t.version||1,clientId:t.user_id?String(t.user_id):'',project:t.project||'',savedAt:t.saved_at||'',pub:!!t.pub,pubAt:t.pub_at||''};
  editMode=false;applyState(t.state||{});dirty=false;renderClients();$('project').value=cur.project;renderHeader();renderKp();save();dbMsg(`Открыт ${dispNum(t.num)}.`);
}
let leaveArmed=0;
function confirmLeave(){ // два нажатия вместо окна
  if(Date.now()-leaveArmed<6000){leaveArmed=0;return true;}
  leaveArmed=Date.now();dbMsg('Есть несохранённые правки. Нажмите ещё раз, чтобы продолжить без сохранения.',true);return false;
}
async function doSave(asNew){
  if(!staff){dbMsg('Сохранять расчёты могут только сотрудники — войдите в кабинет.',true);return;}
  const btns=[$('saveBtn'),$('saveNewBtn')];btns.forEach(b=>b.disabled=true);dbMsg('Сохраняю…');
  try{
    const p=params();
    const wasNum=cur.num;cur.num=asNew?'':cur.num;const snap=docSnap();cur.num=wasNum;
    const j=await api('trip_save',{num:asNew?'':cur.num,user_id:+cur.clientId||0,project:cur.project||'',place:p.place,dist:p.dist,total:model.total,vat:p.vat,state:snapshotState(),doc:fixDoc(snap,asNew?null:cur)});
    if(!j.ok){dbMsg(j.status===401||j.status===403?'Нужен вход сотрудника.':j.status===404?'Расчёт или клиент не найден — обновите страницу.':'Не удалось сохранить. Попробуйте ещё раз.',true);return;}
    cur={num:j.num,version:j.version,clientId:cur.clientId,project:cur.project,savedAt:j.saved_at,pub:!!j.pub,pubAt:j.pub_at||''};dirty=false;editMode=false;renderHeader();renderKp();save();
    return true;
    history.replaceState(null,'','#'+encodeURIComponent(j.num));
    dbMsg(`Сохранено: ${dispNum(j.num)}${j.version>1?', ред. '+j.version:''}.`);
  }catch(e){dbMsg('Не удалось сохранить. Проверьте связь и попробуйте ещё раз.',true);}
  finally{btns.forEach(b=>b.disabled=false);}
}
// номер и редакция в шапке формы клиента — как будут после сохранения
function fixDoc(d,c){if(!c||!c.num)return d;const m=d.meta.slice();m[0]=`Расчёт № ${dispNum(c.num)} (ред. ${(c.version||0)+1})`;return Object.assign({},d,{meta:m});}
// выложить клиенту / убрать (владелец 07.11.2026). Несохранённое — сначала сохраняем: клиент видит сохранённую редакцию
function renderPub(){
  const b=$('pubBtn'),st=$('pubState'),tg=$('pubTg').closest('label');
  const at=cur.pubAt?new Date(String(cur.pubAt).replace(' ','T')).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'';
  b.textContent=cur.pub?'Убрать у клиента':'Выложить клиенту';
  tg.hidden=cur.pub;
  st.innerHTML=cur.pub?`<b>У клиента:</b> выложен ${esc(at)}${dirty?' · несохранённые правки клиент не видит':''}`:(cur.clientId?'Клиент расчёт пока не видит.':'Чтобы выложить, выберите клиента.');
}
$('pubBtn').addEventListener('click',async()=>{
  if(!staff)return;
  const on=!cur.pub;
  if(on&&!cur.clientId){dbMsg('Выберите клиента — кому выложить расчёт.',true);$('client').focus();return;}
  if(on&&(!cur.num||dirty)){if(!(await doSave(false)))return;}
  const b=$('pubBtn');b.disabled=true;
  const j=await api('trip_pub',{num:cur.num,on,doc:on?docSnap():null,notify:on&&$('pubTg').checked});
  b.disabled=false;
  if(!j.ok){dbMsg(j.error==='client'?'Сначала выберите клиента и сохраните.':'Не удалось. Попробуйте ещё раз.',true);return;}
  cur.pub=j.pub;cur.pubAt=j.pub_at||'';$('pubTg').checked=false;save();renderHeader();
  dbMsg(on?`Выложено клиенту: ${clientName(cur.clientId)}. Он увидит расчёт в кабинете, во вкладке «Сметы».`+($('pubTg')&&j.sent?' Ему ушло сообщение в Telegram.':''):'Убрано: клиент расчёт больше не видит.');
});
$('saveBtn').addEventListener('click',()=>doSave(false));
$('editBtn').addEventListener('click',()=>{editMode=true;renderHeader();dbMsg('Правка: поменяйте нужное и нажмите «Сохранить изменения».');});
$('cancelBtn').addEventListener('click',async()=>{if(dirty&&!confirmLeave())return;dirty=false;await openNum(cur.num);dbMsg('Правки отменены — расчёт как был сохранён.');});
$('saveNewBtn').addEventListener('click',()=>doSave(true));
$('newCalcBtn').addEventListener('click',()=>{
  if(dirty&&!confirmLeave())return;
  const keep={clientId:cur.clientId,project:cur.project}; cur=Object.assign(blankCur(),keep); dirty=false; editMode=false;
  history.replaceState(null,'',location.pathname);
  renderHeader();renderKp();save();dbMsg('Новый расчёт: цифры оставлены, номер присвоится при сохранении.');
});
$('client').addEventListener('change',e=>{cur.clientId=e.target.value;markDirty();renderKp();save();renderPub();});
$('printBtn').addEventListener('click',()=>window.print());
$('project').addEventListener('change',e=>{cur.project=e.target.value;markDirty();save();});
function markDirty(){if(!dirty){dirty=true;renderHeader();}}
const grid=document.querySelector('.trip .grid');
grid.addEventListener('input',markDirty);
grid.addEventListener('change',markDirty);
grid.addEventListener('click',e=>{if(e.target.closest('button'))setTimeout(markDirty,0);});
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

// курс НБРБ — с сайта на день сборки (для нового расчёта)
const root=document.querySelector('.trip');
if(root&&root.dataset.rate){DEF_FIELDS.rate=+root.dataset.rate;DEF_FIELDS.rateDate=root.dataset.rateDate||DEF_FIELDS.rateDate;}
let hadDraft=false;try{hadDraft=!!localStorage.getItem(KEY);}catch(e){}
load();
if(!hadDraft){setField('rate',DEF_FIELDS.rate);setField('rateDate',DEF_FIELDS.rateDate);}
renderGroups();renderCars();renderCustom();calc();renderHeader();
(async()=>{
  const me=await api('me');
  staff=!!(me.ok&&me.user&&me.user.role==='staff');
  if(!staff){
    document.querySelectorAll('.trip section.panel, .trip .grid').forEach(x=>{x.hidden=true;});
    const want=decodeURIComponent(location.hash.slice(1));
    const j=me.ok&&want?await api('trip_get&num='+encodeURIComponent(want)):null;
    if(j&&j.ok&&j.trip.doc){  // клиент: расчёт, выложенный ему, — только форма КП
      root.classList.add('ok','client');
      try{localStorage.removeItem(KEY);}catch(e){}
      $('kpPanel').hidden=false;
      document.querySelector('.trip header h1').textContent='Расчёт '+dispNum(j.trip.num);
      document.querySelector('.trip header .sub').textContent='Расчёт от ЧТУП «ОллВижн». Чтобы сохранить, нажмите «Распечатать или сохранить PDF».';
      renderDoc(j.trip.doc);
      document.title=dispNum(j.trip.num)+' — командировочные расходы — HDL в Беларуси';
      return;
    }
    document.querySelector('[data-trip-deny]').hidden=false;
    if(me.ok&&want)document.querySelector('[data-trip-deny]').textContent='Расчёт не найден: возможно, его убрали. Откройте кабинет.';
    return;
  }  // не сотрудник — только пояснение и вход
  root.classList.add('ok');  // сотрудник: расчёт виден (до проверки скрыт — черновик в памяти браузера не показываем другим)
  const [u,pr]=await Promise.all([api('users'),api('projects')]);
  clients=(u.users||[]).filter(x=>x.status!=='blocked').map(x=>({id:String(x.id),name:(x.name||x.tg_name||'—')+(x.company?' · '+x.company:'')}));
  renderClients();renderProjects(pr.projects||[]);
  const want=decodeURIComponent(location.hash.slice(1));
  if(want)await openNum(want);
  else renderHeader();
  renderKp();
})();
addEventListener('hashchange',()=>{const want=decodeURIComponent(location.hash.slice(1));if(staff&&want&&want!==cur.num)openNum(want);});
})();
