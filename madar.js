/* مدار مشروعات — الصفحة الرئيسية (أداء المحفظة)، المدن، ومدارات الحجوزات والمزادات والشراكات.
   يعمل فوق نفس المخزن (Store) ونفس الحفظ السحابي لمدار الأصول، فلا توجد نسختان من أي رقم. */
'use strict';

/* ───────── المدن ───────── */
const CITIES=[{id:'jubail',n:'الجبيل',c:'#2f6f8f'},{id:'yanbu',n:'ينبع',c:'#b9925a'},{id:'jazan',n:'جازان',c:'#3d7d5c'},{id:'raskhair',n:'رأس الخير',c:'#7d5a86'}];
const cityName=id=>(CITIES.find(c=>c.id===id)||{}).n||'كل المدن';
const kCity=k=>k.city||'yanbu';
App.city=(()=>{ const c=ls.get('am_city'); return CITIES.some(x=>x.id===c)?c:''; })();
const setCity=id=>{ App.city=id||''; ls.set('am_city',App.city); const s=$('#citySel'); if(s) s.value=App.city; };
const allAgreements=()=>Store.coll('contracts').filter(k=>OP_TYPES.includes(k.type));
const curCity=()=>App.city||'yanbu';

/* مدار الأصول: تجميع مجموعات القائمة تحت اسمه */
['dashboard','agreements','newproject','cashflow','alerts'].forEach(k=>{ if(M[k]) M[k].group='مدار الأصول'; });
['assets','documents','contracts','finance','users','reports'].forEach(k=>{ if(M[k]) M[k].group='مدار الأصول · السجلات'; });
['investor','operations'].forEach(k=>{ if(M[k]) M[k].group='مدار الأصول · التشغيل'; });
if(M.dashboard) M.dashboard.label='لوحة الأصول';

/* ───────── مؤشرات مدينة (أو كل المدن عند id فارغ) ─────────
   نفس دوال مدار الأصول: الربح والتكاليف من agreementPL، والوحدات والمتأخرات من agreementOps */
function cityStats(id){
  const ks=allAgreements().filter(k=>!id||kCity(k)===id), R=ks.map(k=>({k,...agreementPL(k),...agreementOps(k)}));
  const self=R.filter(x=>x.k.type==='تشغيل ذاتي'), inv=R.filter(x=>x.k.type==='مستثمر');
  const noi=self.reduce((t,x)=>t+x.rev-x.exp,0)+sum(inv,'due'), units=sum(self,'units'), occ=sum(self,'occ');
  const bk=Store.coll('bkUnits').filter(u=>!id||u.city===id), bkSold=bk.filter(u=>u.status==='مباعة'||u.status==='محجوزة');
  const au=Store.coll('auctions').filter(a=>!id||a.city===id), auOpen=au.filter(a=>a.status==='منشور');
  const pa=Store.coll('partners').filter(p=>!id||p.city===id||p.city==='all'), paOk=pa.filter(p=>p.status==='معتمد');
  const yb=(!id||id==='yanbu')?Number(Store.data.settings.bkYanbuUnits||300):0; // وحدات جبين تُدار في منصة الحجز المستقلة
  return {ks,n:ks.length,self:self.length,inv:inv.length,noi,pay:sum(R,'pay'),profit:sum(R,'profit'),units,occ,occPct:pct(occ,units),arrears:sum(R,'overdue'),
    allUnits:sum(R,'units'),bk:bk.length+yb,bkSold:bkSold.length,bkVal:sum(bk,'price'),au:au.length,auOpen:auOpen.length,auVal:sum(auOpen,'startPrice'),pa:pa.length,paOk:paOk.length};
}

/* ───────── النواقص: ما تحتاجه كل مدينة في كل مدار ─────────
   auto: يكتمل تلقائياً من البيانات. live: مكتمل مسبقاً في المدن التي يعمل فيها المدار */
const bkOf=c=>Store.coll('bkUnits').filter(u=>u.city===c);
const REQS={
  bookings:{l:'مدار الحجوزات',items:[
    {id:'master',l:'جدول الوحدات الرئيسي (الماستر)',d:'رقم الوحدة، الحي، البلوك، النموذج، المساحة، السعر، الجهة المخصصة. يُرفع من قالب Excel في المدار.',auto:c=>bkOf(c).length>0,live:['yanbu']},
    {id:'prices',l:'الأسعار المعتمدة لكل وحدة',d:'خطاب اعتماد الأسعار، ثم تُدخل في عمود السعر.',auto:c=>bkOf(c).length>0&&bkOf(c).every(u=>Number(u.price)>0),live:['yanbu']},
    {id:'plans',l:'مخططات الأحياء (PDF أو صورة)',d:'مخطط علوي لكل حي، لتلوين الوحدات حسب حالتها على الخريطة.',live:['yanbu']},
    {id:'alloc',l:'جداول التخصيص للجهات',d:'أي الوحدات مخصصة لأي شركة أو جهة.',live:['yanbu']},
    {id:'users',l:'الموظفون وأدوارهم',d:'بريد كل موظف ودوره: مدخل حجوزات، معتمد، مدير.',live:['yanbu']},
    {id:'sakani',l:'آلية سكني ومهلة التوقيع',d:'عدد الأيام بين التسجيل في سكني وتوقيع العقد.',live:['yanbu']},
    {id:'forms',l:'نماذج عرض السعر والعقد',d:'النماذج التي يوقعها العميل.',live:['yanbu']},
    {id:'system',l:'تفعيل منصة الحجز للمدينة',d:'نسخة من منصة الحجز بدخول آمن وقاعدة بيانات مستقلة. تُجهّز بعد اكتمال البنود أعلاه.',live:['yanbu']},
    {id:'link',l:'ربط أرقام الحجوزات بأداء المحفظة',d:'لعرض المحجوز والمعتمد في الصفحة الرئيسية بدون أي بيانات عملاء.',only:['yanbu']}]},
  assets:{l:'مدار الأصول',items:[
    {id:'agr',l:'اتفاقيات التخصيص والتشغيل',d:'اتفاقية لكل مشروع مع الهيئة الملكية: المدة والمبلغ السنوي ونموذج التشغيل.',auto:c=>allAgreements().some(k=>kCity(k)===c)},
    {id:'units',l:'سجل المباني والوحدات',d:'يُنشأ تلقائياً من «إضافة مشروع».',auto:c=>allAgreements().filter(k=>kCity(k)===c).some(k=>agreementOps(k).units>0)},
    {id:'leases',l:'عقود الإيجار أو عقد المستثمر',d:'عقود المستأجرين في التشغيل الذاتي، أو عقد المستثمر ودفعاته.',auto:c=>allAgreements().filter(k=>kCity(k)===c).some(k=>Store.coll('contracts').some(x=>x.parentId===k.id&&x.type!=='تشغيل وصيانة')||k.type==='مستثمر')},
    {id:'map',l:'صورة المدينة وموقع المشاريع على الخريطة',d:'صورة قمر صناعي للمدينة ونقطة لكل مشروع.',live:['yanbu']},
    {id:'cond',l:'أول تقرير لحالة الوحدات وسلامتها',d:'ملف Excel من المشغّل حسب القالب في سجل الأصول.',auto:c=>Store.coll('unitReports').some(r=>{ const k=Store.get('contracts',r.contractId); return k&&kCity(k)===c; })}]},
  whatif:{l:'مدار تحليل الفرص',items:[
    {id:'data',l:'بيانات الفرصة الأولى',d:'عدد الوحدات، الإيجار المتوقع، المبلغ للهيئة، تكلفة التجهيز، وعرض المستثمر إن وجد.'}]},
  auctions:{l:'مدار المزادات',items:[
    {id:'opps',l:'قائمة الأراضي أو الأصول المراد طرحها',d:'تُضاف كفرص في مدار المزادات.',auto:c=>Store.coll('auctions').some(a=>a.city===c)},
    {id:'val',l:'تقييم معتمد لكل فرصة',d:'يحدد السعر الافتتاحي.'},
    {id:'terms',l:'كراسة الشروط والمواصفات',d:'الشروط، الضمان البنكي، مدة العقد.'},
    {id:'ok',l:'موافقة الإدارة على الطرح',d:'قرار أو خطاب بالموافقة.'},
    {id:'public',l:'تفعيل استقبال العروض من العامة',d:'يحتاج قاعدة في Firebase تسمح بإضافة عرض فقط، بدون قراءة أي بيانات. إلى ذلك الحين تُسجّل العروض من داخل المدار.'}]},
  partners:{l:'مدار الشراكات',items:[
    {id:'needs',l:'احتياج المدينة من الموردين والمقاولين',d:'التخصصات المطلوبة: صيانة، نظافة، أمن، مقاولات...'},
    {id:'criteria',l:'معايير تأهيل الموردين',d:'السجل التجاري، شهادة الزكاة، الخبرات، التصنيف.'},
    {id:'first',l:'أول مورد أو شريك مسجل',d:'يُضاف من مدار الشراكات أو برفع ملف Excel.',auto:c=>Store.coll('partners').some(p=>p.city===c)},
    {id:'public',l:'تفعيل نموذج التسجيل العام للموردين',d:'نفس قاعدة الاستقبال العامة في Firebase.'}]}
};
const MADARS=[
  {k:'bookings',ic:'🗝️',n:'مدار الحجوزات',d:'بيع الوحدات وحجزها واعتمادها',go:'#bookings'},
  {k:'assets',ic:'🏗️',n:'مدار الأصول',d:'الأصول المؤجرة والتشغيل والتدفق النقدي',go:'#dashboard'},
  {k:'whatif',ic:'🔍',n:'مدار تحليل الفرص',d:'مقارنة التشغيل الذاتي بالإسناد لمستثمر',go:'#whatif'},
  {k:'auctions',ic:'🔨',n:'مدار المزادات',d:'طرح الفرص الاستثمارية واستقبال العروض',go:'#auctions'},
  {k:'partners',ic:'🤝',n:'مدار الشراكات',d:'قاعدة الموردين والشركاء والتعامل معهم',go:'#partners'}];
const reqItems=(c,m)=>REQS[m].items.filter(r=>!r.only||r.only.includes(c));
const reqRec=(c,m,r)=>Store.coll('reqs').find(x=>x.id===`${c}:${m}:${r}`);
const reqDone=(c,m,r)=>{ if(r.live&&r.live.includes(c)) return 'live'; if(r.auto&&r.auto(c)) return 'auto'; const x=reqRec(c,m,r.id); return x&&x.done?'manual':''; };
const reqProgress=(c,m)=>{ const ms=m?[m]:Object.keys(REQS); let t=0,d=0; ms.forEach(k=>reqItems(c,k).forEach(r=>{ t++; if(reqDone(c,k,r)) d++; })); return {t,d,p:pct(d,t)}; };
function reqToggle(c,m,r,note){ const id=`${c}:${m}:${r.id}`; let x=Store.get('reqs',id); const done=!(x&&x.done);
  if(!x){ x={id,city:c,madar:m,req:r.id}; Store.coll('reqs').push(x); }
  Object.assign(x,{done,note:note||x.note||'',at:now(),by:App.user.id}); Store.log(done?'استلام':'إلغاء استلام','reqs',id,`${cityName(c)} · ${REQS[m].l} · ${r.l}${note?' · '+note:''}`); Store.save(); }
function reqsHtml(c,only){
  return (only?[only]:Object.keys(REQS)).map(m=>{ const P=reqProgress(c,m), items=reqItems(c,m);
    return `<div class="card mb rq"><div class="rqh"><b>${REQS[m].l}</b><span class="pill ${P.p===100?'ok':P.d?'warn':'bad'}">${P.d} من ${P.t}</span><span class="rqbar"><i style="width:${P.p}%"></i></span></div>
      <ul class="rql">${items.map(r=>{ const s=reqDone(c,m,r), x=reqRec(c,m,r.id);
        return `<li class="${s?'done':''}"><span class="rqi">${s?'✓':'!'}</span><div><b>${esc(r.l)}</b><span class="small muted">${esc(r.d||'')}</span>${x&&x.note?`<span class="small">ملاحظة: ${esc(x.note)} · ${esc(x.at)}</span>`:''}</div>
          ${s==='live'?'<span class="pill ok">يعمل</span>':s==='auto'?'<span class="pill ok">مكتمل من البيانات</span>':r.auto?'<span class="pill bad">ناقص</span>':can('edit')?`<button class="btn sm ${s?'':'p'}" data-rq="${m}|${r.id}">${s?'إلغاء الاستلام':'تم الاستلام'}</button>`:`<span class="pill ${s?'ok':'bad'}">${s?'مستلم':'ناقص'}</span>`}</li>`; }).join('')}</ul></div>`; }).join('');
}
function bindReqs(v,c,rerender){ v.querySelectorAll('[data-rq]').forEach(b=>b.onclick=()=>{ const [m,id]=b.dataset.rq.split('|'), r=REQS[m].items.find(x=>x.id===id), x=reqRec(c,m,id);
  if(x&&x.done){ reqToggle(c,m,r); rerender(); return; }
  Modal.open({title:'تأكيد الاستلام: '+esc(r.l),body:`<p class="muted">${esc(r.d||'')}</p><div class="form"><div class="f full"><label>ملاحظة (اختياري): اسم الملف، المرسِل، أو مكان حفظه</label><input id="rqN"></div></div>`,footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="rqOk">تم الاستلام</button>`});
  $('#rqOk').onclick=()=>{ reqToggle(c,m,r,$('#rqN').value.trim()); Modal.close(); toast('سُجّل الاستلام'); rerender(); }; }); }

/* ───────── عناصر عرض مشتركة ───────── */
const kpiC=(l,v,s,c)=>`<div class="card kpi" style="--kc:${c||'var(--gold)'}"><div class="l">${l}</div><div class="v">${v}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
const mShort=n=>n?short(n):'0';

/* ───────── الصفحة الرئيسية: أداء المحفظة لكل المدن ───────── */
M.home={key:'home',label:'أداء المحفظة',icon:'🧭',group:'مدار مشروعات',render(v){
  const T=cityStats(''), C=CITIES.map(c=>({...c,S:cityStats(c.id),P:reqProgress(c.id)})), active=C.filter(c=>c.S.n||c.S.bk||c.S.au||c.S.pa).length;
  v.innerHTML=`<div class="mhero"><div class="mark">${MADAR_MARK}</div><div><h1>مدار مشروعات</h1><p>أداء المحفظة في كل المدن · محسوب من بيانات المدارات حتى ${todayStr()}</p></div></div>
  <div class="grid g4 mb">
    ${kpiC('صافي دخل المحفظة السنوي',mShort(T.noi)+' <small>ر.س</small>','إيجارات التشغيل الذاتي بعد تكاليفه، مع دفعات المستثمرين','var(--ok)')}
    ${kpiC('صافي الربح بعد الهيئة',mShort(T.profit)+' <small>ر.س</small>',`بعد ${mShort(T.pay)} ر.س للهيئة الملكية سنوياً`,'var(--gold)')}
    ${kpiC('المشاريع التشغيلية',T.n,`${T.self} تشغيل ذاتي · ${T.inv} إسناد لمستثمر · في ${active} من ${CITIES.length} مدن`,'var(--sky)')}
    ${kpiC('إشغال التشغيل الذاتي',T.units?T.occPct+'%':'—',T.units?`${T.occ} مؤجرة من ${T.units} وحدة`:'لا توجد وحدات تشغيل ذاتي بعد','var(--wood)')}
    ${kpiC('المتأخرات على المستأجرين',mShort(T.arrears)+' <small>ر.س</small>','دفعات حلّ موعدها ولم تُسدد','var(--red)')}
    ${kpiC('وحدات الحجوزات',T.bk,`${T.bkSold} محجوزة أو مباعة في المدارات الجديدة${Store.data.settings.bkYanbuUnits!==0?' · وحدات ينبع في منصة الحجز':''}`,'#2f6f8f')}
    ${kpiC('الفرص المطروحة للمزاد',T.auOpen,T.auOpen?`بأسعار افتتاحية ${mShort(T.auVal)} ر.س`:`${T.au} فرصة مسجلة`,'#7d5a86')}
    ${kpiC('الشركاء والموردون',T.pa,`${T.paOk} معتمد`,'#3d7d5c')}
  </div>
  <h3 class="sec">المدن</h3>
  <div class="cgrid mb">${C.map(c=>`<a class="ctile" href="#c_${c.id}" style="--cc:${c.c}">
      <div class="ct1"><span class="cpin">📍</span><b>${c.n}</b><span class="pill ${c.S.n||c.S.bk>0?'ok':''}">${c.S.n||(c.id==='yanbu')?'نشطة':'جاهزة للإضافة'}</span></div>
      <div class="ctn"><div><span>صافي الدخل</span><b>${mShort(c.S.noi)}</b></div><div><span>مشاريع</span><b>${c.S.n}</b></div><div><span>وحدات حجز</span><b>${c.S.bk}</b></div><div><span>مزادات</span><b>${c.S.au}</b></div></div>
      <div class="ctp"><span>اكتمال البيانات ${c.P.p}%</span><span class="rqbar"><i style="width:${c.P.p}%"></i></span></div></a>`).join('')}</div>
  <div class="card"><h3 style="margin-top:0">مقارنة المدن</h3><div class="twrap"><table class="tbl"><thead><tr><th>المدينة</th><th>صافي الدخل السنوي</th><th>المشاريع</th><th>الإشغال</th><th>المتأخرات</th><th>وحدات الحجز</th><th>المزادات</th><th>الشركاء</th><th>النواقص</th></tr></thead><tbody>
    ${C.map(c=>`<tr class="clk" onclick="location.hash='#c_${c.id}'"><td><b>${c.n}</b></td><td>${money(c.S.noi)}</td><td>${num(c.S.n)}</td><td>${c.S.units?c.S.occPct+'%':'—'}</td><td>${money(c.S.arrears)}</td><td>${num(c.S.bk)}</td><td>${num(c.S.au)}</td><td>${num(c.S.pa)}</td><td><span class="pill ${c.P.t-c.P.d?'warn':'ok'}">${c.P.t-c.P.d} ناقص</span></td></tr>`).join('')}
    <tr class="tot"><td><b>الإجمالي</b></td><td><b>${money(T.noi)}</b></td><td><b>${num(T.n)}</b></td><td>${T.units?T.occPct+'%':'—'}</td><td>${money(T.arrears)}</td><td>${num(T.bk)}</td><td>${num(T.au)}</td><td>${num(T.pa)}</td><td></td></tr></tbody></table></div>
    <p class="small muted" style="margin:10px 0 0">الدخل والإشغال والمتأخرات من مدار الأصول بنفس طريقة حساب لوحته. وحدات ينبع (${Number(Store.data.settings.bkYanbuUnits||300)}) تُدار في منصة الحجز المستقلة.</p></div>`;
}};

/* ───────── صفحة المدينة ───────── */
function renderCity(v,id){
  setCity(id); const c=CITIES.find(x=>x.id===id), S=cityStats(id), P=reqProgress(id);
  const nums={bookings:[[S.bk,'وحدة'],[S.bkSold,'محجوزة']],assets:[[S.n,'مشروع'],[mShort(S.noi),'صافي الدخل']],whatif:[[Store.data.wiStudies&&Store.data.wiStudies[WI_KEY]?1:0,'دراسة'],['',' ']],auctions:[[S.auOpen,'منشورة'],[S.au,'إجمالي']],partners:[[S.pa,'مسجل'],[S.paOk,'معتمد']]};
  const st=m=>{ const p=reqProgress(id,m); return p.d===p.t?'<span class="pill ok">مكتمل</span>':m==='assets'&&S.n||m==='bookings'&&id==='yanbu'?`<span class="pill ok">فعّال</span> <span class="pill warn">${p.t-p.d} ناقص</span>`:`<span class="pill warn">جاهز للإضافة · ${p.t-p.d} ناقص</span>`; };
  v.innerHTML=`<div class="mhero city" style="--cc:${c.c}"><div class="cpinb">📍</div><div><h1>${c.n}</h1><p>${S.n||id==='yanbu'?'مدارات المدينة وأرقامها':'المدينة جاهزة لاستقبال البيانات. النواقص في التبويب أدناه.'} · اكتمال البيانات ${P.p}%</p></div><a class="btn" href="#home">← كل المدن</a></div>
  <div class="grid g4 mb">
    ${kpiC('صافي الدخل السنوي',mShort(S.noi)+' <small>ر.س</small>',S.n?`بعد الهيئة: ${mShort(S.profit)} ر.س`:'لا توجد اتفاقيات تشغيل بعد','var(--ok)')}
    ${kpiC('المشاريع التشغيلية',S.n,S.n?`${S.self} ذاتي · ${S.inv} مستثمر`:'تُضاف من مدار الأصول','var(--sky)')}
    ${kpiC('الإشغال',S.units?S.occPct+'%':'—',S.units?`${S.occ} من ${S.units} وحدة`:'—','var(--wood)')}
    ${kpiC('المتأخرات',mShort(S.arrears)+' <small>ر.س</small>','على المستأجرين','var(--red)')}
  </div>
  <h3 class="sec">المدارات</h3>
  <div class="mgrid mb">${MADARS.map(m=>`<a class="mtile" href="${m.go}"><div class="mt1"><span class="mic">${m.ic}</span><div><b>${m.n}</b><span>${m.d}</span></div></div>
    <div class="mtn">${nums[m.k].filter(x=>x[0]!=='').map(x=>`<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div><div class="mtf">${st(m.k)}<span class="go">فتح ←</span></div></a>`).join('')}</div>
  <h3 class="sec">النواقص <span class="small muted">ما تحتاجه ${c.n} في كل مدار. البنود المكتملة من البيانات تُحدَّث تلقائياً.</span></h3>
  <div id="cReq">${reqsHtml(id)}</div>`;
  bindReqs(v,id,()=>renderCity(v,id));
}
CITIES.forEach(c=>{ M['c_'+c.id]={key:'c_'+c.id,label:c.n,icon:'📍',group:'المدن',render(v){ renderCity(v,c.id); }}; });

/* شريط المدينة أعلى صفحات المدارات */
const cityBar=(v,rer)=>{ const el=document.createElement('div'); el.className='cbar'; el.innerHTML=`<span class="small muted">المدينة:</span>${CITIES.map(c=>`<button class="btn sm ${curCity()===c.id?'p':''}" data-cc="${c.id}">${c.n}</button>`).join('')}`; v.prepend(el); el.querySelectorAll('[data-cc]').forEach(b=>b.onclick=()=>{ setCity(b.dataset.cc); rer(); }); };

/* ───────── استيراد Excel عام: قالب + رفع + مراجعة قبل الحفظ ───────── */
async function xlsTemplate(name,cols,sample){ try{ const X=await xlsxLib(); const ws=X.utils.aoa_to_sheet([cols.map(c=>c.h),...(sample||[])]); ws['!cols']=cols.map(c=>({wch:Math.max(14,c.h.length+4)})); const wb=X.utils.book_new(); X.utils.book_append_sheet(wb,ws,'البيانات');
  const help=X.utils.aoa_to_sheet([['العمود','إلزامي','القيم المقبولة'],...cols.map(c=>[c.h,c.req?'نعم':'لا',c.opts?c.opts.join(' / '):c.type==='number'?'رقم':'نص'])]); X.utils.book_append_sheet(wb,help,'التعليمات');
  X.writeFile(wb,name); }catch(e){ toast(e.message||'تعذر إنشاء القالب'); } }
function xlsUpload(title,cols,apply){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.xlsx,.xls,.csv';
  inp.onchange=async()=>{ const f=inp.files[0]; if(!f) return; try{ const X=await xlsxLib(), wb=X.read(await f.arrayBuffer()), rows=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    const ok=[],bad=[]; rows.forEach((r,i)=>{ const o={}, err=[]; cols.forEach(c=>{ let v=String(r[c.h]??'').trim(); if(c.type==='number'&&v!==''){ v=Number(v.replace(/,/g,'')); if(isNaN(v)) err.push(c.h+' ليس رقماً'); } if(c.req&&(v===''||v==null)) err.push(c.h+' فارغ'); if(c.opts&&v!==''&&!c.opts.includes(v)) err.push(`${c.h}: «${v}» غير مقبول`); o[c.k]=v; });
      if(cols.every(c=>o[c.k]===''||o[c.k]==null)) return; (err.length?bad:ok).push({row:i+2,o,err}); });
    Modal.open({title:'مراجعة الملف: '+esc(title),wide:true,body:`<p><b>${ok.length}</b> سطر سليم · <b style="color:var(--red)">${bad.length}</b> سطر فيه أخطاء (لن يُحفظ).</p>${bad.length?`<div class="twrap"><table class="tbl"><thead><tr><th>السطر</th><th>الخطأ</th></tr></thead><tbody>${bad.slice(0,50).map(b=>`<tr><td>${b.row}</td><td>${esc(b.err.join('، '))}</td></tr>`).join('')}</tbody></table></div>`:''}<p class="small muted">الملف: ${esc(f.name)}. تُحدَّث السجلات الموجودة بنفس المعرّف، وتُضاف الجديدة. لا يُحذف شيء.</p>`,
      footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="xOk" ${ok.length?'':'disabled'}>حفظ ${ok.length} سطر</button>`});
    $('#xOk').onclick=()=>{ const n=apply(ok.map(x=>x.o),f.name); Modal.close(); toast(`حُفظ ${n} سجل`); };
  }catch(e){ toast('تعذر قراءة الملف'); } };
  inp.click(); }

/* ───────── مدار الحجوزات ───────── */
const BK_STATUS=['متاحة','محجوزة','مباعة','موقوفة'];
const BK_COLS=[{h:'رقم الوحدة',k:'unit',req:true},{h:'الحي',k:'district',req:true},{h:'البلوك',k:'block'},{h:'النموذج',k:'model'},{h:'المساحة م²',k:'area',type:'number'},{h:'السعر ر.س',k:'price',type:'number'},{h:'الجهة المخصصة',k:'company'},{h:'الحالة',k:'status',opts:BK_STATUS}];
const BKView={tab:'units'};
M.bookings={key:'bookings',label:'مدار الحجوزات',icon:'🗝️',group:'المدارات',render(v){
  const c=curCity(), U=bkOf(c), st=BKView, cnt=s=>U.filter(u=>(u.status||'متاحة')===s).length, P=reqProgress(c,'bookings');
  v.innerHTML=`${c==='yanbu'?`<div class="card mb live"><div><b>منصة الحجز في ينبع تعمل</b><span class="small muted">حجوزات مشروع جبين (العزيزية والنخيل) تُسجَّل في منصة مستقلة بدخول آمن، لأنها تحمل هويات العملاء وجوالاتهم.</span></div><a class="btn p" href="https://jabeen-bookings.online/" target="_blank" rel="noopener">فتح منصة الحجز ↗</a></div>`:''}
  <div class="grid g4 mb">${kpiC('الوحدات المسجلة',U.length+(c==='yanbu'?` <small>+ ${Number(Store.data.settings.bkYanbuUnits||300)} في المنصة</small>`:''),'من جدول الوحدات الرئيسي','#2f6f8f')}${kpiC('متاحة',cnt('متاحة'),'','var(--ok)')}${kpiC('محجوزة أو مباعة',cnt('محجوزة')+cnt('مباعة'),U.length?`قيمتها ${mShort(sum(U.filter(u=>u.status==='محجوزة'||u.status==='مباعة'),'price'))} ر.س`:'','var(--gold)')}${kpiC('جاهزية المدار',P.p+'%',`${P.t-P.d} بند ناقص`,P.p===100?'var(--ok)':'var(--red)')}</div>
  <div class="tabs"><button data-t="units" class="${st.tab==='units'?'active':''}">جدول الوحدات</button><button data-t="req" class="${st.tab==='req'?'active':''}">النواقص (${P.t-P.d})</button></div><div id="bkB"></div>`;
  cityBar(v,()=>M.bookings.render(v));
  v.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ st.tab=b.dataset.t; M.bookings.render(v); });
  const B=$('#bkB',v);
  if(st.tab==='req'){ B.innerHTML=reqsHtml(c,'bookings'); bindReqs(B,c,()=>M.bookings.render(v)); return; }
  B.innerHTML=`<div class="toolbar"><span class="small muted">جدول الوحدات الرئيسي لـ${cityName(c)}: بدون أي بيانات عملاء.</span><span class="sp"></span><button class="btn" id="bkT">⬇ قالب Excel</button>${can('create')?`<button class="btn p" id="bkU">⬆ رفع ملف الوحدات</button>`:''}</div><div id="bkT2"></div>`;
  $('#bkT',B).onclick=()=>xlsTemplate(`قالب-وحدات-${cityName(c)}.xlsx`,BK_COLS,[['A-001','العزيزية','B1','نموذج A',350,850000,'','متاحة']]);
  const up=$('#bkU',B); if(up) up.onclick=()=>xlsUpload('وحدات '+cityName(c),BK_COLS,(rows,fn)=>{ let n=0; rows.forEach(o=>{ const id=`BK-${c}-${o.unit}`, ex=Store.get('bkUnits',id); const rec={...o,status:o.status||'متاحة',city:c}; if(ex) Object.assign(ex,rec,{updatedAt:now()}); else Store.coll('bkUnits').push({id,...rec,createdAt:now()}); n++; }); Store.log('رفع ملف','bkUnits',c,`${fn} · ${n} وحدة · ${cityName(c)}`); Store.save(); M.bookings.render(v); return n; });
  crud({coll:'bkUnits',title:'وحدة',where:u=>u.city===c,defaultSort:'unit',
    columns:[{k:'unit',label:'رقم الوحدة'},{k:'district',label:'الحي'},{k:'block',label:'البلوك'},{k:'model',label:'النموذج'},{k:'area',label:'المساحة م²',fmt:u=>num(u.area)},{k:'price',label:'السعر',fmt:u=>money(u.price)},{k:'company',label:'الجهة المخصصة'},{k:'status',label:'الحالة',fmt:u=>`<span class="pill ${u.status==='متاحة'||!u.status?'ok':u.status==='موقوفة'?'':'gold'}">${esc(u.status||'متاحة')}</span>`}],
    fields:[{k:'unit',label:'رقم الوحدة',required:true},{k:'district',label:'الحي',required:true},{k:'block',label:'البلوك'},{k:'model',label:'النموذج'},{k:'area',label:'المساحة م²',type:'number'},{k:'price',label:'السعر ر.س',type:'number'},{k:'company',label:'الجهة المخصصة'},{k:'status',label:'الحالة',type:'select',options:BK_STATUS,default:'متاحة'}],
    filters:[{k:'district',label:'الحي',options:()=>[...new Set(U.map(u=>u.district).filter(Boolean))]},{k:'status',label:'الحالة',options:BK_STATUS}],
    onSave:(o,isNew)=>{ if(isNew){ o.city=c; Store.save(); } }, onChange:()=>M.bookings.render(v)},$('#bkT2',B));
}};

/* ───────── مدار المزادات ───────── */
const AU_TYPES=['أرض','مبنى أو وحدات','فرصة تشغيل','إيجار طويل الأجل','أخرى'], AU_STATUS=['مسودة','منشور','مغلق','تمت الترسية','ملغى'];
const bidsOf=id=>Store.coll('bids').filter(b=>b.auctionId===id).sort((a,b)=>b.amount-a.amount);
const auTop=a=>{ const b=bidsOf(a.id)[0]; return b?b.amount:0; };
const auState=a=>a.status==='منشور'&&a.closes&&a.closes<todayStr()?'انتهى الطرح · بانتظار الترسية':a.status;
M.auctions={key:'auctions',label:'مدار المزادات',icon:'🔨',group:'المدارات',render(v){
  const c=curCity(), A=Store.coll('auctions').filter(a=>a.city===c), pub=A.filter(a=>a.status==='منشور'), B=Store.coll('bids').filter(b=>A.some(a=>a.id===b.auctionId)), P=reqProgress(c,'auctions');
  v.innerHTML=`<div class="grid g4 mb">${kpiC('فرص منشورة الآن',pub.length,pub.length?`أسعار افتتاحية ${mShort(sum(pub,'startPrice'))} ر.س`:'لا توجد فرص منشورة','#7d5a86')}${kpiC('العروض المستلمة',B.length,B.length?`أعلى عرض ${mShort(Math.max(...B.map(b=>b.amount)))} ر.س`:'','var(--sky)')}${kpiC('تمت ترسيتها',A.filter(a=>a.status==='تمت الترسية').length,`بقيمة ${mShort(sum(A.filter(a=>a.status==='تمت الترسية'),'award'))} ر.س`,'var(--ok)')}${kpiC('جاهزية المدار',P.p+'%',`${P.t-P.d} بند ناقص`,P.p===100?'var(--ok)':'var(--red)')}</div>
  <div class="tabs"><button data-t="list" class="active">الفرص</button><button data-t="req">النواقص (${P.t-P.d})</button></div><div id="auB"></div>`;
  cityBar(v,()=>M.auctions.render(v));
  v.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x===b)); show(b.dataset.t); });
  const show=t=>{ const el=$('#auB',v); if(t==='req'){ el.innerHTML=reqsHtml(c,'auctions'); bindReqs(el,c,()=>M.auctions.render(v)); return; }
    crud({coll:'auctions',title:'فرصة استثمارية',where:a=>a.city===c,defaultSort:'closes',
      columns:[{k:'title',label:'الفرصة',fmt:a=>`<b>${esc(a.title)}</b><div class="small muted">${esc(a.type||'')} · ${esc(a.location||'')}</div>`,plain:a=>a.title},{k:'startPrice',label:'السعر الافتتاحي',fmt:a=>money(a.startPrice)},{k:'top',label:'أعلى عرض',fmt:a=>auTop(a)?money(auTop(a)):'—',plain:a=>auTop(a)},{k:'bids',label:'العروض',fmt:a=>num(bidsOf(a.id).length),plain:a=>bidsOf(a.id).length},{k:'closes',label:'آخر موعد',fmt:a=>a.closes?`${esc(a.closes)}${a.status==='منشور'&&daysTo(a.closes)>=0?`<div class="small muted">متبقٍ ${daysTo(a.closes)} يوم</div>`:''}`:'—'},{k:'status',label:'الحالة',fmt:a=>`<span class="pill ${a.status==='منشور'?'ok':a.status==='تمت الترسية'?'info':a.status==='ملغى'?'bad':''}">${esc(auState(a))}</span>`,plain:auState}],
      fields:[{k:'title',label:'عنوان الفرصة',required:true,full:true},{k:'type',label:'النوع',type:'select',options:AU_TYPES,required:true},{k:'location',label:'الموقع'},{k:'area',label:'المساحة م²',type:'number'},{k:'startPrice',label:'السعر الافتتاحي ر.س',type:'number',required:true},{k:'increment',label:'أقل زيادة بين العروض ر.س',type:'number'},{k:'deposit',label:'الضمان المطلوب ر.س',type:'number'},{k:'opens',label:'بداية الطرح',type:'date'},{k:'closes',label:'آخر موعد للعروض',type:'date'},{k:'status',label:'الحالة',type:'select',options:AU_STATUS,default:'مسودة'},{k:'desc',label:'وصف الفرصة',type:'textarea',full:true},{k:'terms',label:'أهم الشروط',type:'textarea',full:true}],
      filters:[{k:'status',label:'الحالة',options:AU_STATUS},{k:'type',label:'النوع',options:AU_TYPES}],
      onSave:(o,isNew)=>{ if(isNew){ o.city=c; Store.save(); } }, onChange:()=>M.auctions.render(v), detail:a=>auDetail(a,()=>M.auctions.render(v))},el); };
  show('list');
}};
function auDetail(a,rer){
  const bids=bidsOf(a.id), top=bids[0], minNext=Math.max(Number(a.startPrice)||0,top?top.amount+(Number(a.increment)||0):0), open=a.status==='منشور';
  Modal.open({title:'🔨 '+esc(a.title),wide:true,body:`<div class="grid g4 mb">${kpiC('السعر الافتتاحي',mShort(a.startPrice),'ر.س')}${kpiC('أعلى عرض',top?mShort(top.amount):'—',top?esc(top.bidder):'لا توجد عروض','var(--ok)')}${kpiC('عدد العروض',bids.length,'','var(--sky)')}${kpiC('الحالة',`<small>${esc(auState(a))}</small>`,a.closes?'آخر موعد '+esc(a.closes):'','#7d5a86')}</div>
    <dl class="dl"><div><dt>النوع</dt><dd>${esc(a.type||'—')}</dd></div><div><dt>الموقع</dt><dd>${esc(a.location||'—')}</dd></div><div><dt>المساحة</dt><dd>${a.area?num(a.area)+' م²':'—'}</dd></div><div><dt>الضمان</dt><dd>${money(a.deposit)}</dd></div><div><dt>أقل زيادة</dt><dd>${money(a.increment)}</dd></div><div><dt>الوصف</dt><dd>${esc(a.desc||'—')}</dd></div><div><dt>الشروط</dt><dd>${esc(a.terms||'—')}</dd></div>${a.winner?`<div><dt>الترسية</dt><dd><b>${esc(a.winner)}</b> بمبلغ ${money(a.award)} · ${esc(a.awardedAt||'')}</dd></div>`:''}</dl>
    <h4 style="margin:16px 0 6px">العروض</h4><div class="twrap"><table class="tbl"><thead><tr><th>#</th><th>مقدم العرض</th><th>الجهة</th><th>الجوال</th><th>المبلغ</th><th>الوقت</th></tr></thead><tbody>${bids.length?bids.map((b,i)=>`<tr><td>${i+1}</td><td>${esc(b.bidder)}</td><td>${esc(b.entity||'—')}</td><td>${esc(b.phone||'—')}</td><td>${money(b.amount)}</td><td class="small">${esc(b.at)}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">لا توجد عروض بعد</td></tr>'}</tbody></table></div>
    ${open&&can('create')?`<h4 style="margin:16px 0 6px">تسجيل عرض جديد</h4><div class="form"><div class="f"><label>اسم مقدم العرض *</label><input id="bN"></div><div class="f"><label>الجهة أو الشركة</label><input id="bE"></div><div class="f"><label>الجوال</label><input id="bP" inputmode="tel"></div><div class="f"><label>المبلغ ر.س * (الحد الأدنى ${minNext.toLocaleString('en-US')})</label><input id="bA" type="number" min="${minNext}"></div></div>`:''}
    ${auditHtml('auctions',a.id)}`,
    footer:`<button class="btn" onclick="Modal.close()">إغلاق</button>${!IN_FRAME?`<button class="btn" id="auPr">🖨 نشرة الطرح</button>`:''}${can('edit')&&a.status==='مسودة'?`<button class="btn p" id="auPub">نشر الفرصة</button>`:''}${open&&can('create')?`<button class="btn p" id="bAdd">تسجيل العرض</button>`:''}${can('edit')&&top&&(open||a.status==='مغلق')?`<button class="btn" id="auWin">ترسية على أعلى عرض</button>`:''}`});
  const pr=$('#auPr'); if(pr) pr.onclick=()=>window.print();
  const pb=$('#auPub'); if(pb) pb.onclick=()=>{ Store.update('auctions',a.id,{status:'منشور',opens:a.opens||todayStr()}); Modal.close(); toast('نُشرت الفرصة'); rer(); };
  const ad=$('#bAdd'); if(ad) ad.onclick=()=>{ const n=$('#bN').value.trim(), amt=Number($('#bA').value); if(!n){ toast('اكتب اسم مقدم العرض'); return; } if(!(amt>=minNext)){ toast(`المبلغ أقل من الحد الأدنى ${minNext.toLocaleString('en-US')} ر.س`); return; }
    const b={id:'BID-'+Date.now(),auctionId:a.id,bidder:n,entity:$('#bE').value.trim(),phone:$('#bP').value.trim(),amount:amt,at:now(),by:App.user.id,source:'داخلي'}; Store.coll('bids').push(b); Store.log('عرض','auctions',a.id,`${n} · ${amt.toLocaleString('en-US')} ر.س`); Store.save(); toast('سُجّل العرض'); auDetail(Store.get('auctions',a.id),rer); rer(); };
  const w=$('#auWin'); if(w) w.onclick=()=>ask(`ترسية «${a.title}» على ${top.bidder} بمبلغ ${top.amount.toLocaleString('en-US')} ر.س؟`,()=>{ Store.update('auctions',a.id,{status:'تمت الترسية',winner:top.bidder+(top.entity?' · '+top.entity:''),award:top.amount,awardedAt:todayStr()}); toast('تمت الترسية'); rer(); },'ترسية');
}

/* ───────── مدار الشراكات ───────── */
const PA_KINDS=['مورد','مقاول','مقدم خدمة','مستثمر','شريك استراتيجي','استشاري'], PA_STATUS=['جديد','قيد التقييم','معتمد','مرفوض','موقوف'], PA_LOG=['اجتماع','عرض سعر','عقد','مراسلة','تقييم أداء','زيارة'];
const PA_COLS=[{h:'اسم الجهة',k:'name',req:true},{h:'التصنيف',k:'kind',req:true,opts:PA_KINDS},{h:'النشاط',k:'sector'},{h:'السجل التجاري',k:'cr'},{h:'مسؤول التواصل',k:'contact'},{h:'الجوال',k:'phone'},{h:'البريد',k:'email'},{h:'الحالة',k:'status',opts:PA_STATUS}];
const paCityOpts=()=>[{v:'all',l:'كل المدن'},...CITIES.map(c=>({v:c.id,l:c.n}))];
M.partners={key:'partners',label:'مدار الشراكات',icon:'🤝',group:'المدارات',render(v){
  const c=curCity(), A=Store.coll('partners').filter(p=>p.city===c||p.city==='all'), P=reqProgress(c,'partners'), by=s=>A.filter(p=>(p.status||'جديد')===s).length;
  v.innerHTML=`<div class="grid g4 mb">${kpiC('الجهات المسجلة',A.length,`${[...new Set(A.map(p=>p.kind).filter(Boolean))].length} تصنيف`,'#3d7d5c')}${kpiC('معتمد',by('معتمد'),'','var(--ok)')}${kpiC('قيد التقييم أو جديد',by('قيد التقييم')+by('جديد'),'بانتظار قرار','var(--gold)')}${kpiC('جاهزية المدار',P.p+'%',`${P.t-P.d} بند ناقص`,P.p===100?'var(--ok)':'var(--red)')}</div>
  <div class="tabs"><button data-t="list" class="active">الجهات</button><button data-t="req">النواقص (${P.t-P.d})</button></div><div id="paB"></div>`;
  cityBar(v,()=>M.partners.render(v));
  v.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x===b)); show(b.dataset.t); });
  const show=t=>{ const el=$('#paB',v); if(t==='req'){ el.innerHTML=reqsHtml(c,'partners'); bindReqs(el,c,()=>M.partners.render(v)); return; }
    el.innerHTML=`<div class="toolbar"><span class="small muted">الجهات المسجلة لـ${cityName(c)} وكل المدن.</span><span class="sp"></span><button class="btn" id="paT">⬇ قالب Excel</button>${can('create')?`<button class="btn" id="paU">⬆ رفع ملف الجهات</button>`:''}</div><div id="paT2"></div>`;
    $('#paT',el).onclick=()=>xlsTemplate('قالب-الموردين-والشركاء.xlsx',PA_COLS,[['مؤسسة المثال للصيانة','مقدم خدمة','صيانة عامة','4030000000','أحمد','05xxxxxxxx','info@example.com','جديد']]);
    const up=$('#paU',el); if(up) up.onclick=()=>xlsUpload('الموردين والشركاء',PA_COLS,(rows,fn)=>{ let n=0; rows.forEach(o=>{ const ex=Store.coll('partners').find(p=>(o.cr&&p.cr===o.cr)||p.name===o.name); const rec={...o,status:o.status||'جديد'}; if(ex) Object.assign(ex,rec,{updatedAt:now()}); else Store.coll('partners').unshift({id:Store.gen('PA','partners'),...rec,city:c,createdAt:now(),createdBy:App.user.id}); n++; }); Store.log('رفع ملف','partners',c,`${fn} · ${n} جهة`); Store.save(); M.partners.render(v); return n; });
    crud({coll:'partners',title:'جهة',where:p=>p.city===c||p.city==='all',defaultSort:'name',
      columns:[{k:'name',label:'الجهة',fmt:p=>`<b>${esc(p.name)}</b><div class="small muted">${esc(p.sector||'')}</div>`,plain:p=>p.name},{k:'kind',label:'التصنيف'},{k:'contact',label:'التواصل',fmt:p=>`${esc(p.contact||'—')}<div class="small muted">${esc(p.phone||'')}</div>`,plain:p=>p.contact},{k:'city',label:'المدينة',fmt:p=>esc(p.city==='all'?'كل المدن':cityName(p.city)),plain:p=>cityName(p.city)},{k:'rating',label:'التقييم',fmt:p=>p.rating?'★'.repeat(p.rating)+'<span class="muted">'+'★'.repeat(5-p.rating)+'</span>':'—'},{k:'last',label:'آخر تعامل',fmt:p=>{ const l=Store.coll('partnerLog').find(x=>x.partnerId===p.id); return l?`${esc(l.kind)}<div class="small muted">${esc(l.at)}</div>`:'—'; },plain:p=>(Store.coll('partnerLog').find(x=>x.partnerId===p.id)||{}).at||''},{k:'status',label:'الحالة',fmt:p=>`<span class="pill ${p.status==='معتمد'?'ok':p.status==='مرفوض'||p.status==='موقوف'?'bad':'warn'}">${esc(p.status||'جديد')}</span>`}],
      fields:[{k:'name',label:'اسم الجهة',required:true},{k:'kind',label:'التصنيف',type:'select',options:PA_KINDS,required:true},{k:'sector',label:'النشاط'},{k:'cr',label:'السجل التجاري'},{k:'contact',label:'مسؤول التواصل'},{k:'phone',label:'الجوال'},{k:'email',label:'البريد',type:'email'},{k:'city',label:'المدينة',type:'select',options:paCityOpts,default:()=>c},{k:'status',label:'الحالة',type:'select',options:PA_STATUS,default:'جديد'},{k:'rating',label:'التقييم (1-5)',type:'select',options:['1','2','3','4','5']},{k:'notes',label:'ملاحظات',type:'textarea',full:true}],
      filters:[{k:'kind',label:'التصنيف',options:PA_KINDS},{k:'status',label:'الحالة',options:PA_STATUS}],
      onChange:()=>M.partners.render(v), detail:p=>paDetail(p,()=>M.partners.render(v))},$('#paT2',el)); };
  show('list');
}};
function paDetail(p,rer){
  const L=Store.coll('partnerLog').filter(x=>x.partnerId===p.id);
  Modal.open({title:'🤝 '+esc(p.name),wide:true,body:`<dl class="dl"><div><dt>التصنيف</dt><dd>${esc(p.kind||'—')}</dd></div><div><dt>النشاط</dt><dd>${esc(p.sector||'—')}</dd></div><div><dt>السجل التجاري</dt><dd>${esc(p.cr||'—')}</dd></div><div><dt>التواصل</dt><dd>${esc(p.contact||'—')} · ${esc(p.phone||'')} · ${esc(p.email||'')}</dd></div><div><dt>المدينة</dt><dd>${esc(p.city==='all'?'كل المدن':cityName(p.city))}</dd></div><div><dt>الحالة</dt><dd>${esc(p.status||'جديد')}</dd></div><div><dt>ملاحظات</dt><dd>${esc(p.notes||'—')}</dd></div></dl>
    <h4 style="margin:16px 0 6px">سجل التعامل</h4><div class="twrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>المبلغ</th></tr></thead><tbody>${L.length?L.map(x=>`<tr><td class="small">${esc(x.at)}</td><td>${esc(x.kind)}</td><td>${esc(x.note||'')}</td><td>${x.value?money(x.value):'—'}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">لا يوجد تعامل مسجل</td></tr>'}</tbody></table></div>
    ${can('create')?`<h4 style="margin:16px 0 6px">إضافة تعامل</h4><div class="form"><div class="f"><label>النوع</label><select id="lK">${PA_LOG.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="f"><label>المبلغ ر.س (إن وجد)</label><input id="lV" type="number"></div><div class="f full"><label>التفاصيل *</label><input id="lN"></div></div>`:''}${auditHtml('partners',p.id)}`,
    footer:`<button class="btn" onclick="Modal.close()">إغلاق</button>${can('create')?`<button class="btn p" id="lAdd">إضافة للسجل</button>`:''}`});
  const b=$('#lAdd'); if(b) b.onclick=()=>{ const n=$('#lN').value.trim(); if(!n){ toast('اكتب التفاصيل'); return; } Store.coll('partnerLog').unshift({id:'PL-'+Date.now(),partnerId:p.id,kind:$('#lK').value,note:n,value:Number($('#lV').value)||0,at:now(),by:App.user.id}); Store.log('تعامل','partners',p.id,`${$('#lK').value}: ${n}`); Store.save(); toast('أُضيف للسجل'); paDetail(p,rer); rer(); };
}

/* ───────── اختيار المدينة في الشريط العلوي ───────── */
(()=>{ const tb=document.querySelector('.topbar'); if(!tb||$('#citySel')) return; const s=document.createElement('select'); s.id='citySel'; s.title='المدينة المعروضة في المدارات'; s.setAttribute('aria-label','المدينة');
  s.innerHTML=`<option value="">كل المدن</option>${CITIES.map(c=>`<option value="${c.id}">${c.n}</option>`).join('')}`; s.value=App.city; s.onchange=()=>{ setCity(s.value); App.render(); };
  tb.insertBefore(s,$('#cloudSt')); })();

/* مدار الأصول لمدينة بلا مشاريع بعد: صفحة جاهزة للإضافة بدل أرقام مدن أخرى */
['dashboard','cashflow','agreements','operations','investor','gis','assets'].forEach(k=>{ const m=M[k]; if(!m) return; const orig=m.render;
  m.render=function(v,...r){ if(App.city&&!allAgreements().some(x=>kCity(x)===App.city)){ const c=App.city;
      v.innerHTML=`<div class="card mb live" style="border-inline-start-color:var(--gold)"><div><b>لا توجد مشاريع في ${cityName(c)} بعد</b><span class="small muted">مدار الأصول جاهز لاستقبال أول مشروع في ${cityName(c)}. أضفه من «إضافة مشروع» وتظهر أرقامه هنا وفي الصفحة الرئيسية مباشرة.</span></div>${can('create')?`<a class="btn p" href="#newproject">➕ إضافة مشروع في ${cityName(c)}</a>`:''}</div><div id="aReq">${reqsHtml(c,'assets')}</div>`;
      cityBar(v,()=>App.render()); bindReqs(v,c,()=>App.render()); return; }
    return orig.call(this,v,...r); }; });
