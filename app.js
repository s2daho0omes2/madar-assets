/* نظام إدارة الأصول — نسخة محلية أولية
   البنية: Store (تخزين + سجل تدقيق) → محرك CRUD عام → وحدات (Modules) تُسجَّل في جدول واحد → Router */
'use strict';

/* ───────────────────────── Store ───────────────────────── */
const DB_KEY='am_db_v1';
const Store={
  data:null,
  load(){
    try{ const raw=ls.get(DB_KEY); if(raw){ this.data=JSON.parse(raw); return; } }catch(e){}
    this.data=JSON.parse(JSON.stringify(window.SEED));
    this.save();
  },
  // دمج أي أصول جديدة في SEED لم تُضف بعد إلى البيانات المحفوظة (هياكل مشاريع جديدة)
  syncSeed(){ (window.SEED.contracts||[]).forEach(k=>{ const o=this.get('contracts',k.id); if(o&&o.investment==null&&k.investment!=null){ o.investment=k.investment; this._dirty=true; } }); if(this._dirty){ this._dirty=false; this.save(); } if(!this.data.settings.cleanup1){ const del=new Set(['A-0001','A-0004','A-0009','A-0018']); const gone=this.coll('assets').filter(x=>del.has(x.id)); if(gone.length){ this.data.assets=this.coll('assets').filter(x=>!del.has(x.id)); this.coll('assets').forEach(x=>{ if(del.has(x.parentId)) x.parentId=null; }); ['contracts','documents','finance','observations'].forEach(c=>this.coll(c).forEach(r=>{ if(del.has(r.assetId)) r.assetId=''; })); this.log('حذف','assets',[...del].join('،'),'حذف الأصول غير المرتبطة باتفاقية تشغيلية'); } this.data.settings.cleanup1=true; this.save(); } if(!this.data.meters){ this.data.meters=JSON.parse(JSON.stringify(window.SEED.meters||[])); this.data.meterBills=JSON.parse(JSON.stringify(window.SEED.meterBills||[])); this.save(); } if(!this.data.requirements){ this.data.requirements=JSON.parse(JSON.stringify(window.SEED.requirements||[])); this.save(); } ['contractors','evaluations','observations'].forEach(c=>{ if(!this.data[c]){ this.data[c]=JSON.parse(JSON.stringify(window.SEED[c]||[])); if(c==='contractors') (window.SEED.finance||[]).filter(f=>f.category==='عقد تشغيل وصيانة').forEach(f=>{ if(!this.coll('finance').some(x=>x.id===f.id)) this.coll('finance').push(JSON.parse(JSON.stringify(f))); }); this.save(); } }); if(!this.data.payments){ this.data.payments=JSON.parse(JSON.stringify(window.SEED.payments||[])); this.coll('clients').forEach(c=>delete c.balance); this.save(); } const have=new Set(this.coll('assets').map(a=>a.id)); let n=0; (window.SEED.assets||[]).forEach(a=>{ if(!have.has(a.id)){ this.coll('assets').push(JSON.parse(JSON.stringify(a))); n++; } }); (window.SEED.contracts||[]).forEach(k=>{ const o=this.get('contracts',k.id); if(o&&o.payFromInvestor==null&&o.payToAuthority==null&&(k.payFromInvestor!=null||k.payToAuthority!=null)){ Object.assign(o,{payToAuthority:k.payToAuthority,payFromInvestor:k.payFromInvestor,period:k.period,scope:k.scope,party:k.party,obligations:k.obligations}); delete o.costs; delete o.returns; delete o.revenueShare; n++; } }); (window.SEED.contracts||[]).forEach(k=>{ if(!this.get('contracts',k.id)){ this.coll('contracts').push(JSON.parse(JSON.stringify(k))); n++; } }); const al=this.get('contracts','K-002'); if(al&&al.payToAuthority){ delete al.payToAuthority; n++; }
    if(this.coll('finance').some(f=>f.ref==='مصدر تجريبي'&&['A-0003','A-0008','A-0004'].includes(f.assetId)&&f.kind==='مصروف')){ this.data.finance=this.coll('finance').filter(f=>!(f.ref==='مصدر تجريبي'&&['A-0003','A-0008','A-0004'].includes(f.assetId))).concat(JSON.parse(JSON.stringify((window.SEED.finance||[]).filter(f=>['A-0003','A-0008'].includes(f.assetId))))); n++; }
    this.coll('finance').forEach(f=>{ if(f.assetId==='A-0004'&&f.ref==='مصدر تجريبي'){ f.assetId='A-0008'; n++; } if(!f.contractId){ const k=agreementFor(f.assetId); if(k){ f.contractId=k.id; n++; } } }); if(n){ this.save(); } return n; },
  save(){ try{ localStorage.setItem(DB_KEY, JSON.stringify(this.data)); }catch(e){ toast('تعذر الحفظ محلياً'); } },
  reset(){ try{ localStorage.removeItem(DB_KEY); }catch(e){} this.data=null; this.load(); },
  coll(c){ return this.data[c] || (this.data[c]=[]); },
  get(c,id){ return this.coll(c).find(x=>x.id===id); },
  gen(prefix,c){ const n=this.coll(c).length+1; let id; do{ id=`${prefix}-${String(n+Math.floor(Math.random()*9000)).padStart(4,'0')}`; }while(this.get(c,id)); return id; },
  add(c,obj){ if(!obj.id) obj.id=this.gen(PREFIX[c]||'X',c); obj.createdAt=now(); obj.createdBy=App.user.id; this.coll(c).unshift(obj); this.log('إضافة',c,obj.id,'إنشاء السجل'); this.save(); return obj; },
  update(c,id,patch){
    const o=this.get(c,id); if(!o) return;
    const diffs=[]; Object.keys(patch).forEach(k=>{ if(String(o[k]??'')!==String(patch[k]??'')) diffs.push(`${LABELS[k]||k}: ${o[k]??'—'} ← ${patch[k]??'—'}`); });
    Object.assign(o,patch,{updatedAt:now(),updatedBy:App.user.id});
    if(diffs.length) this.log('تعديل',c,id,diffs.join(' | '));
    this.save(); return o;
  },
  remove(c,id){ const i=this.coll(c).findIndex(x=>x.id===id); if(i>-1){ this.coll(c).splice(i,1); this.log('حذف',c,id,'حذف السجل'); this.save(); } },
  log(action,coll,refId,changes){ this.coll('audit').unshift({id:'LG-'+Date.now()+Math.floor(Math.random()*99), at:now(), by:App.user?.id||'u1', action, coll, refId, changes}); if(this.coll('audit').length>2000) this.coll('audit').length=2000; },
  export(){ const blob=new Blob([JSON.stringify(this.data,null,1)],{type:'application/json'}); dl(blob,'asset-mgmt-backup.json'); },
  import(file){ const r=new FileReader(); r.onload=()=>{ try{ this.data=JSON.parse(r.result); this.save(); location.reload(); }catch(e){ toast('ملف غير صالح'); } }; r.readAsText(file); }
};
const PREFIX={assets:'A',contracts:'K',documents:'DOC',finance:'FN',clients:'C',payments:'PY',contractors:'CT',evaluations:'EV',observations:'OB',requirements:'RQ',meters:'MT',meterBills:'MB',users:'u'};
const LABELS={name:'الاسم',code:'الرمز',type:'النوع',level:'المستوى',parentId:'الأصل الأب',location:'الموقع',area:'المساحة',ownership:'الملكية',value:'القيمة',condition:'الحالة الفنية',status:'الحالة',operatingModel:'نموذج التشغيل',title:'العنوان',party:'الطرف',start:'البداية',end:'النهاية',amount:'المبلغ',cost:'التكلفة',priority:'الأولوية',kind:'النوع',assetId:'الأصل',vendorId:'المورد',budget:'الميزانية',year:'السنة',rent:'الإيجار',occupancy:'الإشغال',tenantId:'المستأجر',investment:'التكلفة الاستثمارية',meterNo:'رقم العداد',accountNo:'رقم الحساب',provider:'الجهة المزودة',payer:'السداد على',agreementId:'الاتفاقية',contractorId:'المقاول',severity:'الأهمية',closedDate:'تاريخ الإغلاق',closure:'ما تم',paid:'المسدد',paidDate:'تاريخ السداد',dueDate:'تاريخ الاستحقاق',method:'طريقة السداد',expiry:'الانتهاء',scheduled:'الموعد',completed:'الإنجاز',nextDue:'الاستحقاق القادم',score:'الدرجة',rating:'التقييم',balance:'الرصيد',x:'س',y:'ص',date:'التاريخ',category:'التصنيف',notes:'ملاحظات',number:'الرقم',obligations:'الالتزامات',renewal:'التجديد',payToAuthority:'ندفع للهيئة',payFromInvestor:'يدفع لنا المستثمر',period:'الدورية',scope:'نطاق العمل',contractId:'الاتفاقية',role:'الدور',email:'البريد',phone:'الجوال',idNo:'الهوية',sla:'SLA',contact:'التواصل',mitigation:'المعالجة',owner:'المسؤول',likelihood:'الاحتمال',impact:'الأثر',insured:'مؤمّن',justification:'المبرر',serial:'الرقم التسلسلي',warrantyEnd:'نهاية الضمان',lifeYears:'العمر الافتراضي',acquiredOn:'تاريخ الاقتناء',issued:'الإصدار',issuer:'الجهة المصدرة',clientId:'العميل',assignee:'المكلف',closed:'الإغلاق',created:'الإنشاء'};

/* ───────────────────────── Helpers ───────────────────────── */
const IN_FRAME=(()=>{ try{ return window.self!==window.top; }catch(e){ return true; } })(); // داخل عارض claude.ai: لا طباعة ولا تنزيل ملفات
const ls={ get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
/* تأكيد داخل الصفحة بدل confirm() (العارض لا يعرض نوافذ المتصفح) */
function ask(msg,onYes,yesLabel='تأكيد'){ Modal.open({title:'تأكيد',body:`<p>${esc(msg)}</p>`,footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p d" id="askYes" style="background:var(--red);border-color:var(--red);color:#fff">${esc(yesLabel)}</button>`}); $('#askYes').onclick=()=>{ Modal.close(); onYes(); }; }
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>{ const d=new Date(); return d.toISOString().slice(0,10)+' '+d.toTimeString().slice(0,5); };
const todayStr=()=>new Date().toISOString().slice(0,10);
const money=n=>(n==null||n===''||isNaN(n))?'—':`<span class="num">${Number(n).toLocaleString('en-US')}</span> ${Store.data.settings.currency}`;
const num=n=>(n==null||n===''||isNaN(n))?'—':`<span class="num">${Number(n).toLocaleString('en-US')}</span>`;
const short=n=>{ n=Number(n)||0; if(Math.abs(n)>=1e9) return (n/1e9).toFixed(2)+' مليار'; if(Math.abs(n)>=1e6) return (n/1e6).toFixed(1)+' مليون'; if(Math.abs(n)>=1e3) return (n/1e3).toFixed(0)+' ألف'; return n.toLocaleString('en-US'); };
const daysTo=d=>{ if(!d) return null; return Math.round((new Date(d)-new Date(todayStr()))/86400000); };
const pct=(a,b)=>b?Math.round(a/b*100):0;
const sum=(arr,k)=>arr.reduce((s,x)=>s+(Number(x[k])||0),0);
const dl=(blob,name)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); };
const toast=msg=>{ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); };
const assetName=id=>{ const a=Store.get('assets',id); return a?`${a.name} <span class="small muted">(${a.code})</span>`:'—'; };
const assetPlain=id=>Store.get('assets',id)?.name||'—';
const userName=id=>Store.get('users',id)?.name||id||'—';
const clientName=id=>Store.get('clients',id)?.name||id||'—';
const LEVELS={project:'مشروع',district:'حي',building:'مبنى',unit:'وحدة',equipment:'معدات'};
const LEVEL_ORDER=['project','district','building','unit','equipment'];
const MODEL={investor:'إسناد التشغيل لمستثمر',self:'تشغيل ذاتي',mixed:'مختلط'};
const STATUS_CLASS=s=>{ s=String(s||''); if(/مكتمل|ساري|نشط|معتمد|يعمل|مغلق|ممتاز|مشغول|مؤجر/.test(s)) return 'ok'; if(/قيد|مجدول|مراجعة|مقدم|مقبول|تحت|محوّل/.test(s)) return 'warn'; if(/متوقف|منتهي|مرفوض|يحتاج|عالية|عالي|مفتوح|شاغر|متأخر/.test(s)) return 'bad'; return ''; };
const pill=s=>`<span class="pill ${STATUS_CLASS(s)}">${esc(s||'—')}</span>`;
const COLORS=['#16242f','#b9925a','#a9713d','#5b8aa8','#8c6c9c','#c25a4a','#6aa884','#d4a574'];
const descendants=id=>{ const out=[]; const walk=p=>Store.coll('assets').filter(a=>a.parentId===p).forEach(a=>{ out.push(a); walk(a.id); }); walk(id); return out; };
const OP_TYPES=['تشغيل ذاتي','مستثمر'];
const agreementFor=assetId=>{ let x=Store.get('assets',assetId); while(x){ const k=Store.coll('contracts').find(k=>OP_TYPES.includes(k.type)&&k.assetId===x.id); if(k) return k; x=x.parentId?Store.get('assets',x.parentId):null; } return null; };
/* ربح كل اتفاقية: مستثمر = ما يدفعه المستثمر − ما ندفعه للهيئة. تشغيل ذاتي = الإيراد الفعلي − المصروفات − ما ندفعه للهيئة */
const agreementPL=k=>{ const F=Store.coll('finance').filter(f=>(f.contractId||agreementFor(f.assetId)?.id)===k.id); const rev=sum(F.filter(f=>f.kind==='إيراد'),'amount'), exp=sum(F.filter(f=>f.kind==='مصروف'),'amount'); const pay=Number(k.payToAuthority)||0, due=Number(k.payFromInvestor)||0; const profit=k.type==='مستثمر'?due-pay:rev-exp-pay; return {rev,exp,pay,due,profit,margin:pct(profit,k.type==='مستثمر'?due:rev)}; };
/* قراءات تشغيلية لكل اتفاقية: الأصول والوحدات تحتها، الإشغال، المتأخرات */
const agreementOps=k=>{ const set=new Set([k.assetId,...descendants(k.assetId).map(x=>x.id)]); const units=Store.coll('assets').filter(x=>x.level==='unit'&&set.has(x.id)); const occ=units.filter(u=>u.occupancy==='مشغول').length;
  const overdue=finOf(Store.coll('payments').filter(p=>set.has(p.assetId))).overdue;
  return {assets:set.size,units:units.length,occ,occPct:pct(occ,units.length),overdue,daysLeft:daysTo(k.end),value:Number(Store.get('assets',k.assetId)?.value)||0}; };
const AG_LABEL={'تشغيل ذاتي':'التشغيل الذاتي','مستثمر':'إسناد التشغيل لمستثمر'};
const agPill=k=>k?`<span class="pill ${k.type==='مستثمر'?'info':'gold'}">${AG_LABEL[k.type]}${k.type==='مستثمر'?' · '+esc(k.party):''}</span>`:'<span class="pill">غير مرتبط</span>';
const agPlain=k=>k?`${AG_LABEL[k.type]} - ${k.title}`:'غير مرتبط';
const AG_FILTERS=[{k:'agType',label:'نوع الاتفاقية',options:[{v:'تشغيل ذاتي',l:'التشغيل الذاتي'},{v:'مستثمر',l:'إسناد التشغيل لمستثمر'},{v:'none',l:'غير مرتبط'}],get:x=>agreementFor(x.id)?.type||'none'},{k:'agId',label:'الاتفاقية',options:()=>opAgreements().map(k=>({v:k.id,l:k.title})),get:x=>agreementFor(x.id)?.id||''}];
/* الدفعات: حالة كل دفعة ومجاميع العميل أو الوحدة */
const payStatus=p=>{ const amt=Number(p.amount)||0, pd=Number(p.paid)||0; if(pd>=amt&&amt>0) return 'مسدد'; if(p.dueDate&&p.dueDate<todayStr()) return 'متأخر'; if(pd>0) return 'مسدد جزئياً'; return 'قادم'; };
const PAY_CLS={'مسدد':'ok','مسدد جزئياً':'warn','متأخر':'bad','قادم':'info'};
const payPill=p=>{ const s=payStatus(p); return `<span class="pill ${PAY_CLS[s]}">${s}</span>`; };
const finOf=list=>{ const t=todayStr(); const total=sum(list,'amount'), paid=sum(list,'paid'); const overdue=list.filter(p=>p.dueDate&&p.dueDate<t).reduce((s,p)=>s+Math.max(0,(Number(p.amount)||0)-(Number(p.paid)||0)),0); const next=list.filter(p=>(Number(p.paid)||0)<(Number(p.amount)||0)&&p.dueDate>=t).sort((x,y)=>x.dueDate.localeCompare(y.dueDate))[0]; return {total,paid,remaining:total-paid,overdue,next,count:list.length,pct:pct(paid,total)}; };
const paysOfClient=id=>Store.coll('payments').filter(p=>p.clientId===id).sort((x,y)=>(x.dueDate||'').localeCompare(y.dueDate||''));
const paysOfAsset=id=>Store.coll('payments').filter(p=>p.assetId===id).sort((x,y)=>(x.dueDate||'').localeCompare(y.dueDate||''));
const clientFin=c=>finOf(paysOfClient(c.id));
const finBar=f=>f.total?`<div class="bar" style="min-width:70px"><i style="width:${f.pct}%"></i></div><span class="small muted">${f.pct}%</span>`:'—';
const opAgreements=()=>Store.coll('contracts').filter(k=>OP_TYPES.includes(k.type));
const contractName=id=>{ const k=Store.get('contracts',id); return k?`${k.title}`:'—'; };
const ancestorsOf=id=>{ const out=[]; let a=Store.get('assets',id); while(a&&a.parentId){ a=Store.get('assets',a.parentId); if(a) out.unshift(a); } return out; };

/* ───────────────────────── Permissions ───────────────────────── */
const ROLES={admin:'مدير النظام',manager:'مدير الأصول',engineer:'مهندس تشغيل',finance:'مالي',viewer:'مطّلع'};
const PERM={
  admin:['create','edit','delete','users','export'],
  manager:['create','edit','export'],
  engineer:['create','edit','export'],
  finance:['create','edit','export'],
  viewer:['export']
};
const can=a=>(PERM[App.user.role]||[]).includes(a);

/* ───────────────────────── Modal ───────────────────────── */
const Modal={
  open({title,body,footer='',wide=false}){
    const root=$('#modalRoot');
    root.innerHTML=`<div class="modal-bg" id="mbg"><div class="modal ${wide?'wide':''}"><div class="mh"><h3>${title}</h3><button class="btn ic" id="mclose">✕</button></div><div class="mb2">${body}</div>${footer?`<div class="mf">${footer}</div>`:''}</div></div>`;
    $('#mclose').onclick=Modal.close; $('#mbg').addEventListener('click',e=>{ if(e.target.id==='mbg') Modal.close(); });
    return root;
  },
  close(){ $('#modalRoot').innerHTML=''; }
};

/* ───────────────────────── Generic CRUD engine ─────────────────────────
   cfg: {coll,title,columns:[{k,label,fmt,sort}],fields:[{k,label,type,options,required,default}],filters:[{k,label,options}],detail(row),search:[k...]} */
function crud(cfg,container){
  const state={q:'',sort:cfg.defaultSort||cfg.columns[0].k,dir:1,filters:{},page:0,pageSize:50};
  const opts=f=>typeof f.options==='function'?f.options():f.options||[];
  function rows(){
    let r=Store.coll(cfg.coll).slice();
    if(cfg.where) r=r.filter(cfg.where);
    const q=state.q.trim().toLowerCase();
    if(q) r=r.filter(x=>(cfg.search||cfg.columns.map(c=>c.k)).some(k=>String(x[k]??'').toLowerCase().includes(q)||String(cfg.columns.find(c=>c.k===k)?.plain?.(x)??'').toLowerCase().includes(q)));
    Object.entries(state.filters).forEach(([k,v])=>{ if(!v) return; const fd=(cfg.filters||[]).find(f=>f.k===k); r=r.filter(x=>String(fd?.get?fd.get(x):x[k])===v); });
    const col=cfg.columns.find(c=>c.k===state.sort);
    r.sort((a,b)=>{ let va=col?.plain?col.plain(a):a[state.sort], vb=col?.plain?col.plain(b):b[state.sort]; va=va??''; vb=vb??''; if(!isNaN(va)&&!isNaN(vb)&&va!==''&&vb!=='') return (Number(va)-Number(vb))*state.dir; return String(va).localeCompare(String(vb),'ar')*state.dir; });
    return r;
  }
  function render(){
    const r=rows(); const total=r.length; const pageRows=r.slice(state.page*state.pageSize,(state.page+1)*state.pageSize);
    container.innerHTML=`
      <div class="toolbar">
        <input placeholder="🔍 بحث..." value="${esc(state.q)}" id="q">
        ${(cfg.filters||[]).map(f=>`<select data-f="${f.k}"><option value="">${f.label}: الكل</option>${opts(f).map(o=>`<option value="${esc(o.v??o)}" ${state.filters[f.k]===String(o.v??o)?'selected':''}>${esc(o.l??o)}</option>`).join('')}</select>`).join('')}
        <span class="sp"></span>
        <span class="small muted">${total} سجل</span>
        <button class="btn ${IN_FRAME?'hidden':''}" id="csv">⬇ Excel/CSV</button>
        ${IN_FRAME?'':`<button class="btn" onclick="window.print()">🖨 PDF</button>`}
        ${can('create')&&!cfg.readonly?`<button class="btn p" id="add">＋ إضافة</button>`:''}
      </div>
      <div class="card" style="padding:0"><div class="twrap"><table class="tbl"><thead><tr>${cfg.columns.map(c=>`<th data-s="${c.k}">${c.label} ${state.sort===c.k?(state.dir>0?'▲':'▼'):''}</th>`).join('')}<th></th></tr></thead>
      <tbody>${pageRows.length?pageRows.map(x=>`<tr class="clk" data-id="${x.id}">${cfg.columns.map(c=>`<td>${c.fmt?c.fmt(x):esc(x[c.k]??'—')}</td>`).join('')}<td style="white-space:nowrap">${can('edit')&&!cfg.readonly?`<button class="btn sm" data-e="${x.id}">✎</button>`:''} ${can('delete')&&!cfg.readonly?`<button class="btn sm d" data-d="${x.id}">🗑</button>`:''}</td></tr>`).join(''):`<tr><td colspan="${cfg.columns.length+1}" class="empty">لا توجد سجلات</td></tr>`}</tbody></table></div>
      ${total>state.pageSize?`<div class="toolbar" style="padding:10px"><button class="btn sm" id="pp">السابق</button><span class="small">صفحة ${state.page+1} من ${Math.ceil(total/state.pageSize)}</span><button class="btn sm" id="pn">التالي</button></div>`:''}</div>`;
    $('#q',container).oninput=e=>{ state.q=e.target.value; state.page=0; render(); const i=$('#q',container); i.focus(); i.setSelectionRange(i.value.length,i.value.length); };
    container.querySelectorAll('select[data-f]').forEach(s=>s.onchange=()=>{ state.filters[s.dataset.f]=s.value; state.page=0; render(); });
    container.querySelectorAll('th[data-s]').forEach(th=>th.onclick=()=>{ if(state.sort===th.dataset.s) state.dir*=-1; else { state.sort=th.dataset.s; state.dir=1; } render(); });
    $('#csv',container).onclick=()=>exportCSV(cfg,rows());
    const add=$('#add',container); if(add) add.onclick=()=>form(null);
    $('#pp',container)&&( $('#pp',container).onclick=()=>{ state.page=Math.max(0,state.page-1); render(); });
    $('#pn',container)&&( $('#pn',container).onclick=()=>{ state.page++; render(); });
    container.querySelectorAll('[data-e]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); form(Store.get(cfg.coll,b.dataset.e)); });
    container.querySelectorAll('[data-d]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); ask('حذف السجل نهائياً؟ لا يمكن التراجع.',()=>{ Store.remove(cfg.coll,b.dataset.d); render(); App.refreshBadges(); },'حذف'); });
    container.querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>{ const row=Store.get(cfg.coll,tr.dataset.id); if(cfg.detail) cfg.detail(row); else detailDefault(cfg,row); });
  }
  function form(row){
    const isNew=!row||!row.id; if(isNew){ const pre=row||{}; row=Object.fromEntries(cfg.fields.map(f=>[f.k,pre[f.k]!=null&&pre[f.k]!==''?pre[f.k]:(typeof f.default==='function'?f.default():f.default??'')])); }
    const body=`<div class="form">${cfg.fields.map(f=>fieldHtml(f,row[f.k])).join('')}</div>`;
    Modal.open({title:(isNew?'إضافة ':'تعديل ')+cfg.title,body,footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="save">حفظ</button>`});
    $('#save').onclick=()=>{
      const patch={}; let ok=true;
      cfg.fields.forEach(f=>{ const el=$(`[name="${f.k}"]`); if(!el) return; let v=el.value; if(f.type==='number') v=v===''?'':Number(v); if(f.required&&(v===''||v==null)){ ok=false; el.style.outline='2px solid var(--red)'; } patch[f.k]=v; });
      if(!ok){ toast('أكمل الحقول الإلزامية'); return; }
      if(isNew){ const o=Store.add(cfg.coll,patch); cfg.onSave?.(o,true); } else { Store.update(cfg.coll,row.id,patch); cfg.onSave?.(Store.get(cfg.coll,row.id),false); }
      Modal.close(); render(); App.refreshBadges(); toast('تم الحفظ');
    };
  }
  render();
  return {render,form};
}
function fieldHtml(f,v){
  const opts=typeof f.options==='function'?f.options():f.options||[];
  const req=f.required?' *':'';
  let inp;
  if(f.type==='select') inp=`<select name="${f.k}"><option value="">— اختر —</option>${opts.map(o=>{ const val=o.v??o, lab=o.l??o; return `<option value="${esc(val)}" ${String(v)===String(val)?'selected':''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else if(f.type==='textarea') inp=`<textarea name="${f.k}">${esc(v)}</textarea>`;
  else inp=`<input name="${f.k}" type="${f.type||'text'}" value="${esc(v)}" ${f.step?`step="${f.step}"`:''}>`;
  return `<div class="f ${f.full?'full':''}"><label>${f.label}${req}</label>${inp}</div>`;
}
function exportCSV(cfg,rows){
  const head=cfg.columns.map(c=>c.label); const lines=[head.join(',')];
  rows.forEach(r=>lines.push(cfg.columns.map(c=>{ let v=c.plain?c.plain(r):(c.fmt?c.fmt(r).replace(/<[^>]+>/g,''):r[c.k]); return '"'+String(v??'').replace(/"/g,'""')+'"'; }).join(',')));
  dl(new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),`${cfg.coll}-${todayStr()}.csv`);
}
function detailDefault(cfg,row){
  const body=`<dl class="dl">${cfg.fields.map(f=>{ const col=cfg.columns.find(c=>c.k===f.k); return `<div><dt>${f.label}</dt><dd>${col?.fmt?col.fmt(row):esc(row[f.k]??'—')}</dd></div>`; }).join('')}</dl>
  ${auditHtml(cfg.coll,row.id)}`;
  Modal.open({title:`${cfg.title}: ${esc(row.title||row.name||row.id)}`,body,footer:`<button class="btn" onclick="Modal.close()">إغلاق</button>`});
}
function auditHtml(coll,id){
  const l=Store.coll('audit').filter(a=>a.coll===coll&&a.refId===id).slice(0,15);
  return `<h4 style="margin:16px 0 6px;color:var(--green)">سجل التدقيق</h4><ul class="audit">${l.length?l.map(a=>`<li><b>${esc(a.action)}</b> بواسطة ${esc(userName(a.by))} — <span class="muted small num">${a.at}</span><div class="diff">${esc(a.changes)}</div></li>`).join(''):'<li class="muted">لا توجد تغييرات مسجلة</li>'}</ul>`;
}

/* ───────────────────────── Alerts ───────────────────────── */
function computeAlerts(){
  const out=[];
  Store.coll('contracts').forEach(k=>{ const dd=daysTo(k.end); if(dd!=null&&dd<=90&&dd>=-3650&&k.type!=='إطارية'&&k.type!=='تخصيص'){ out.push({lvl:dd<0?'bad':(dd<=30?'bad':'warn'),t:`${dd<0?'انتهى':'ينتهي'} عقد ${k.type}: ${k.title}`,s:`${k.number} — ${dd<0?`منذ ${-dd} يوم`:`خلال ${dd} يوم`} — ${assetPlain(k.assetId)}`,go:'#contracts'}); } });
  Store.coll('documents').forEach(d=>{ const dd=daysTo(d.expiry); if(dd!=null&&dd<=60) out.push({lvl:dd<0?'bad':'warn',t:`${dd<0?'انتهى':'ينتهي'} ${d.type}: ${d.title}`,s:`${dd<0?`منذ ${-dd} يوم`:`خلال ${dd} يوم`} — ${assetPlain(d.assetId)}`,go:'#documents'}); });
  Store.coll('assets').forEach(a=>{ const dd=daysTo(a.warrantyEnd); if(dd!=null&&dd<=60) out.push({lvl:dd<0?'bad':'warn',t:`ضمان ${a.name}`,s:dd<0?`انتهى منذ ${-dd} يوم`:`ينتهي خلال ${dd} يوم`,go:'#assets'}); });
  Store.coll('meterBills').filter(b=>billState(b)==='متأخرة').forEach(b=>{ const m=Store.get('meters',b.meterId); if(m&&m.payer!=='المستأجر') out.push({lvl:'warn',t:`فاتورة ${m.type} متأخرة: ${assetPlain(m.assetId)}`,s:`${b.period} · ${Number(b.amount).toLocaleString('en-US')} ر.س · عداد ${m.meterNo}`,go:'#operations'}); });
  Store.coll('requirements').filter(r=>reqState(r)==='late').forEach(r=>{ const k=Store.get('contracts',r.contractId); out.push({lvl:'bad',t:`متطلب متأخر على المستثمر: ${r.title}`,s:`${k?.party||''} — الموعد ${r.dueDate}`,go:'#investor'}); });
  Store.coll('observations').filter(o=>o.status!=='مغلقة'&&o.dueDate&&o.dueDate<todayStr()).forEach(o=>out.push({lvl:'bad',t:`ملاحظة متأخرة على المقاول: ${o.title}`,s:`${Store.get('contractors',o.contractorId)?.name||''} — مستحقة ${o.dueDate}`,go:'#operations'}));
  Store.coll('clients').forEach(c=>{ const f=clientFin(c); if(f.overdue>0) out.push({lvl:'bad',t:`دفعة متأخرة: ${c.name}`,s:`${f.overdue.toLocaleString('en-US')} ر.س — ${assetPlain(c.assetId)}`,go:'#operations'}); });
  const order={bad:0,warn:1,info:2}; return out.sort((a,b)=>order[a.lvl]-order[b.lvl]);
}
function alertsHtml(list,limit){ const l=limit?list.slice(0,limit):list; return l.length?l.map(a=>`<a class="alert ${a.lvl}" href="${a.go}" style="text-decoration:none;color:inherit"><div><b>${esc(a.t)}</b><span>${esc(a.s)}</span></div></a>`).join(''):'<div class="empty">لا توجد تنبيهات 🎉</div>'; }

/* ───────────────────────── Charts ───────────────────────── */
const Charts={ list:[], destroy(){ this.list.forEach(c=>c.destroy()); this.list=[]; },
  make(id,type,labels,datasets,extra={}){ if(!window.Chart) return; const el=document.getElementById(id); if(!el) return;
    const dark=document.documentElement.dataset.theme==='dark'; Chart.defaults.font.family='Tajawal'; Chart.defaults.color=dark?'#aab':'#666';
    const c=new Chart(el.getContext('2d'),{type,data:{labels,datasets:datasets.map((d,i)=>({borderColor:d.color||COLORS[i%COLORS.length],backgroundColor:type==='doughnut'||type==='pie'?COLORS.map(x=>x+'cc'):(d.color||COLORS[i%COLORS.length])+(type==='line'?'22':'cc'),borderWidth:2,borderRadius:type==='bar'?5:0,tension:.3,fill:type==='line',...d}))},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:type==='doughnut'?'right':'top',rtl:true,labels:{usePointStyle:true}},tooltip:{rtl:true,callbacks:{label:ctx=>` ${ctx.dataset.label||ctx.label}: ${Number(extra.indexAxis==='y'?ctx.parsed.x:(ctx.parsed.y??ctx.parsed)).toLocaleString('en-US')}`}}},
        scales:type==='doughnut'||type==='pie'?{}:(extra.indexAxis==='y'?{y:{grid:{display:false}},x:{beginAtZero:true,ticks:{callback:v=>short(v)}}}:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:v=>short(v)}}}),...extra}});
    this.list.push(c); return c; }
};

/* ───────────────────────── Modules ───────────────────────── */
const M={};

/* 1. لوحة التحكم */
/* مؤشرات المحفظة العقارية */
function portfolioMetrics(all){
  const t=todayStr(), self=all.filter(x=>x.k.type==='تشغيل ذاتي'), inv=all.filter(x=>x.k.type==='مستثمر');
  const selfNoi=sum(self,'rev')-sum(self,'exp'), invNoi=sum(inv,'due'), noi=selfNoi+invNoi;
  const pay=sum(all,'pay'), profit=sum(all,'profit'), value=sum(all,'value');
  const units=Store.coll('assets').filter(a=>a.level==='unit'&&agreementFor(a.id)?.type==='تشغيل ذاتي'), occ=units.filter(u=>u.occupancy==='مشغول');
  const pgi=sum(units,'rent'), occRent=sum(occ,'rent'), vacant=units.filter(u=>u.occupancy!=='مشغول'), unpriced=units.filter(u=>!Number(u.rent)).length;
  const P=Store.coll('payments'), dueP=P.filter(p=>p.dueDate&&p.dueDate<=t);
  const dueAmt=sum(dueP,'amount'), duePaid=dueP.reduce((s,p)=>s+Math.min(Number(p.paid)||0,Number(p.amount)||0),0);
  const aging=[['حتى 30 يوم',0],['31 - 60 يوم',0],['61 - 90 يوم',0],['أكثر من 90 يوم',0]];
  P.forEach(p=>{ const rem=(Number(p.amount)||0)-(Number(p.paid)||0); if(rem<=0||!p.dueDate||p.dueDate>=t) return; const dd=-daysTo(p.dueDate); aging[dd<=30?0:dd<=60?1:dd<=90?2:3][1]+=rem; });
  const arrears=aging.reduce((s,b)=>s+b[1],0);
  const leases=Store.coll('contracts').filter(k=>k.type==='إيجار'&&k.status!=='منتهي').map(k=>({end:k.end,inc:Number(k.value)||0,inv:false})).concat(inv.map(x=>({end:x.k.end,inc:x.due,inv:true})));
  let w=0,wi=0; const expiry={}; leases.forEach(l=>{ const d=daysTo(l.end); if(d==null||!l.inc) return; w+=Math.max(0,d/365)*l.inc; wi+=l.inc; const y=l.end.slice(0,4); expiry[y]=expiry[y]||{lease:0,inv:0}; expiry[y][l.inv?'inv':'lease']+=l.inc; });
  const conc=all.map(x=>({l:x.k.type==='مستثمر'?x.k.party:x.k.title,v:x.k.type==='مستثمر'?x.due:x.rev,inv:x.k.type==='مستثمر'})).filter(x=>x.v>0).sort((p,q)=>q.v-p.v);
  const omYear=sum(omContracts(),'value');
  const cf=[0,1,2].map(i=>{ const d=new Date(); d.setMonth(d.getMonth()+i,1); const mo=d.toISOString().slice(0,7);
    return {mo,tenants:P.filter(p=>(p.dueDate||'').startsWith(mo)).reduce((s,p)=>s+Math.max(0,(Number(p.amount)||0)-(Number(p.paid)||0)),0),invIn:invNoi/12,auth:pay/12,om:omYear/12}; });
  return {noi,selfNoi,invNoi,pay,profit,value,yieldOn:value?noi/value*100:0,coverage:pay?noi/pay:0,units:units.length,occ:occ.length,pgi,occRent,vacancyLoss:pgi-occRent,vacant:vacant.length,unpriced,dueAmt,duePaid,collection:dueAmt?duePaid/dueAmt*100:100,aging,arrears,wale:wi?w/wi:0,expiry,conc,concTot:sum(conc,'v'),cf};
}
M.dashboard={key:'dashboard',label:'لوحة التحكم',icon:'📊',group:'الرئيسية',render(v){
  const A=Store.coll('assets'), F=Store.coll('finance');
  const alerts=computeAlerts(); const byCond={}; A.forEach(a=>byCond[a.condition]=(byCond[a.condition]||0)+1);
  const all=opAgreements().map(k=>({k,...agreementPL(k),...agreementOps(k)}));
  const self=all.filter(x=>x.k.type==='تشغيل ذاتي'), inv=all.filter(x=>x.k.type==='مستثمر');
  const S=f=>sum(self,f), I=f=>sum(inv,f);
  const months=[...new Set(F.map(f=>f.date.slice(0,7)))].sort().slice(-12);
  const kOf=f=>Store.get('contracts',f.contractId||agreementFor(f.assetId)?.id||'')?.type;
  const mSelfRev=months.map(mo=>sum(F.filter(f=>f.kind==='إيراد'&&kOf(f)==='تشغيل ذاتي'&&f.date.startsWith(mo)),'amount'));
  const mSelfExp=months.map(mo=>sum(F.filter(f=>f.kind==='مصروف'&&kOf(f)==='تشغيل ذاتي'&&f.date.startsWith(mo)),'amount'));
  const mInvRev=months.map(mo=>sum(F.filter(f=>f.kind==='إيراد'&&kOf(f)==='مستثمر'&&f.date.startsWith(mo)),'amount'));
  const mk=(l,val,sub='',c='var(--gold)',extra='')=>`<div class="card kpi" style="--kc:${c}"><div class="l">${l}</div><div class="v">${val}</div>${sub?`<div class="s">${sub}</div>`:''}${extra}</div>`;
  const payCell=x=>x.k.payToAuthority===''||x.k.payToAuthority==null?'<span class="pill warn">غير محدد</span>':num(x.pay);
  const selfUnits=S('units'), selfOcc=S('occ'), invDue=I('due'), invRev=I('rev'), ending=inv.filter(x=>x.daysLeft!=null&&x.daysLeft<=90);
  const PM=portfolioMetrics(all), top=PM.conc[0], topShare=top?pct(top.v,PM.concTot):0, bad=alerts.filter(a=>a.lvl==='bad').length;
  const covCls=PM.coverage>=1.5?'ok':PM.coverage>=1.1?'warn':'bad', colCls=PM.collection>=95?'ok':PM.collection>=85?'warn':'bad';
  const story=[`المحفظة تحقق دخلاً تشغيلياً صافياً قدره ${short(PM.noi)} سنوياً، وبعد سداد ${short(PM.pay)} للهيئة الملكية يبقى ربح ${short(PM.profit)}.`,
    PM.pay?`الدخل يغطي التزام الهيئة ${PM.coverage.toFixed(1)} مرة${PM.coverage<1.2?'، وهو هامش أمان ضيق':''}.`:'',
    top&&topShare>=40?`${top.l} وحده يمثل ${topShare}% من الدخل، وهذا تركّز يستحق المتابعة.`:'',
    PM.arrears?`متأخرات المستأجرين ${short(PM.arrears)} ونسبة التحصيل ${Math.round(PM.collection)}%.`:'',
    PM.unpriced?`${PM.unpriced} وحدة في التشغيل الذاتي بلا إيجار محدد، فالدخل المحتمل أعلى مما يظهر.`:''].filter(Boolean);
  v.innerHTML=`
  <div class="card exec mb">
    <div class="exh"><div><div class="small muted">${esc(Store.data.settings.projectName)} · الملخص التنفيذي · <span class="num">${todayStr()}</span></div><h3>${all.length} اتفاقية تشغيلية: ${self.length} تشغيل ذاتي و${inv.length} إسناد تشغيل لمستثمر</h3></div>
      <a class="pill ${bad?'bad':'warn'} exal" href="#alerts">🔔 ${alerts.length} تنبيه${bad?` · ${bad} حرجة`:''}</a></div>
    <p class="exs">${story.map(esc).join(' ')}</p>
  </div>
  <div class="secl">الأداء المالي</div>
  <div class="grid g4 mb">
    ${mk('صافي الدخل التشغيلي NOI',short(PM.noi),`تشغيل ذاتي ${short(PM.selfNoi)} · مستثمرون ${short(PM.invNoi)}`,'var(--green)')}
    ${mk('صافي الربح بعد الهيئة',short(PM.profit),`هامش ${pct(PM.profit,PM.noi)}% من الدخل التشغيلي`,'var(--sky)')}
    ${mk('العائد على قيمة الأصول',`${PM.yieldOn.toFixed(1)}%`,`الدخل التشغيلي ÷ قيمة الأصول ${short(PM.value)}`,'var(--gold)')}
    ${mk('تغطية التزام الهيئة',`${PM.coverage.toFixed(2)} مرة`,`<span class="pill ${covCls}">${covCls==='ok'?'مريحة':covCls==='warn'?'مقبولة':'ضيقة'}</span> الدخل التشغيلي ${short(PM.noi)} ÷ التزام الهيئة ${short(PM.pay)}`,'var(--wood)')}
  </div>
  <div class="secl">الأداء التشغيلي</div>
  <div class="grid g4 mb">
    ${mk('الإشغال الاقتصادي',`${pct(PM.occRent,PM.pgi)}%`,`الإشغال الفعلي ${pct(PM.occ,PM.units)}% (${PM.occ} من ${PM.units} وحدة)`,'var(--gold)',`<div class="bar" style="margin-top:6px"><i style="width:${pct(PM.occRent,PM.pgi)}%"></i></div>`)}
    ${mk('الدخل الضائع من الشواغر',short(PM.vacancyLoss),`${PM.vacant} وحدة شاغرة${PM.unpriced?` · ${PM.unpriced} بلا إيجار محدد`:''}`,'var(--red)')}
    ${mk('نسبة التحصيل',`${Math.round(PM.collection)}%`,`<span class="pill ${colCls}">${short(PM.duePaid)} من ${short(PM.dueAmt)} مستحق</span>`,'var(--green)',`<div class="bar" style="margin-top:6px"><i style="width:${Math.round(PM.collection)}%"></i></div>`)}
    ${mk('متوسط المدة المتبقية للعقود WALE',`${PM.wale.toFixed(1)} سنة`,'مرجّح بالدخل (إيجارات ومستثمرون)','var(--sky)')}
  </div>
  <div class="split mb">
    <div class="mode self agp" data-go="#operations">
      <div class="agh"><h4>🏠 التشغيل الذاتي <span class="en">Self-Operation</span></h4><span class="pill gold">${self.length} اتفاقية</span></div>
      <div class="mk">
        ${mk('الدخل',short(S('rev')),'إيراد فعلي','var(--green)')}
        ${mk('التكاليف',short(S('exp')),'تكاليف التشغيل','var(--wood)')}
        ${mk('ندفع للهيئة',short(S('pay')),'','var(--amber)')}
        ${mk('صافي الربح',short(S('profit')),`هامش ${pct(S('profit'),S('rev'))}%`,'var(--sky)')}
        ${mk('الإشغال',`${pct(selfOcc,selfUnits)}%`,`${selfOcc} من ${selfUnits} وحدة`,'var(--gold)',`<div class="bar" style="margin-top:6px"><i style="width:${pct(selfOcc,selfUnits)}%"></i></div>`)}
        ${mk('متأخرات التحصيل',short(S('overdue')),'','var(--red)')}
        ${(()=>{ const K=omContracts(); return mk('مقاولو التشغيل والصيانة',short(sum(K.map(k=>({p:omPaid(k)})),'p')),`مدفوع من ${short(sum(K,'value'))} سنوياً`,'var(--wood)'); })()}
        ${(()=>{ const st=meterStats(Store.coll('meters').filter(m=>self.some(x=>x.k.id===meterAg(m)?.id))); return mk('فواتير العدادات',st.unpaidN?`${short(st.unpaidAmt)} غير مسدد`:'مسددة',`${st.count} عداد · ${st.lateN} فاتورة متأخرة`,'var(--amber)'); })()}
        ${(()=>{ const st=obsStats(Store.coll('observations').filter(o=>omContracts().some(k=>k.id===o.contractId))); return mk('ملاحظات المقاولين',`${st.open} مفتوحة`,`أُغلق ${st.closed} من ${st.total} · ${st.overdue} متأخرة`,'var(--red)'); })()}
      </div>
      <div class="twrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>الاتفاقية</th><th>الوحدات</th><th>الإشغال</th><th>الدخل</th><th>التكاليف</th><th>للهيئة</th><th>الربح</th><th>متأخرات</th></tr></thead><tbody>
        ${self.map(x=>`<tr><td>${esc(x.k.title)}<div class="small muted">${assetPlain(x.k.assetId)}</div></td><td>${num(x.units)}</td><td>${x.units?`${x.occPct}%`:'—'}</td><td>${num(x.rev)}</td><td>${num(x.exp)}</td><td>${payCell(x)}</td><td><b>${num(x.profit)}</b></td><td>${x.overdue?`<span class="pill bad">${num(x.overdue)}</span>`:'—'}</td></tr>`).join('')||'<tr><td colspan=8 class="empty">لا اتفاقيات تشغيل ذاتي</td></tr>'}
      </tbody></table></div>
      <a class="btn" href="#operations" style="margin-top:10px">فتح التشغيل الذاتي ←</a>
    </div>

    <div class="mode inv agp" data-go="#investor">
      <div class="agh"><h4>🤝 إسناد التشغيل لمستثمر <span class="en">Investor-Operated</span></h4><span class="pill info">${inv.length} اتفاقية</span></div>
      <div class="mk">
        ${mk('يدفع لنا المستثمرون',short(invDue),'سنوي حسب العقود','var(--green)')}
        ${mk('المحصّل فعلياً',short(invRev),`نسبة التحصيل ${pct(invRev,invDue)}%`,'var(--gold)',`<div class="bar gold" style="margin-top:6px"><i style="width:${Math.min(100,pct(invRev,invDue))}%"></i></div>`)}
        ${mk('ندفع للهيئة',short(I('pay')),'التكلفة علينا','var(--amber)')}
        ${mk('صافي الربح',short(I('profit')),`هامش ${pct(I('profit'),invDue)}%`,'var(--sky)')}
        ${mk('الأصول المسندة',I('assets'),`${I('units')} وحدة`,'var(--wood)')}
        ${mk('قيمة الأصول المسندة',short(I('value')),'','var(--green)')}
        ${mk('عقود تنتهي خلال 90 يوم',ending.length,ending.map(x=>esc(x.k.party)).join('، '),'var(--red)')}
        ${(()=>{ const R=Store.coll('requirements').filter(r=>inv.some(x=>x.k.id===r.contractId)), st=reqStats(R); return mk('متطلبات العقود',`${st.done} / ${st.total} منجز`,st.late?`${st.late} متأخر · ${st.prog} قيد التنفيذ`:`${st.prog} قيد التنفيذ`,'var(--sky)'); })()}
      </div>
      <div class="twrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>المستثمر</th><th>يدفع لنا</th><th>المحصّل</th><th>للهيئة</th><th>الربح</th><th>الهامش</th><th>المتطلبات</th><th>ينتهي خلال</th></tr></thead><tbody>
        ${inv.map(x=>`<tr><td>${esc(x.k.party)}<div class="small muted">${assetPlain(x.k.assetId)}</div></td><td>${num(x.due)}</td><td>${num(x.rev)} <span class="small muted">${pct(x.rev,x.due)}%</span></td><td>${payCell(x)}</td><td><b>${num(x.profit)}</b></td><td>${x.margin}%</td><td>${reqIcons(x.k.id)}</td><td>${x.daysLeft==null?'—':pill(x.daysLeft<0?'منتهي':x.daysLeft+' يوم')}</td></tr>`).join('')||'<tr><td colspan=8 class="empty">لا اتفاقيات إسناد تشغيل</td></tr>'}
      </tbody></table></div>
      <a class="btn" href="#investor" style="margin-top:10px">فتح إسناد التشغيل لمستثمر ←</a>
    </div>
  </div>

  <div class="secl">مؤشر صحة الاتفاقيات</div>
  <div class="card mb"><div class="hgrid">${all.slice().map(x=>({x,h:agreementHealth(x.k)})).sort((p,q)=>p.h.score-q.h.score).map(({x,h})=>`<div class="hrow">${healthBadge(x.k)}<div style="min-width:0"><b>${esc(x.k.type==='مستثمر'?x.k.party:x.k.title)}</b><div class="small muted">${AG_LABEL[x.k.type]}${h.weakest?` · أضعف عنصر: ${esc(h.weakest.l)} (${h.weakest.score})`:''}</div><div class="bar ${h.score<40?'red':h.score<60?'gold':''}" style="margin-top:6px"><i style="width:${h.score}%"></i></div></div></div>`).join('')}</div><div class="small muted" style="margin-top:8px">اضغط على الدرجة لرؤية تفاصيلها. الترتيب من الأضعف للأقوى.</div></div>
  <div class="secl">التحليل</div>
  <div class="grid g2 mb">
    <div class="card"><h3>الدخل الشهري حسب نوع الاتفاقية</h3><div class="chart"><canvas id="c1"></canvas></div></div>
    <div class="card"><h3>التدفق النقدي المتوقع (3 أشهر) <span class="small muted">تقديري</span></h3><div class="chart"><canvas id="cf"></canvas></div><div class="small muted" style="margin-top:6px">الداخل: أقساط المستأجرين المستحقة ودفعات المستثمرين. الخارج: حصة شهرية لالتزام الهيئة وعقود المقاولين.</div></div>
  </div>
  <div class="grid g2 mb">
    <div class="card"><h3>أعمار متأخرات المستأجرين <a href="#operations" class="small">التفاصيل</a></h3>${PM.arrears?`<div class="chart" style="height:220px"><canvas id="cag"></canvas></div>`:'<div class="empty">لا توجد متأخرات</div>'}</div>
    <div class="card"><h3>جدول انتهاء العقود حسب الدخل</h3><div class="chart" style="height:220px"><canvas id="cex"></canvas></div><div class="small muted" style="margin-top:6px">الدخل السنوي الذي تنتهي عقوده في كل سنة. تركّز الانتهاء في سنة واحدة يعني مخاطر تجديد.</div></div>
  </div>
  <div class="grid g2 mb">
    <div class="card"><h3>تركّز الدخل حسب الاتفاقية</h3><div class="chart" style="height:240px"><canvas id="ccc"></canvas></div></div>
    <div class="card"><h3>التنبيهات <a href="#alerts" class="small">عرض الكل</a></h3>${alertsHtml(alerts,6)}</div>
  </div>
  <div class="grid">
    <div class="card"><h3>آخر العمليات (سجل التدقيق)</h3><ul class="audit">${Store.coll('audit').slice(0,6).map(a=>`<li><b>${esc(a.action)}</b> ${esc(a.coll)} / ${esc(a.refId)} — <span class="small muted">${esc(userName(a.by))} · <span class="num">${a.at}</span></span></li>`).join('')}</ul></div>
  </div>`;
  v.querySelectorAll('.agp[data-go]').forEach(p=>p.querySelectorAll('.agh,.mk .card').forEach(el=>{ el.classList.add('go'); el.onclick=()=>{ location.hash=p.dataset.go; }; }));
  Charts.make('c1','bar',months,[{label:'دخل التشغيل الذاتي',data:mSelfRev,color:COLORS[2],stack:'r'},{label:'دفعات المستثمرين',data:mInvRev,color:COLORS[3],stack:'r'},{label:'تكاليف التشغيل الذاتي',data:mSelfExp,color:COLORS[5],stack:'e'}],{scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{callback:x=>short(x)}}}});
  Charts.make('cf','bar',PM.cf.map(x=>x.mo),[{label:'أقساط المستأجرين',data:PM.cf.map(x=>Math.round(x.tenants)),color:COLORS[2],stack:'in'},{label:'دفعات المستثمرين',data:PM.cf.map(x=>Math.round(x.invIn)),color:COLORS[3],stack:'in'},{label:'التزام الهيئة',data:PM.cf.map(x=>Math.round(x.auth)),color:COLORS[5],stack:'out'},{label:'المقاولون',data:PM.cf.map(x=>Math.round(x.om)),color:COLORS[1],stack:'out'}],{scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{callback:x=>short(x)}}}});
  if(PM.arrears) Charts.make('cag','bar',PM.aging.map(b=>b[0]),[{label:'المتأخر',data:PM.aging.map(b=>b[1]),backgroundColor:['#e0b85acc','#d98a3dcc','#c25a4acc','#8e2b22cc'],borderColor:['#e0b85a','#d98a3d','#c25a4a','#8e2b22']}],{plugins:{legend:{display:false}}});
  const ey=Object.keys(PM.expiry).sort(); Charts.make('cex','bar',ey,[{label:'عقود إيجار',data:ey.map(y=>PM.expiry[y].lease),color:COLORS[2],stack:'e'},{label:'عقود مستثمرين',data:ey.map(y=>PM.expiry[y].inv),color:COLORS[3],stack:'e'}],{scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{callback:x=>short(x)}}}});
  Charts.make('ccc','doughnut',PM.conc.map(x=>x.l),[{data:PM.conc.map(x=>x.v)}]);
}};

/* 2. الاتفاقيات ونموذج التشغيل */
M.agreements={key:'agreements',label:'الاتفاقيات والتشغيل',icon:'🧭',group:'الرئيسية',render(v){
  v.innerHTML=`
  <div class="split">
    <div class="mode inv"><h4 class="go" onclick="location.hash='#investor'">🤝 إسناد التشغيل لمستثمر <span class="en">Investor-Operated</span></h4><ul><li>اتفاقية بيننا وبين الهيئة الملكية: ندفع لها مبلغاً محدداً</li><li>عقد بيننا وبين المستثمر: يدفع لنا مبلغاً محدداً</li><li>ربحنا = ما يدفعه المستثمر − ما ندفعه للهيئة</li><li>المستثمر مسؤول بالكامل عن نطاق عمله (تشغيل، صيانة، تأجير...)</li></ul>
      <div class="chain" style="margin:10px 0"><div class="st"><h4>الهيئة الملكية</h4><div class="k">نسدد لها</div></div><div class="arrow">←</div><div class="st on"><h4>نحن</h4><div class="k">صاحب حق التخصيص</div></div><div class="arrow">←</div><div class="st"><h4>المستثمر</h4><div class="k">يسدد لنا ويشغّل</div></div></div>
      <table class="tbl" style="margin-top:10px"><thead><tr><th>الأصل</th><th>المستثمر</th><th>ندفع للهيئة</th><th>يدفع لنا</th><th>ربحنا</th><th>ينتهي</th></tr></thead><tbody>${Store.coll('contracts').filter(k=>k.type==='مستثمر').map(k=>`<tr><td>${assetPlain(k.assetId)}</td><td>${esc(k.party)}</td><td>${num(k.payToAuthority)}</td><td>${num(k.payFromInvestor)}</td><td><b>${num((k.payFromInvestor||0)-(k.payToAuthority||0))}</b></td><td class="num">${k.end}</td></tr>`).join('')||'<tr><td colspan=6 class="empty">لا عقود</td></tr>'}</tbody></table>
      ${(()=>{ const I=Store.coll('contracts').filter(k=>k.type==='مستثمر'); const p=sum(I,'payFromInvestor')-sum(I,'payToAuthority'); return `<div class="grid g3" style="margin-top:10px"><div class="card kpi" style="padding:12px;--kc:var(--wood)"><div class="l">ندفع للهيئة (سنوي)</div><div class="v" style="font-size:20px">${short(sum(I,'payToAuthority'))}</div></div><div class="card kpi" style="padding:12px;--kc:var(--sky)"><div class="l">يدفع لنا المستثمرون</div><div class="v" style="font-size:20px">${short(sum(I,'payFromInvestor'))}</div></div><div class="card kpi" style="padding:12px;--kc:var(--green)"><div class="l">صافي ربحنا</div><div class="v" style="font-size:20px">${short(p)}</div></div></div>`; })()}
      <a class="btn" href="#investor" style="margin-top:10px">فتح إسناد التشغيل لمستثمر ←</a></div>
    <div class="mode self"><h4 class="go" onclick="location.hash='#operations'">🏠 التشغيل الذاتي <span class="en">Self-Operation</span></h4><ul><li>تحصيل وتأجير وإشغال وحالة المبنى</li><li>ملفات العملاء (المستأجرين)</li></ul>
      ${(()=>{ const units=Store.coll('assets').filter(a=>a.level==='unit'&&agreementFor(a.id)?.type==='تشغيل ذاتي'); const occ=units.filter(u=>u.occupancy==='مشغول').length; const due=finOf(Store.coll('payments')).overdue; return `<div class="grid g3" style="margin-top:10px"><div class="card kpi" style="padding:12px"><div class="l">الإشغال</div><div class="v" style="font-size:20px">${pct(occ,units.length)}%</div></div><div class="card kpi" style="padding:12px;--kc:var(--red)"><div class="l">مستحقات متأخرة</div><div class="v" style="font-size:20px">${short(due)}</div></div><div class="card kpi" style="padding:12px;--kc:var(--sky)"><div class="l">الوحدات</div><div class="v" style="font-size:20px">${units.length}</div></div></div>`; })()}
      <table class="tbl" style="margin-top:10px"><thead><tr><th>الاتفاقية</th><th>الأصل</th><th>الإيراد</th><th>المصروف</th><th>ندفع للهيئة</th><th>ربحنا</th></tr></thead><tbody>${Store.coll('contracts').filter(k=>k.type==='تشغيل ذاتي').map(k=>{ const p=agreementPL(k); return `<tr><td>${esc(k.title)}</td><td>${assetPlain(k.assetId)}</td><td>${num(p.rev)}</td><td>${num(p.exp)}</td><td>${k.payToAuthority===''||k.payToAuthority==null?'<span class="pill warn">غير محدد</span>':num(p.pay)}</td><td><b>${num(p.profit)}</b></td></tr>`; }).join('')||'<tr><td colspan=6 class="empty">لا اتفاقيات</td></tr>'}</tbody></table>
      <div class="small muted" style="margin-top:6px">ربح التشغيل الذاتي = الإيراد الفعلي − المصروفات − ما ندفعه للهيئة حسب الاتفاقية</div>
      <a class="btn" href="#operations" style="margin-top:10px">فتح التشغيل الذاتي</a></div>
  </div>`;
}};

/* 3. سجل الأصول (شجرة + جدول + تفاصيل + QR) */
const AssetView={mode:'agreement',ag:'',open:null};
M.assets={key:'assets',label:'سجل الأصول',icon:'🏗️',group:'الأساسي',render(v){
  const A=Store.coll('assets'); const st=AssetView;
  const grp=t=>A.filter(x=>(agreementFor(x.id)?.type||'none')===t);
  const card=(t,label,icon,color)=>{ const L=grp(t), ks=t==='none'?[]:opAgreements().filter(k=>k.type===t); const units=L.filter(x=>x.level==='unit'), occ=units.filter(u=>u.occupancy==='مشغول').length; const val=sum(ks.map(k=>Store.get('assets',k.assetId)||{}),'value');
    return `<div class="card kpi agc ${st.ag===t?'sel':''}" data-ag="${t}" style="--kc:${color}"><div class="l">${icon} ${label}${t!=='none'?` · ${ks.length} اتفاقية`:''}</div><div class="v">${L.length} <span class="small muted">أصل</span></div><div class="s">${units.length} وحدة${units.length?` · إشغال ${pct(occ,units.length)}%`:''}${val?` · القيمة ${short(val)}`:''}</div></div>`; };
  v.innerHTML=`<div class="grid g3 mb">${card('تشغيل ذاتي','التشغيل الذاتي <span class="en">Self-Operation</span>','🏠','var(--wood)')}${card('مستثمر','إسناد التشغيل لمستثمر <span class="en">Investor-Operated</span>','🤝','var(--sky)')}${card('none','غير مرتبط باتفاقية','⚪','var(--muted)')}</div>
    ${st.ag?`<div class="toolbar"><span class="pill ${st.ag==='مستثمر'?'info':st.ag==='none'?'':'gold'}">عرض: ${st.ag==='none'?'غير مرتبط':AG_LABEL[st.ag]}</span><button class="btn sm" id="clrAg">✕ عرض الكل</button></div>`:''}
    <div class="tabs"><button class="active" data-t="tree">هيكل الأصول</button><button data-t="table">الجدول</button></div><div id="aTree"></div><div id="aTable" class="hidden"></div>`;
  v.querySelectorAll('[data-ag]').forEach(c=>c.onclick=()=>{ st.ag=st.ag===c.dataset.ag?'':c.dataset.ag; M.assets.render(v); });
  const clr=$('#clrAg',v); if(clr) clr.onclick=()=>{ st.ag=''; M.assets.render(v); };
  v.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $('#aTree',v).classList.toggle('hidden',b.dataset.t!=='tree'); $('#aTable',v).classList.toggle('hidden',b.dataset.t!=='table'); });
  renderTree($('#aTree',v));
  crud(assetCrudCfg(st.ag?(x=>(agreementFor(x.id)?.type||'none')===st.ag):undefined),$('#aTable',v));
}};
function assetCrudCfg(where){ return {coll:'assets',title:'أصل',where,
  columns:[{k:'code',label:'الرمز'},{k:'name',label:'الاسم'},{k:'level',label:'المستوى',fmt:r=>pill(LEVELS[r.level]),plain:r=>LEVELS[r.level]},{k:'type',label:'النوع'},{k:'parentId',label:'يتبع لـ',fmt:r=>assetPlain(r.parentId),plain:r=>assetPlain(r.parentId)},{k:'location',label:'الموقع'},{k:'area',label:'المساحة م²',fmt:r=>num(r.area)},{k:'value',label:'القيمة',fmt:r=>money(r.value)},{k:'condition',label:'الحالة الفنية',fmt:r=>pill(r.condition)},{k:'status',label:'الحالة',fmt:r=>pill(r.status)},{k:'agreement',label:'الاتفاقية',fmt:r=>agPill(agreementFor(r.id)),plain:r=>agPlain(agreementFor(r.id))}],
  filters:[{k:'level',label:'المستوى',options:LEVEL_ORDER.map(l=>({v:l,l:LEVELS[l]}))},{k:'condition',label:'الحالة',options:['ممتاز','جيد','مقبول','يحتاج صيانة']},...AG_FILTERS],
  fields:assetFields(), detail:assetDetail}; }
function assetFields(){ return [
  {k:'code',label:'رمز الأصل',required:true},{k:'name',label:'اسم الأصل',required:true},
  {k:'level',label:'المستوى',type:'select',required:true,options:LEVEL_ORDER.map(l=>({v:l,l:LEVELS[l]}))},
  {k:'parentId',label:'يتبع لـ (الأصل الأب)',type:'select',options:()=>Store.coll('assets').filter(a=>a.level!=='equipment').map(a=>({v:a.id,l:`${LEVELS[a.level]}: ${a.name}`}))},
  {k:'type',label:'النوع'},{k:'location',label:'الموقع'},{k:'area',label:'المساحة م²',type:'number'},{k:'ownership',label:'الملكية',default:'مخصص'},
  {k:'value',label:'القيمة (ر.س)',type:'number'},{k:'condition',label:'الحالة الفنية',type:'select',options:['ممتاز','جيد','مقبول','يحتاج صيانة'],default:'جيد'},
  {k:'status',label:'الحالة',type:'select',options:['قيد التشغيل','مؤجر','شاغر','يعمل','متوقف','تحت الإنشاء','مستبعد'],default:'قيد التشغيل'},
  {k:'occupancy',label:'الإشغال (للوحدات)',type:'select',options:['مشغول','شاغر']},{k:'rent',label:'الإيجار السنوي',type:'number'},
  {k:'tenantId',label:'المستأجر',type:'select',options:()=>Store.coll('clients').map(c=>({v:c.id,l:c.name}))},
  {k:'serial',label:'الرقم التسلسلي (معدات)'},{k:'warrantyEnd',label:'نهاية الضمان',type:'date'},{k:'lifeYears',label:'العمر الافتراضي (سنة)',type:'number'},{k:'acquiredOn',label:'تاريخ الاقتناء',type:'date'},
  {k:'notes',label:'ملاحظات',type:'textarea',full:true}]; }
function renderTree(c){
  const st=AssetView, all=Store.coll('assets'), ICON={project:'🏙️',district:'🏘️',building:'🏢',unit:'🏠',equipment:'⚙️'};
  if(!st.open) st.open=new Set([...all.filter(a=>a.level==='project'||a.level==='district').map(a=>a.id),...opAgreements().map(k=>k.assetId)]);
  const open=st.open, rootOf=new Map(opAgreements().map(k=>[k.assetId,k]));
  const hasKids=id=>all.some(x=>x.parentId===id);
  const match=a=>!st.ag||(agreementFor(a.id)?.type||'none')===st.ag;
  // allow(child) decides which children appear inside the current branch
  const node=(a,allow,showAg)=>{ const kids=all.filter(x=>x.parentId===a.id&&allow(x)); const k=rootOf.get(a.id);
    return `<li><div class="n ${match(a)?'':'dim'}" data-id="${a.id}"><span class="tg" data-tg="${a.id}">${kids.length?(open.has(a.id)?'▾':'▸'):'·'}</span><span>${ICON[a.level]}</span><span>${esc(a.name)}</span><span class="lv">${LEVELS[a.level]}</span><span class="small muted">${esc(a.code)}</span>${kids.length?`<span class="small muted">(${descendants(a.id).filter(allow).length})</span>`:''}${showAg&&k?agPill(k):''}${pill(a.condition)}</div>${open.has(a.id)&&kids.length?`<ul>${kids.map(x=>node(x,allow,showAg)).join('')}</ul>`:''}</li>`; };
  let body='';
  if(st.mode==='structure'){
    body=`<div class="card tree"><ul>${all.filter(a=>!a.parentId).map(a=>node(a,()=>true,true)).join('')}</ul></div>`;
  } else {
    const groups=[];
    opAgreements().filter(k=>!st.ag||st.ag===k.type).forEach(k=>{ const root=Store.get('assets',k.assetId); if(!root) return;
      const allow=x=>agreementFor(x.id)?.id===k.id; const o=agreementOps(k), p=agreementPL(k);
      groups.push(`<div class="card tree agt ${k.type==='مستثمر'?'inv':'self'}"><div class="agth"><div>${agPill(k)} <b>${esc(k.title)}</b> <span class="small muted">${esc(k.number)}</span></div>
        <div class="small muted">${num(o.assets)} أصل · ${num(o.units)} وحدة${k.type!=='مستثمر'&&o.units?` · إشغال ${o.occPct}%`:''} · ${k.type==='مستثمر'?`يدفع لنا ${short(p.due)}`:`دخل ${short(p.rev)}`} · للهيئة ${k.payToAuthority===''||k.payToAuthority==null?'غير محدد':short(p.pay)} · ربحنا <b>${short(p.profit)}</b></div></div><ul>${node(root,allow,false)}</ul></div>`); });
    if(!st.ag||st.ag==='none'){ const un=x=>!agreementFor(x.id); const roots=all.filter(x=>un(x)&&(!x.parentId||!un(Store.get('assets',x.parentId)||{id:''})));
      if(roots.length) groups.push(`<div class="card tree agt"><div class="agth"><div>${agPill(null)} <b>أصول غير مرتبطة باتفاقية تشغيلية</b></div><div class="small muted">اربطها باتفاقية التشغيل الذاتي أو إسناد التشغيل لمستثمر من صفحة العقود</div></div><ul>${roots.map(r=>node(r,un,false)).join('')}</ul></div>`); }
    body=groups.join('')||'<div class="card empty">لا توجد أصول</div>';
  }
  c.innerHTML=`<div class="toolbar"><div class="seg"><button class="btn sm ${st.mode==='agreement'?'p':''}" data-m="agreement">حسب الاتفاقية</button><button class="btn sm ${st.mode==='structure'?'p':''}" data-m="structure">حسب الهيكل</button></div><span class="small muted">مشروع ← حي ← مبنى ← وحدة ← معدات</span><span class="sp"></span><button class="btn sm" id="expAll">فتح الكل</button><button class="btn sm" id="colAll">طي الكل</button>${can('create')?`<button class="btn p" id="addA">＋ إضافة أصل</button>`:''}</div>${body}`;
  c.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ st.mode=b.dataset.m; renderTree(c); });
  c.querySelectorAll('.n').forEach(n=>n.onclick=()=>assetDetail(Store.get('assets',n.dataset.id)));
  c.querySelectorAll('[data-tg]').forEach(t=>t.onclick=e=>{ e.stopPropagation(); const id=t.dataset.tg; if(!hasKids(id)) return; open.has(id)?open.delete(id):open.add(id); renderTree(c); });
  $('#expAll',c).onclick=()=>{ all.forEach(a=>hasKids(a.id)&&open.add(a.id)); renderTree(c); };
  $('#colAll',c).onclick=()=>{ open.clear(); renderTree(c); };
  const b=$('#addA',c); if(b) b.onclick=()=>crud(assetCrudCfg(),document.createElement('div')).form(null);
}
function assetDetail(a){
  if(!a) return;
  const kids=descendants(a.id), ids=new Set([a.id,...kids.map(k=>k.id)]);
  const F=Store.coll('finance').filter(f=>ids.has(f.assetId)), rev=sum(F.filter(f=>f.kind==='إيراد'),'amount'), exp=sum(F.filter(f=>f.kind==='مصروف'),'amount');
  const K=Store.coll('contracts').filter(k=>ids.has(k.assetId)), D=Store.coll('documents').filter(d=>ids.has(d.assetId));
  const val=Number(a.value)||0, lcc=val+exp, roi=val?((rev-exp)/val*100):0;
  const age=a.acquiredOn?Math.floor((new Date()-new Date(a.acquiredOn))/31557600000):null;
  const gk=agreementFor(a.id), gp=gk?agreementPL(gk):null, isInv=gk?.type==='مستثمر';
  const agBox=gk?`<div class="agbox ${isInv?'inv':'self'}"><div class="agth"><div>${agPill(gk)} <b>${esc(gk.title)}</b> <span class="small muted">${esc(gk.number)}</span></div>${gk.assetId!==a.id?`<span class="small muted">موروثة من: ${esc(assetPlain(gk.assetId))}</span>`:''}</div>
    <dl class="dl"><div><dt>الطرف</dt><dd>${esc(gk.party)}</dd></div><div><dt>المدة</dt><dd class="num">${gk.start||'—'} ← ${gk.end||'—'}</dd></div><div><dt>ندفع للهيئة</dt><dd>${gk.payToAuthority===''||gk.payToAuthority==null?'<span class="pill warn">غير محدد</span>':money(gk.payToAuthority)}</dd></div>
    ${isInv?`<div><dt>يدفع لنا المستثمر</dt><dd>${money(gk.payFromInvestor)}</dd></div>`:`<div><dt>دخل الاتفاقية</dt><dd>${money(gp.rev)}</dd></div>`}<div><dt>ربح الاتفاقية</dt><dd><b>${money(gp.profit)}</b></dd></div><div><dt>مسؤولية التشغيل</dt><dd>${isInv?'على المستثمر':'علينا'}</dd></div>
    ${gk.scope?`<div style="grid-column:1/-1"><dt>نطاق العمل</dt><dd>${esc(gk.scope)}</dd></div>`:''}</dl>${isInv?reqBlock(gk):''}</div>`:`<div class="alert"><div><b>هذا الأصل غير مرتبط باتفاقية تشغيلية</b><span>اربطه باتفاقية التشغيل الذاتي أو إسناد التشغيل لمستثمر من صفحة العقود</span></div></div>`;
  const crumbs=ancestorsOf(a.id).map(x=>`<a href="#" data-go="${x.id}">${esc(x.name)}</a>`).join(' › ');
  const body=`
  <div class="small muted" style="margin-bottom:8px">${crumbs?crumbs+' › ':''}<b>${esc(a.name)}</b></div>
  <div class="tabs"><button class="active" data-t="info">البيانات</button><button data-t="fin">المالية و ROI</button>${a.level==='unit'?`<button data-t="pay">الدفعات (${paysOfAsset(a.id).length})</button>`:''}<button data-t="k">العقود (${K.length})</button><button data-t="doc">المستندات (${D.length})</button><button data-t="kids">الأصول التابعة (${kids.length})</button><button data-t="qr">QR</button><button data-t="log">التدقيق</button></div>
  <div data-p="info">${agBox}<dl class="dl">
    <div><dt>الرمز</dt><dd>${esc(a.code)}</dd></div><div><dt>المستوى</dt><dd>${LEVELS[a.level]}</dd></div><div><dt>النوع</dt><dd>${esc(a.type||'—')}</dd></div><div><dt>الموقع</dt><dd>${esc(a.location||'—')}</dd></div>
    <div><dt>المساحة</dt><dd>${num(a.area)} م²</dd></div><div><dt>الملكية</dt><dd>${esc(a.ownership||'—')}</dd></div><div><dt>القيمة</dt><dd>${money(a.value)}</dd></div><div><dt>الحالة الفنية</dt><dd>${pill(a.condition)}</dd></div>
    <div><dt>الحالة</dt><dd>${pill(a.status)}</dd></div><div><dt>الاتفاقية</dt><dd>${agPill(gk)}</dd></div>
    ${a.level==='unit'?`<div><dt>الإشغال</dt><dd>${pill(a.occupancy)}</dd></div><div><dt>المستأجر</dt><dd>${esc(clientName(a.tenantId))}</dd></div><div><dt>الإيجار السنوي</dt><dd>${money(a.rent)}</dd></div>`:''}
    ${a.level==='equipment'?`<div><dt>الرقم التسلسلي</dt><dd>${esc(a.serial||'—')}</dd></div><div><dt>نهاية الضمان</dt><dd class="num">${a.warrantyEnd||'—'} ${daysTo(a.warrantyEnd)!=null?pill(daysTo(a.warrantyEnd)<0?'منتهي':`${daysTo(a.warrantyEnd)} يوم`):''}</dd></div>`:''}
    <div><dt>العمر الافتراضي</dt><dd>${a.lifeYears?`${a.lifeYears} سنة${age!=null?` (مضى ${age})`:''}`:'—'}</dd></div>
    ${a.lifeYears&&age!=null?`<div class="full" style="grid-column:1/-1"><dt>استهلاك العمر الافتراضي</dt><dd><div class="bar ${age/a.lifeYears>.8?'red':''}"><i style="width:${Math.min(100,pct(age,a.lifeYears))}%"></i></div></dd></div>`:''}
    <div style="grid-column:1/-1"><dt>ملاحظات</dt><dd>${esc(a.notes||'—')}</dd></div></dl>
  </div>
  <div data-p="fin" class="hidden"><div class="grid g4">
    <div class="card kpi"><div class="l">الإيرادات (شامل التابع)</div><div class="v" style="font-size:20px">${short(rev)}</div></div>
    <div class="card kpi" style="--kc:var(--wood)"><div class="l">المصروفات التشغيلية</div><div class="v" style="font-size:20px">${short(exp)}</div></div>
    <div class="card kpi" style="--kc:var(--sky)"><div class="l">تكلفة دورة الحياة LCC</div><div class="v" style="font-size:20px">${short(lcc)}</div><div class="s">القيمة + التشغيل</div></div>
    <div class="card kpi" style="--kc:var(--green)"><div class="l">العائد على الاستثمار ROI</div><div class="v" style="font-size:20px">${val?roi.toFixed(1)+'%':'—'}</div><div class="s">(إيراد − مصروف) ÷ القيمة</div></div></div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>التاريخ</th><th>النوع</th><th>التصنيف</th><th>الأصل</th><th>المبلغ</th></tr></thead><tbody>${F.slice(0,12).map(f=>`<tr><td class="num">${f.date}</td><td>${pill(f.kind)}</td><td>${esc(f.category)}</td><td>${assetPlain(f.assetId)}</td><td>${money(f.amount)}</td></tr>`).join('')||'<tr><td colspan=5 class="empty">لا حركات</td></tr>'}</tbody></table></div>
  ${a.level==='unit'?(()=>{ const L=paysOfAsset(a.id), f=finOf(L); return `<div data-p="pay" class="hidden"><div class="grid g4 mb"><div class="card kpi"><div class="l">إجمالي الدفعات</div><div class="v" style="font-size:20px">${num(f.total)}</div></div><div class="card kpi" style="--kc:var(--gold)"><div class="l">المسدد</div><div class="v" style="font-size:20px">${num(f.paid)}</div><div class="s">${f.pct}%</div></div><div class="card kpi" style="--kc:var(--sky)"><div class="l">المتبقي</div><div class="v" style="font-size:20px">${num(f.remaining)}</div></div><div class="card kpi" style="--kc:var(--red)"><div class="l">المتأخر</div><div class="v" style="font-size:20px">${num(f.overdue)}</div></div></div>${payTable(L,{showClient:true})}</div>`; })():''}
  <div data-p="k" class="hidden"><table class="tbl"><thead><tr><th>الرقم</th><th>النوع</th><th>العنوان</th><th>الطرف</th><th>النهاية</th><th>الحالة</th></tr></thead><tbody>${K.map(k=>`<tr><td>${esc(k.number)}</td><td>${pill(AG_LABEL[k.type]||k.type)}</td><td>${esc(k.title)}</td><td>${esc(k.party)}</td><td class="num">${k.end}</td><td>${pill(k.status)}</td></tr>`).join('')||'<tr><td colspan=6 class="empty">لا عقود</td></tr>'}</tbody></table></div>
  <div data-p="doc" class="hidden"><table class="tbl"><thead><tr><th>النوع</th><th>العنوان</th><th>الرقم</th><th>الإصدار</th><th>الانتهاء</th></tr></thead><tbody>${D.map(d=>`<tr><td>${pill(d.type)}</td><td>${esc(d.title)}</td><td>${esc(d.number)}</td><td class="num">${d.issued||'—'}</td><td class="num">${d.expiry||'—'}</td></tr>`).join('')||'<tr><td colspan=5 class="empty">لا مستندات</td></tr>'}</tbody></table></div>
  <div data-p="kids" class="hidden">${(()=>{ const base=ancestorsOf(a.id).length, ICO={district:'🏘️',building:'🏢',unit:'🏠',equipment:'⚙️'}; if(!kids.length) return '<div class="empty">لا أصول تابعة لهذا الأصل</div>';
    const cnt=LEVEL_ORDER.map(l=>[l,kids.filter(x=>x.level===l).length]).filter(x=>x[1]).map(([l,n])=>`${n} ${LEVELS[l]}`).join(' · ');
    return `<div class="small muted" style="margin-bottom:8px">كل ما يقع تحت ${esc(a.name)} في الهيكل: ${cnt}. اضغط على أي أصل لفتحه.</div><div class="twrap"><table class="tbl"><thead><tr><th>الأصل</th><th>الرمز</th><th>المستوى</th><th>الحالة الفنية</th><th>الإشغال</th><th>القيمة</th></tr></thead><tbody>${kids.map(x=>{ const dp=ancestorsOf(x.id).length-base-1; return `<tr class="clk" data-go="${x.id}"><td><span class="kidrow" style="padding-inline-start:${dp*22}px">${dp?'<span class="kidln">┘</span>':''}${ICO[x.level]||''} ${esc(x.name)}</span></td><td class="small muted">${esc(x.code)}</td><td>${LEVELS[x.level]}</td><td>${pill(x.condition)}</td><td>${x.level==='unit'?pill(x.occupancy||'—'):'—'}</td><td>${money(x.value)}</td></tr>`; }).join('')}</tbody></table></div>`; })()}</div>
  <div data-p="qr" class="hidden" style="text-align:center"><div class="qr" id="qrbox"></div><p class="small muted" style="margin-top:8px">امسح الرمز لفتح بيانات الأصل وسجل صيانته<br><span class="num">${esc(location.origin+location.pathname)}#asset-${a.id}</span></p>${IN_FRAME?'':'<button class="btn" onclick="window.print()">🖨 طباعة الملصق</button>'}</div>
  <div data-p="log" class="hidden">${auditHtml('assets',a.id)}</div>`;
  Modal.open({title:`${LEVELS[a.level]}: ${esc(a.name)}`,body,wide:true,footer:`${can('edit')?`<button class="btn" id="editA">✎ تعديل</button>`:''}<button class="btn" onclick="Modal.close()">إغلاق</button>`});
  const root=$('#modalRoot');
  root.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ root.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); root.querySelectorAll('[data-p]').forEach(p=>p.classList.toggle('hidden',p.dataset.p!==b.dataset.t)); if(b.dataset.t==='qr'&&!$('#qrbox').children.length&&window.QRCode) new QRCode($('#qrbox'),{text:`${location.origin}${location.pathname}#asset-${a.id}`,width:180,height:180}); });
  root.querySelectorAll('[data-go]').forEach(x=>x.onclick=e=>{ e.preventDefault(); assetDetail(Store.get('assets',x.dataset.go)); });
  const e=$('#editA'); if(e) e.onclick=()=>crud(assetCrudCfg(),document.createElement('div')).form(a);
  bindPayTable(root,()=>{ App.render(); assetDetail(Store.get('assets',a.id)); });
  root.querySelectorAll('.reqbox[data-req]').forEach(b=>b.onclick=()=>reqEditor(b.dataset.req,()=>{ App.render(); }));
}

/* 4. إدارة المستندات */
M.documents={key:'documents',label:'المستندات',icon:'📁',group:'الأساسي',render(v){ crud({coll:'documents',title:'مستند',
  columns:[{k:'type',label:'النوع',fmt:r=>pill(r.type)},{k:'title',label:'العنوان'},{k:'number',label:'الرقم'},{k:'assetId',label:'الأصل',fmt:r=>assetName(r.assetId),plain:r=>assetPlain(r.assetId)},{k:'issuer',label:'الجهة المصدرة'},{k:'issued',label:'الإصدار',fmt:r=>`<span class="num">${r.issued||'—'}</span>`},{k:'expiry',label:'الانتهاء',fmt:r=>r.expiry?`<span class="num">${r.expiry}</span> ${daysTo(r.expiry)<=60?pill(daysTo(r.expiry)<0?'منتهي':`${daysTo(r.expiry)} يوم`):''}`:'—'},{k:'status',label:'الحالة',fmt:r=>pill(r.status)}],
  filters:[{k:'type',label:'النوع',options:['صك','عقد','ضمان','مخطط','شهادة استلام','تأمين','رخصة','أخرى']}],
  fields:[{k:'title',label:'عنوان المستند',required:true},{k:'type',label:'النوع',type:'select',required:true,options:['صك','عقد','ضمان','مخطط','شهادة استلام','تأمين','رخصة','أخرى']},{k:'number',label:'رقم المستند'},{k:'assetId',label:'الأصل المرتبط',type:'select',options:assetOpts},{k:'issuer',label:'الجهة المصدرة'},{k:'issued',label:'تاريخ الإصدار',type:'date'},{k:'expiry',label:'تاريخ الانتهاء',type:'date'},{k:'status',label:'الحالة',type:'select',options:['ساري','منتهي','قيد التجديد'],default:'ساري'},{k:'fileName',label:'اسم الملف / الرابط',full:true},{k:'notes',label:'ملاحظات',type:'textarea',full:true}]},v); }};
const assetOpts=()=>Store.coll('assets').map(a=>({v:a.id,l:`${LEVELS[a.level]}: ${a.name} (${a.code})`}));
const userOpts=()=>Store.coll('users').map(u=>({v:u.id,l:u.name}));
const clientOpts=()=>Store.coll('clients').map(c=>({v:c.id,l:c.name}));

/* 6. إدارة العقود */
function contractCfg(where,defType){ const c={coll:'contracts',title:'عقد',
    columns:[{k:'number',label:'الرقم'},{k:'type',label:'النوع',fmt:r=>pill(AG_LABEL[r.type]||r.type)},{k:'title',label:'العنوان'},{k:'party',label:'الطرف الآخر',fmt:r=>esc(r.party?.startsWith('C-')?clientName(r.party):r.party)},{k:'assetId',label:'الأصل',fmt:r=>assetName(r.assetId),plain:r=>assetPlain(r.assetId)},{k:'start',label:'البداية',fmt:r=>`<span class="num">${r.start||'—'}</span>`},{k:'end',label:'النهاية',fmt:r=>{const d=daysTo(r.end);return `<span class="num">${r.end||'—'}</span> ${d!=null&&d<=90&&r.type!=='إطارية'&&r.type!=='تخصيص'?pill(d<0?'منتهي':`${d} يوم`):''}`;}},{k:'value',label:'القيمة',fmt:r=>money(r.value)},{k:'payToAuthority',label:'ندفع للهيئة',fmt:r=>OP_TYPES.includes(r.type)?num(r.payToAuthority):'—'},{k:'profit',label:'ربحنا',fmt:r=>OP_TYPES.includes(r.type)?`<b>${num(agreementPL(r).profit)}</b>`:'—',plain:r=>OP_TYPES.includes(r.type)?agreementPL(r).profit:''},{k:'status',label:'الحالة',fmt:r=>pill(r.status)},{k:'renewal',label:'التجديد'}],
    filters:[{k:'type',label:'النوع',options:[{v:'إطارية',l:'إطارية'},{v:'تخصيص',l:'تخصيص'},{v:'تشغيل ذاتي',l:'التشغيل الذاتي'},{v:'مستثمر',l:'إسناد التشغيل لمستثمر'},'تشغيل وصيانة','إيجار','توريد','استشاري']},{k:'status',label:'الحالة',options:['ساري','منتهي','قيد التجديد','ملغي']}],
    fields:[{k:'number',label:'رقم العقد',required:true},{k:'type',label:'نوع العقد',type:'select',required:true,options:[{v:'إطارية',l:'إطارية'},{v:'تخصيص',l:'تخصيص'},{v:'تشغيل ذاتي',l:'التشغيل الذاتي'},{v:'مستثمر',l:'إسناد التشغيل لمستثمر'},'تشغيل وصيانة','إيجار','توريد','استشاري']},{k:'title',label:'عنوان العقد',required:true,full:true},{k:'party',label:'الطرف الآخر'},{k:'contractorId',label:'المقاول (لعقود التشغيل والصيانة)',type:'select',options:()=>Store.coll('contractors').map(x=>({v:x.id,l:x.name}))},{k:'assetId',label:'الأصل',type:'select',options:assetOpts},{k:'parentId',label:'يستند إلى (عقد أعلى)',type:'select',options:()=>Store.coll('contracts').map(k=>({v:k.id,l:`${k.number} — ${k.title}`}))},{k:'start',label:'تاريخ البداية',type:'date'},{k:'end',label:'تاريخ النهاية',type:'date'},{k:'value',label:'قيمة العقد',type:'number'},{k:'payToAuthority',label:'ما ندفعه للهيئة الملكية عن هذه الاتفاقية',type:'number'},{k:'investment',label:'التكلفة الاستثمارية الأولية (لحساب فترة الاسترداد)',type:'number'},{k:'payFromInvestor',label:'ما يدفعه المستثمر لنا',type:'number'},{k:'period',label:'دورية السداد',type:'select',options:['سنوي','نصف سنوي','ربع سنوي','شهري','دفعة واحدة']},{k:'scope',label:'نطاق العمل (مسؤولية المستثمر أو مسؤوليتنا في التشغيل الذاتي)',type:'textarea',full:true},{k:'status',label:'الحالة',type:'select',options:['ساري','منتهي','قيد التجديد','ملغي'],default:'ساري'},{k:'renewal',label:'التجديد',type:'select',options:['تلقائي','قابل للتجديد','يحتاج قرار','غير قابل']},{k:'obligations',label:'الالتزامات',type:'textarea',full:true},{k:'notes',label:'ملاحظات',type:'textarea',full:true}]}; if(where) c.where=where; c.onSave=o=>{ if(o.contractorId&&!o.party) Store.update('contracts',o.id,{party:Store.get('contractors',o.contractorId)?.name||''}); if(!o.parentId){ const k=agreementFor(o.assetId); if(k&&k.id!==o.id&&!OP_TYPES.includes(o.type)) Store.update('contracts',o.id,{parentId:k.id}); } }; if(defType){ const f=c.fields.find(x=>x.k==='type'); f.default=defType; c.title={'مستثمر':'عقد مستثمر','تشغيل ذاتي':'اتفاقية تشغيل ذاتي','تشغيل وصيانة':'عقد تشغيل وصيانة'}[defType]||'عقد'; } return c; }
M.contracts={key:'contracts',label:'العقود',icon:'📜',group:'الأساسي',render(v){
  const K=Store.coll('contracts');
  v.innerHTML=`<div class="grid g4 mb">
    <div class="card kpi"><div class="l">عقود سارية</div><div class="v">${K.filter(k=>k.status==='ساري').length}</div></div>
    <div class="card kpi" style="--kc:var(--red)"><div class="l">تنتهي خلال 90 يوم</div><div class="v">${K.filter(k=>{const d=daysTo(k.end);return d!=null&&d>=0&&d<=90;}).length}</div></div>
    <div class="card kpi" style="--kc:var(--gold)"><div class="l">قيمة عقود الإيجار</div><div class="v">${short(sum(K.filter(k=>k.type==='إيجار'),'value'))}</div></div>
    <div class="card kpi" style="--kc:var(--sky)"><div class="l">صافي ربحنا من الاتفاقيات</div><div class="v">${short(sum(opAgreements().map(agreementPL),'profit'))}</div><div class="s">مستثمر + تشغيل ذاتي</div></div></div><div id="t"></div>`;
  crud(contractCfg(),$('#t',v));
}};

/* 7. الإدارة المالية */
M.finance={key:'finance',label:'المالية',icon:'💰',group:'الأساسي',render(v){
  const F=Store.coll('finance'), rev=sum(F.filter(f=>f.kind==='إيراد'),'amount'), exp=sum(F.filter(f=>f.kind==='مصروف'),'amount');
  const val=sum(Store.coll('assets').filter(a=>a.level==='district'),'value');
  const months=[...new Set(F.map(f=>f.date.slice(0,7)))].sort().slice(-12);
  const ops=opAgreements(); const rowsK=ops.map(k=>({k,...agreementPL(k)}));
  const unlinked=F.filter(f=>!(f.contractId||agreementFor(f.assetId))); const uR=sum(unlinked.filter(f=>f.kind==='إيراد'),'amount'), uE=sum(unlinked.filter(f=>f.kind==='مصروف'),'amount');
  const byType={}; rowsK.forEach(x=>{ const t=x.k.type; byType[t]=byType[t]||{rev:0,exp:0,pay:0,due:0,profit:0,n:0}; ['rev','exp','pay','due','profit'].forEach(f=>byType[t][f]+=x[f]); byType[t].n++; });
  const cats={}; F.filter(f=>f.kind==='مصروف').forEach(f=>cats[f.category]=(cats[f.category]||0)+Number(f.amount));
  v.innerHTML=`<div class="grid g4 mb">
    <div class="card kpi"><div class="l">قيمة الأصول</div><div class="v">${short(val)}</div></div>
    <div class="card kpi" style="--kc:var(--gold)"><div class="l">الإيرادات</div><div class="v">${short(rev)}</div></div>
    <div class="card kpi" style="--kc:var(--wood)"><div class="l">المصروفات / تكلفة التشغيل</div><div class="v">${short(exp)}</div><div class="s">${pct(exp,rev)}% من الإيراد</div></div>
    <div class="card kpi" style="--kc:var(--sky)"><div class="l">صافي ربحنا بعد سداد الهيئة</div><div class="v">${short(sum(rowsK,'profit'))}</div><div class="s">ندفع للهيئة ${short(sum(rowsK,'pay'))} · العائد على القيمة ${val?(sum(rowsK,'profit')/val*100).toFixed(2):'—'}%</div></div></div>
  <div class="grid g2 mb"><div class="card"><h3>الاتجاه الشهري</h3><div class="chart"><canvas id="f1"></canvas></div></div><div class="card"><h3>ربحنا حسب نوع الاتفاقية</h3><div class="grid g2">${Object.entries(byType).map(([t,x])=>`<div class="card kpi" style="padding:12px;--kc:${t==='مستثمر'?'var(--sky)':'var(--wood)'}"><div class="l">${esc(AG_LABEL[t]||t)} · ${x.n} اتفاقية</div><div class="v" style="font-size:20px">${short(x.profit)}</div><div class="s">${t==='مستثمر'?`يدفع لنا ${short(x.due)}`:`إيراد ${short(x.rev)} · مصروف ${short(x.exp)}`} · للهيئة ${short(x.pay)}</div></div>`).join('')}</div><div class="chart" style="height:170px;margin-top:10px"><canvas id="f2"></canvas></div></div></div>
  <div class="grid g2 mb"><div class="card"><h3>المصروفات حسب التصنيف</h3><div class="chart" style="height:200px"><canvas id="f3"></canvas></div></div><div class="card" style="grid-column:1/-1;order:-1"><h3>الربح حسب الاتفاقية</h3><div class="twrap"><table class="tbl"><thead><tr><th>الاتفاقية</th><th>النوع</th><th>الإيراد الفعلي</th><th>المصروف</th><th>يدفع لنا المستثمر</th><th>ندفع للهيئة</th><th>ربحنا</th><th>الهامش</th></tr></thead><tbody>${rowsK.map(x=>`<tr><td>${esc(x.k.title)}<div class="small muted">${assetPlain(x.k.assetId)}</div></td><td>${pill(AG_LABEL[x.k.type])}</td><td>${num(x.rev)}</td><td>${x.k.type==='مستثمر'?'<span class="muted small">على المستثمر</span>':num(x.exp)}</td><td>${x.k.type==='مستثمر'?num(x.due):'—'}</td><td>${x.k.payToAuthority===''||x.k.payToAuthority==null?'<span class="pill warn">غير محدد</span>':num(x.pay)}</td><td><b>${num(x.profit)}</b></td><td>${x.margin}%</td></tr>`).join('')}${uR||uE?`<tr><td class="muted">حركات غير مرتبطة باتفاقية</td><td>—</td><td>${num(uR)}</td><td>${num(uE)}</td><td>—</td><td>—</td><td>${num(uR-uE)}</td><td>—</td></tr>`:''}</tbody></table></div><div class="small muted" style="margin-top:6px">مستثمر: ربحنا = ما يدفعه المستثمر − ما ندفعه للهيئة. تشغيل ذاتي: ربحنا = الإيراد − المصروف − ما ندفعه للهيئة.</div></div></div>
  <div id="t"></div>`;
  Charts.make('f1','line',months,[{label:'إيراد',data:months.map(mo=>sum(F.filter(f=>f.kind==='إيراد'&&f.date.startsWith(mo)),'amount'))},{label:'مصروف',data:months.map(mo=>sum(F.filter(f=>f.kind==='مصروف'&&f.date.startsWith(mo)),'amount')),color:COLORS[2]}]);
  Charts.make('f2','bar',rowsK.map(x=>x.k.title),[{label:'ربحنا',data:rowsK.map(x=>x.profit),backgroundColor:rowsK.map(x=>x.k.type==='مستثمر'?'#5b8aa8cc':'#a9713dcc'),borderColor:rowsK.map(x=>x.k.type==='مستثمر'?'#5b8aa8':'#a9713d')}],{indexAxis:'y',plugins:{legend:{display:false}}});
  Charts.make('f3','doughnut',Object.keys(cats),[{data:Object.values(cats)}]);
  crud({coll:'finance',title:'حركة مالية',defaultSort:'date',
    columns:[{k:'date',label:'التاريخ',fmt:r=>`<span class="num">${r.date}</span>`},{k:'kind',label:'النوع',fmt:r=>pill(r.kind)},{k:'category',label:'التصنيف'},{k:'contractId',label:'الاتفاقية',fmt:r=>{const k=Store.get('contracts',r.contractId); return k?`${esc(k.title)} ${pill(AG_LABEL[k.type])}`:'<span class="muted">—</span>';},plain:r=>contractName(r.contractId)},{k:'assetId',label:'الأصل',fmt:r=>assetName(r.assetId),plain:r=>assetPlain(r.assetId)},{k:'amount',label:'المبلغ',fmt:r=>money(r.amount)},{k:'ref',label:'المرجع'}],
    filters:[{k:'kind',label:'النوع',options:['إيراد','مصروف']},{k:'contractId',label:'الاتفاقية',options:()=>opAgreements().map(k=>({v:k.id,l:k.title}))},{k:'category',label:'التصنيف',options:()=>[...new Set(F.map(f=>f.category))]}],
    fields:[{k:'date',label:'التاريخ',type:'date',required:true,default:todayStr},{k:'kind',label:'النوع',type:'select',required:true,options:['إيراد','مصروف']},{k:'category',label:'التصنيف',required:true},{k:'assetId',label:'الأصل',type:'select',required:true,options:assetOpts},{k:'contractId',label:'الاتفاقية (تُحدد تلقائياً من الأصل إن تُركت فارغة)',type:'select',options:()=>Store.coll('contracts').filter(k=>OP_TYPES.includes(k.type)).map(k=>({v:k.id,l:`${k.type}: ${k.title}`}))},{k:'amount',label:'المبلغ',type:'number',required:true},{k:'ref',label:'المرجع (فاتورة/عقد/أمر عمل)'},{k:'notes',label:'ملاحظات',type:'textarea',full:true}],onSave:o=>{ if(!o.contractId){ const k=agreementFor(o.assetId); if(k) Store.update('finance',o.id,{contractId:k.id}); } }},$('#t',v));
}};

/* ───── متطلبات عقود المستثمرين ───── */
const REQ_ST=['لم يبدأ','قيد التنفيذ','منجز'];
const reqsOf=kid=>Store.coll('requirements').filter(r=>r.contractId===kid).sort((x,y)=>(x.seq||0)-(y.seq||0));
const reqState=r=>r.status==='منجز'?'done':(r.dueDate&&r.dueDate<todayStr()?'late':r.status==='قيد التنفيذ'?'prog':'todo');
const REQ_UI={done:{i:'✔',l:'منجز'},prog:{i:'⏳',l:'قيد التنفيذ'},todo:{i:'○',l:'لم يبدأ'},late:{i:'⚠',l:'متأخر'}};
const reqStats=L=>({total:L.length,done:L.filter(r=>reqState(r)==='done').length,late:L.filter(r=>reqState(r)==='late').length,prog:L.filter(r=>reqState(r)==='prog').length});
function reqIcons(kid){ const L=reqsOf(kid); return L.length?`<span class="reqicons">${L.map(r=>{ const s=reqState(r); return `<span class="ri ${s}" title="${esc(r.title)} — ${REQ_UI[s].l}">${REQ_UI[s].i}</span>`; }).join('')}</span>`:'<span class="small muted">—</span>'; }
function reqBlock(k){ const L=reqsOf(k.id), st=reqStats(L);
  return `<div class="reqbox" data-req="${k.id}" title="اضغط لتحديث الحالة">
    <div class="reqh"><b>متطلبات العقد</b><span class="small muted">${st.done} / ${st.total} منجز${st.late?` · <span style="color:var(--red)">${st.late} متأخر</span>`:''}</span><span class="small reqedit">تحديث ✎</span></div>
    ${L.length?`<ul class="req">${L.map(r=>{ const s=reqState(r); return `<li class="${s}"><span class="ri ${s}">${REQ_UI[s].i}</span><span class="rt">${esc(r.title)}</span>${s==='prog'&&r.progress?`<span class="small muted">${r.progress}%</span>`:''}${r.dueDate?`<span class="small muted num">${r.dueDate}</span>`:''}</li>`; }).join('')}</ul>`:'<div class="small muted">لا متطلبات مسجلة. اضغط لإضافتها.</div>'}
  </div>`; }
function reqEditor(kid,after){
  const k=Store.get('contracts',kid); if(!k) return; const reopen=()=>{ after&&after(); reqEditor(kid,after); }; const L=reqsOf(kid), ro=!can('edit');
  Modal.open({title:`متطلبات عقد: ${esc(k.party)}`,wide:true,body:`<p class="small muted" style="margin-bottom:10px">${esc(k.title)} · ${esc(k.number)}. حدّث حالة كل متطلب، وتظهر مباشرة في بطاقة العقد.</p>
    <div class="twrap"><table class="tbl"><thead><tr><th></th><th>المتطلب</th><th>الحالة</th><th>نسبة الإنجاز</th><th>الموعد المطلوب</th><th>ملاحظات</th><th>آخر تحديث</th><th></th></tr></thead><tbody>
    ${L.map(r=>{ const s=reqState(r); return `<tr data-rq="${r.id}"><td><span class="ri ${s}">${REQ_UI[s].i}</span></td>
      <td><input data-f="title" value="${esc(r.title)}" ${ro?'disabled':''}></td>
      <td><select data-f="status" ${ro?'disabled':''}>${REQ_ST.map(x=>`<option ${x===r.status?'selected':''}>${x}</option>`).join('')}</select></td>
      <td><input data-f="progress" type="number" min="0" max="100" value="${r.progress||0}" style="width:80px" ${ro?'disabled':''}></td>
      <td><input data-f="dueDate" type="date" value="${r.dueDate||''}" ${ro?'disabled':''}></td>
      <td><input data-f="notes" value="${esc(r.notes||'')}" ${ro?'disabled':''}></td>
      <td class="num small">${r.updatedAt||'—'}</td>
      <td>${can('delete')?`<button class="btn sm d" data-rqd="${r.id}">🗑</button>`:''}</td></tr>`; }).join('')||'<tr><td colspan="8" class="empty">لا متطلبات بعد</td></tr>'}
    </tbody></table></div>
    ${can('create')?`<div class="toolbar" style="margin-top:12px"><input id="rqNew" placeholder="متطلب جديد، مثل: بناء مسجد" style="flex:1;min-width:200px"><input id="rqNewD" type="date" style="width:auto"><button class="btn" id="rqAdd">＋ إضافة متطلب</button></div>`:''}`,
    footer:`<button class="btn" onclick="Modal.close()">إغلاق</button>${ro?'':`<button class="btn p" id="rqSave">حفظ التحديثات</button>`}`});
  const root=$('#modalRoot');
  root.querySelectorAll('select[data-f=status]').forEach(sel=>sel.onchange=()=>{ const tr=sel.closest('tr'), pg=tr.querySelector('[data-f=progress]'); if(sel.value==='منجز') pg.value=100; else if(sel.value==='لم يبدأ') pg.value=0; });
  const collect=()=>root.querySelectorAll('tr[data-rq]').forEach(tr=>{ const p={}; tr.querySelectorAll('[data-f]').forEach(el=>p[el.dataset.f]=el.dataset.f==='progress'?Math.max(0,Math.min(100,Number(el.value)||0)):el.value); const o=Store.get('requirements',tr.dataset.rq); const changed=Object.keys(p).some(x=>String(o[x]??'')!==String(p[x]??'')); if(changed){ p.updatedAt=todayStr(); Store.update('requirements',o.id,p); } });
  const sv=$('#rqSave'); if(sv) sv.onclick=()=>{ collect(); Modal.close(); toast('تم تحديث المتطلبات'); after&&after(); };
  const ad=$('#rqAdd'); if(ad) ad.onclick=()=>{ const t=$('#rqNew').value.trim(); if(!t){ toast('اكتب المتطلب'); return; } collect(); Store.add('requirements',{contractId:kid,seq:L.length+1,title:t,dueDate:$('#rqNewD').value,status:'لم يبدأ',progress:0,notes:'',updatedAt:todayStr()}); reopen(); };
  root.querySelectorAll('[data-rqd]').forEach(b=>b.onclick=()=>ask('حذف هذا المتطلب؟',()=>{ Store.remove('requirements',b.dataset.rqd); reopen(); },'حذف'));
}

/* بطاقة اتفاقية تشغيلية (تُستخدم في صفحتي التشغيل الذاتي والإسناد) */
function agCard(k){ const p=agreementPL(k), o=agreementOps(k), inv=k.type==='مستثمر', d=daysTo(k.end);
  const span=k.start&&k.end?Math.max(1,(new Date(k.end)-new Date(k.start))/86400000):0, used=span?Math.min(100,Math.max(0,Math.round((new Date(todayStr())-new Date(k.start))/86400000/span*100))):0;
  return `<div class="card agcard ${inv?'inv':'self'}" data-k="${k.id}">
    <div class="agth"><div><b>${esc(inv?k.party:k.title)}</b><div class="small muted">${esc(inv?k.title:assetPlain(k.assetId))} · ${esc(k.number)}</div></div><div style="display:flex;gap:6px;align-items:center">${d==null?'':pill(d<0?'منتهي':d<=90?`ينتهي خلال ${d} يوم`:'ساري')}${healthBadge(k)}</div></div>
    <div class="mk">
      ${inv?`<div><div class="l">يدفع لنا</div><b>${num(p.due)}</b></div><div><div class="l">المحصّل</div><b>${num(p.rev)}</b> <span class="small muted">${pct(p.rev,p.due)}%</span></div>`:`<div><div class="l">الدخل</div><b>${num(p.rev)}</b></div><div><div class="l">التكاليف</div><b>${num(p.exp)}</b></div>`}
      <div><div class="l">ندفع للهيئة</div><b>${k.payToAuthority===''||k.payToAuthority==null?'<span class="pill warn">غير محدد</span>':num(p.pay)}</b></div>
      <div><div class="l">ربحنا</div><b style="color:var(--green)">${num(p.profit)}</b> <span class="small muted">${p.margin}%</span></div>
      <div><div class="l">الأصول / الوحدات</div><b>${o.assets} / ${o.units}</b></div>
      ${inv?`<div><div class="l">التجديد</div><b>${esc(k.renewal||'—')}</b></div>`:`<div><div class="l">الإشغال</div><b>${o.units?o.occPct+'%':'—'}</b></div>`}
    </div>
    ${inv?'':(()=>{ const B=breakEven(k); return B.units.length?`<div class="small" style="margin-top:6px"><span class="muted">سعر التعادل للوحدة:</span> <b>${num(Math.round(B.beUnit))}</b> سنوياً (${num(Math.round(B.beUnit/12))} شهرياً)${B.authMissing?' <span class="pill warn">بدون مبلغ الهيئة</span>':''}</div>`:''; })()}
    ${(()=>{ const pb=payback(k); return `<div class="small" style="margin-top:10px"><span class="muted">فترة الاسترداد:</span> ${paybackTxt(pb)}${pb.inv?` · استُرد ${pb.pctRec}% من ${short(pb.inv)}`:''}</div>`; })()}
    ${span?`<div class="small muted" style="margin-top:10px">مدة العقد <span class="num">${k.start}</span> ← <span class="num">${k.end}</span> · مضى ${used}%</div><div class="bar ${d!=null&&d<=90?'red':'gold'}" style="margin-top:4px"><i style="width:${used}%"></i></div>`:''}
    ${inv?reqBlock(k):(()=>{ const st=meterStats(Store.coll('meters').filter(m=>meterAg(m)?.id===k.id)); return st.count?`<div class="small" style="margin-top:10px">⚡💧 <b>${st.count}</b> عداد · تكلفة 12 شهر ${num(st.cost12)} · ${st.unpaidN?`<span class="pill ${st.lateN?'bad':'warn'}">غير مسدد ${num(st.unpaidAmt)}</span>`:'<span class="pill ok">الفواتير مسددة</span>'}</div>`:''; })()}
    ${k.scope?`<div class="small" style="margin-top:10px"><span class="muted">نطاق العمل:</span> ${esc(k.scope)}</div>`:''}
  </div>`; }
function bindAgCards(root){ root.querySelectorAll('.reqbox[data-req]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); reqEditor(b.dataset.req,()=>App.render()); }); root.querySelectorAll('.agcard[data-k]').forEach(c=>c.onclick=()=>{ const k=Store.get('contracts',c.dataset.k); const a=Store.get('assets',k?.assetId); if(a) assetDetail(a); }); }

/* صفحة إسناد التشغيل لمستثمر */
M.investor={key:'investor',label:'إسناد التشغيل لمستثمر',icon:'🤝',group:'نماذج التشغيل',render(v){
  const K=opAgreements().filter(k=>k.type==='مستثمر'), L=K.map(k=>({k,...agreementPL(k),...agreementOps(k)}));
  const due=sum(L,'due'), got=sum(L,'rev'), pay=sum(L,'pay'), prof=sum(L,'profit'), ending=L.filter(x=>x.daysLeft!=null&&x.daysLeft<=90);
  const F=Store.coll('finance'); const months=[...new Set(F.map(f=>f.date.slice(0,7)))].sort().slice(-12); const kIdOf=f=>f.contractId||agreementFor(f.assetId)?.id;
  v.innerHTML=`<div class="pagehead inv"><div><h3>🤝 إسناد التشغيل لمستثمر <span class="en">Investor-Operated</span></h3><p class="small muted">ندفع للهيئة الملكية، والمستثمر يدفع لنا ويتحمل التشغيل كاملاً حسب نطاق عمله. ربحنا هو الفرق.</p></div><span class="pill info">${K.length} اتفاقية</span></div>
  <div class="grid g4 mb">
    <div class="card kpi" style="--kc:var(--green)"><div class="l">يدفع لنا المستثمرون</div><div class="v">${short(due)}</div><div class="s">سنوي حسب العقود</div></div>
    <div class="card kpi" style="--kc:var(--gold)"><div class="l">المحصّل فعلياً</div><div class="v">${short(got)}</div><div class="s">نسبة التحصيل ${pct(got,due)}%</div><div class="bar gold" style="margin-top:6px"><i style="width:${Math.min(100,pct(got,due))}%"></i></div></div>
    <div class="card kpi" style="--kc:var(--amber)"><div class="l">ندفع للهيئة</div><div class="v">${short(pay)}</div></div>
    <div class="card kpi" style="--kc:var(--sky)"><div class="l">صافي ربحنا</div><div class="v">${short(prof)}</div><div class="s">هامش ${pct(prof,due)}%</div></div>
    <div class="card kpi" style="--kc:var(--wood)"><div class="l">الأصول المسندة</div><div class="v">${sum(L,'assets')}</div><div class="s">${sum(L,'units')} وحدة · قيمة ${short(sum(L,'value'))}</div></div>
    <div class="card kpi" style="--kc:var(--red)"><div class="l">عقود تنتهي خلال 90 يوم</div><div class="v">${ending.length}</div><div class="s">${ending.map(x=>esc(x.k.party)).join('، ')||'—'}</div></div>
    ${(()=>{ const R=Store.coll('requirements').filter(r=>K.some(k=>k.id===r.contractId)), st=reqStats(R); return `<div class="card kpi" style="--kc:var(--green)"><div class="l">متطلبات العقود المنجزة</div><div class="v">${st.done} / ${st.total}</div><div class="s">${st.prog} قيد التنفيذ</div><div class="bar" style="margin-top:6px"><i style="width:${pct(st.done,st.total)}%"></i></div></div><div class="card kpi" style="--kc:var(--red)"><div class="l">متطلبات متأخرة</div><div class="v">${st.late}</div><div class="s">${R.filter(r=>reqState(r)==='late').map(r=>esc(r.title)).join('، ')||'لا يوجد'}</div></div>`; })()}
  </div>
  <div class="tabs"><button class="active" data-t="ag">عقود المستثمرين</button><button data-t="col">التحصيل الشهري</button><button data-t="as">الأصول المسندة</button><button data-t="mg">إدارة العقود</button></div>
  <div data-p="ag"><div class="grid g2">${K.map(agCard).join('')||'<div class="card empty">لا توجد عقود إسناد بعد. أضفها من تبويب إدارة العقود.</div>'}</div></div>
  <div data-p="col" class="hidden"><div class="card mb"><div class="chart"><canvas id="ic1"></canvas></div></div><div class="card" style="padding:0"><div class="twrap"><table class="tbl"><thead><tr><th>الشهر</th>${K.map(k=>`<th>${esc(k.party)}</th>`).join('')}<th>المحصّل</th><th>المتوقع</th><th>الفرق</th></tr></thead><tbody>
    ${months.map(mo=>{ const per=K.map(k=>sum(F.filter(f=>f.kind==='إيراد'&&kIdOf(f)===k.id&&f.date.startsWith(mo)),'amount')); const t=per.reduce((s,x)=>s+x,0), e=Math.round(due/12); return `<tr><td class="num">${mo}</td>${per.map(x=>`<td>${num(x)}</td>`).join('')}<td><b>${num(t)}</b></td><td>${num(e)}</td><td>${t-e<0?`<span class="pill bad">${num(t-e)}</span>`:num(t-e)}</td></tr>`; }).join('')}
  </tbody></table></div></div></div>
  <div data-p="as" class="hidden"></div><div data-p="mg" class="hidden"></div>`;
  const tabs=v.querySelectorAll('.tabs button'); tabs.forEach(b=>b.onclick=()=>{ tabs.forEach(x=>x.classList.remove('active')); b.classList.add('active'); v.querySelectorAll('[data-p]').forEach(p=>p.classList.toggle('hidden',p.dataset.p!==b.dataset.t)); });
  bindAgCards(v);
  Charts.make('ic1','bar',months,K.map((k,i)=>({label:k.party,data:months.map(mo=>sum(F.filter(f=>f.kind==='إيراد'&&kIdOf(f)===k.id&&f.date.startsWith(mo)),'amount')),color:COLORS[(i+3)%COLORS.length],stack:'s'})),{scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{callback:x=>short(x)}}}});
  crud(assetCrudCfg(x=>agreementFor(x.id)?.type==='مستثمر'),v.querySelector('[data-p=as]'));
  crud(contractCfg(k=>k.type==='مستثمر','مستثمر'),v.querySelector('[data-p=mg]'));
}};

/* ───── سعر التعادل لتأجير الوحدات (التشغيل الذاتي) ───── */
/* التكاليف السنوية للاتفاقية ÷ الوحدات القابلة للتأجير، موزعة بالمساحة إن توفرت */
function breakEven(k,o={}){
  const occ=Math.min(100,Math.max(10,Number(o.occ)||100))/100, margin=(Number(o.margin)||0)/100;
  const units=Store.coll('assets').filter(u=>u.level==='unit'&&u.status!=='مستبعد'&&agreementFor(u.id)?.id===k.id);
  const OM=Store.coll('contracts').filter(x=>x.type==='تشغيل وصيانة'&&agreementFor(x.assetId)?.id===k.id);
  const MT=Store.coll('meters').filter(m=>meterAg(m)?.id===k.id&&m.payer!=='المستأجر'), MB=Store.coll('meterBills').filter(b=>MT.some(m=>m.id===b.meterId));
  const per=[...new Set(MB.map(b=>b.period))].sort().slice(-6), meters=per.length?sum(MB.filter(b=>per.includes(b.period)),'amount')/per.length*12:0;
  const cur=curMo(), last6=[0,1,2,3,4,5].map(i=>addMo(cur,-i));
  const other=sum(Store.coll('finance').filter(f=>f.kind==='مصروف'&&(f.contractId||agreementFor(f.assetId)?.id)===k.id&&last6.includes(f.date.slice(0,7))&&f.category!=='عقد تشغيل وصيانة'&&!String(f.category||'').startsWith('فاتورة')),'amount')*2;
  const yrsLeft=k.end?Math.max(0.5,(new Date(k.end)-new Date(todayStr()))/31557600000):null, invRec=o.inv&&k.investment&&yrsLeft?Number(k.investment)/yrsLeft:0;
  const costs={auth:Number(k.payToAuthority)||0,om:sum(OM,'value'),meters,other,invRec}; const total=costs.auth+costs.om+costs.meters+costs.other;
  const target=(total+invRec)/occ*(1+margin);
  const byArea=units.length&&units.every(u=>Number(u.area)>0), W=byArea?sum(units,'area'):units.length;
  const rows=units.map(u=>{ const w=byArea?Number(u.area):1; const be=W?total*w/W:0, sug=W?target*w/W:0; return {u,be,sug,rent:Number(u.rent)||0}; });
  return {units,costs,total,target,byArea,area:byArea?W:0,beUnit:units.length?total/units.length:0,sugUnit:units.length?target/units.length:0,beM2:byArea?total/W:0,sugM2:byArea?target/W:0,rows,yrsLeft,authMissing:k.payToAuthority===''||k.payToAuthority==null,
    curRent:sum(rows,'rent'),priced:rows.filter(r=>r.rent>0).length};
}
const BEView={k:'',occ:100,margin:0,inv:false};
function renderBE(c){
  const SK=opAgreements().filter(k=>k.type==='تشغيل ذاتي'); if(!SK.length){ c.innerHTML='<div class="card empty">لا توجد اتفاقيات تشغيل ذاتي</div>'; return; }
  const st=BEView; if(!SK.some(k=>k.id===st.k)) st.k=SK[0].id; const k=Store.get('contracts',st.k), B=breakEven(k,st), plain=st.occ==100&&!st.margin&&!st.inv;
  const CL=[{k:'auth',l:'التزام الهيئة الملكية'},{k:'om',l:'مقاولو التشغيل والصيانة'},{k:'meters',l:'فواتير العدادات علينا'},{k:'other',l:'تكاليف تشغيل أخرى (متوسط آخر 6 أشهر)'}];
  c.innerHTML=`<div class="toolbar"><select id="beK" style="width:auto">${SK.map(x=>`<option value="${x.id}" ${x.id===st.k?'selected':''}>${esc(x.title)}</option>`).join('')}</select>
    <label class="small">الإشغال المستهدف % <input id="beO" type="number" min="10" max="100" value="${st.occ}" style="width:80px"></label>
    <label class="small">هامش ربح % <input id="beM" type="number" min="0" max="200" value="${st.margin}" style="width:80px"></label>
    <label class="small"><input id="beI" type="checkbox" style="width:auto" ${st.inv?'checked':''}> استرداد الاستثمار خلال المدة المتبقية</label></div>
  ${B.authMissing?'<div class="alert bad mb"><div><b>مبلغ الهيئة غير محدد لهذه الاتفاقية</b><span>السعر أقل من الحقيقي حتى تُدخل ما ندفعه للهيئة من صفحة العقود</span></div></div>':''}
  ${!B.units.length?'<div class="alert mb"><div><b>لا توجد وحدات قابلة للتأجير تحت هذه الاتفاقية</b><span>أضف الوحدات في سجل الأصول</span></div></div>':''}
  <div class="grid g4 mb">
    <div class="card kpi" style="--kc:var(--wood)"><div class="l">التكاليف السنوية</div><div class="v">${short(B.total)}</div><div class="s">${B.units.length} وحدة قابلة للتأجير</div></div>
    <div class="card kpi" style="--kc:var(--gold)"><div class="l">سعر التعادل للوحدة (سنوي)</div><div class="v">${num(Math.round(B.beUnit))}</div><div class="s">شهري ${num(Math.round(B.beUnit/12))}${B.byArea?` · للمتر ${num(Math.round(B.beM2))}`:''}</div></div>
    <div class="card kpi" style="--kc:var(--green)"><div class="l">${plain?'السعر المقترح = سعر التعادل':'السعر المقترح للوحدة (سنوي)'}</div><div class="v">${num(Math.round(B.sugUnit))}</div><div class="s">${plain?'إشغال 100% بلا هامش':`إشغال ${st.occ}%${st.margin?` · هامش ${st.margin}%`:''}${st.inv?' · مع استرداد الاستثمار':''}`}</div></div>
    <div class="card kpi" style="--kc:var(--sky)"><div class="l">الإيجارات الحالية مقابل التعادل</div><div class="v">${B.total?pct(B.curRent,B.total):0}%</div><div class="s">${short(B.curRent)} من ${short(B.total)} · ${B.priced} من ${B.units.length} وحدة مسعّرة</div></div>
  </div>
  <div class="grid g2 mb">
    <div class="card"><h3>كيف حُسب السعر</h3><table class="tbl"><tbody>
      ${CL.map(x=>`<tr><td>${x.l}</td><td>${num(Math.round(B.costs[x.k]))}</td></tr>`).join('')}
      <tr style="font-weight:800"><td>إجمالي التكاليف السنوية</td><td>${num(Math.round(B.total))}</td></tr>
      ${st.inv?`<tr><td>استرداد الاستثمار (${num(k.investment||0)} ÷ ${B.yrsLeft?B.yrsLeft.toFixed(1):'—'} سنة متبقية)</td><td>${num(Math.round(B.costs.invRec))}</td></tr>`:''}
      <tr><td>÷ ${B.byArea?`المساحة القابلة للتأجير ${num(B.area)} م²`:`عدد الوحدات ${B.units.length}`}</td><td></td></tr>
      <tr style="font-weight:800;color:var(--green)"><td>سعر التعادل ${B.byArea?'للمتر المربع':'للوحدة'} سنوياً</td><td>${num(Math.round(B.byArea?B.beM2:B.beUnit))}</td></tr>
    </tbody></table><div class="small muted" style="margin-top:8px">سعر التعادل يغطي التكاليف عند إشغال كامل. ${B.byArea?'يُوزَّع على الوحدات حسب مساحتها.':'لا توجد مساحات لكل الوحدات، فيُوزَّع بالتساوي.'} أي إشغال أقل يرفع السعر المطلوب.</div></div>
    <div class="card"><h3>حساسية السعر للإشغال</h3><div class="chart" style="height:230px"><canvas id="beS"></canvas></div></div>
  </div>
  <div class="toolbar"><h3 style="color:var(--green)">السعر المقترح لكل وحدة</h3><span class="sp"></span>${can('edit')&&B.rows.some(r=>!r.rent)?`<button class="btn g" id="beApply">اعتماد السعر المقترح للوحدات بلا إيجار (${B.rows.filter(r=>!r.rent).length})</button>`:''}</div>
  <div class="card" style="padding:0"><div class="twrap"><table class="tbl"><thead><tr><th>الوحدة</th><th>النوع</th><th>المساحة</th><th>الإشغال</th><th>الإيجار الحالي</th><th>سعر التعادل</th><th>السعر المقترح</th><th>شهري</th><th>الفرق عن التعادل</th></tr></thead><tbody>
    ${B.rows.slice(0,300).map(r=>{ const d=r.rent-r.be; return `<tr class="clk" data-u="${r.u.id}"><td>${esc(r.u.name)}</td><td>${esc(r.u.type||'—')}</td><td>${r.u.area?num(r.u.area):'—'}</td><td>${pill(r.u.occupancy||'—')}</td><td>${r.rent?num(r.rent):'<span class="pill warn">بلا إيجار</span>'}</td><td>${num(Math.round(r.be))}</td><td><b>${num(Math.round(r.sug))}</b></td><td>${num(Math.round(r.sug/12))}</td><td>${r.rent?`<span class="pill ${d>=0?'ok':'bad'}">${d>=0?'+':''}${num(Math.round(d))}</span>`:'—'}</td></tr>`; }).join('')||'<tr><td colspan="9" class="empty">لا وحدات</td></tr>'}
  </tbody></table></div></div>`;
  const re=()=>renderBE(c);
  $('#beK',c).onchange=e=>{ st.k=e.target.value; re(); }; $('#beO',c).onchange=e=>{ st.occ=Number(e.target.value)||100; re(); }; $('#beM',c).onchange=e=>{ st.margin=Number(e.target.value)||0; re(); }; $('#beI',c).onchange=e=>{ st.inv=e.target.checked; re(); };
  c.querySelectorAll('[data-u]').forEach(r=>r.onclick=()=>assetDetail(Store.get('assets',r.dataset.u)));
  const ap=$('#beApply',c); if(ap) ap.onclick=()=>{ const L=B.rows.filter(r=>!r.rent); ask(`سيُكتب السعر المقترح (${num(Math.round(B.sugUnit))} للوحدة تقريباً) كإيجار سنوي لـ ${L.length} وحدة بلا إيجار. الوحدات المسعّرة لا تتغير.`,()=>{ L.forEach(r=>Store.update('assets',r.u.id,{rent:Math.round(r.sug)})); toast('تم اعتماد الأسعار'); re(); },'اعتماد'); };
  const occs=[100,95,90,85,80,75,70]; Charts.make('beS','bar',occs.map(o=>o+'%'),[{label:'السعر المطلوب للوحدة سنوياً',data:occs.map(o=>Math.round(breakEven(k,{...st,occ:o}).sugUnit))}],{plugins:{legend:{display:false}}});
}

/* ───── عدادات الخدمات (داخل اتفاقيات التشغيل الذاتي) ───── */
const MT_ICON={'كهرباء':'⚡','مياه':'💧','غاز':'🔥'};
const billState=b=>b.paid?'مسددة':(b.dueDate&&b.dueDate<todayStr()?'متأخرة':'غير مسددة');
const billPill=b=>{ const s=billState(b); return `<span class="pill ${s==='مسددة'?'ok':s==='متأخرة'?'bad':'warn'}">${s}</span>`; };
const billsOf=id=>Store.coll('meterBills').filter(b=>b.meterId===id).sort((x,y)=>y.period.localeCompare(x.period));
const meterAg=m=>Store.get('contracts',m.agreementId)||agreementFor(m.assetId);
const meterStats=M=>{ const ids=new Set(M.map(m=>m.id)), B=Store.coll('meterBills').filter(b=>ids.has(b.meterId)); const y=new Date(); y.setFullYear(y.getFullYear()-1); const since=y.toISOString().slice(0,7);
  const ours=new Set(M.filter(m=>m.payer!=='المستأجر').map(m=>m.id)); const unpaid=B.filter(b=>!b.paid), late=unpaid.filter(b=>billState(b)==='متأخرة');
  return {count:M.length,elec:M.filter(m=>m.type==='كهرباء').length,water:M.filter(m=>m.type==='مياه').length,cost12:sum(B.filter(b=>ours.has(b.meterId)&&b.period>=since),'amount'),unpaidN:unpaid.length,unpaidAmt:sum(unpaid,'amount'),lateN:late.length,lateAmt:sum(late,'amount')}; };
function meterCfg(after,where){ return {coll:'meters',title:'عداد',where,detail:m=>meterDetail(m,after),onSave:()=>after&&after(),
  columns:[{k:'type',label:'النوع',fmt:m=>`${MT_ICON[m.type]||''} ${esc(m.type)}`},{k:'meterNo',label:'رقم العداد',fmt:m=>`<span class="num">${esc(m.meterNo||'—')}</span>`},{k:'accountNo',label:'رقم الحساب',fmt:m=>`<span class="num">${esc(m.accountNo||'—')}</span>`},
    {k:'assetId',label:'الأصل',fmt:m=>assetName(m.assetId),plain:m=>assetPlain(m.assetId)},{k:'agreementId',label:'الاتفاقية',fmt:m=>esc(meterAg(m)?.title||'—'),plain:m=>meterAg(m)?.title||''},
    {k:'payer',label:'السداد على',fmt:m=>`<span class="pill ${m.payer==='المستأجر'?'info':'gold'}">${esc(m.payer||'نحن')}</span>`},
    {k:'last',label:'آخر فاتورة',fmt:m=>{ const b=billsOf(m.id)[0]; return b?`<span class="num">${b.period}</span> · ${num(b.amount)} ${billPill(b)}`:'—'; },plain:m=>billsOf(m.id)[0]?.period||''},
    {k:'c12',label:'التكلفة (12 شهر)',fmt:m=>num(meterStats([m]).cost12),plain:m=>meterStats([m]).cost12},
    {k:'un',label:'غير مسدد',fmt:m=>{ const st=meterStats([m]); return st.unpaidN?`<span class="pill ${st.lateN?'bad':'warn'}">${num(st.unpaidAmt)} (${st.unpaidN})</span>`:'<span class="pill ok">لا يوجد</span>'; },plain:m=>meterStats([m]).unpaidAmt}],
  filters:[{k:'type',label:'النوع',options:['كهرباء','مياه','غاز']},{k:'pay',label:'السداد',options:[{v:'unpaid',l:'عليه فواتير غير مسددة'},{v:'late',l:'عليه فواتير متأخرة'},{v:'ok',l:'مسدد بالكامل'}],get:m=>{ const st=meterStats([m]); return st.lateN?'late':st.unpaidN?'unpaid':'ok'; }},{k:'agreementId',label:'الاتفاقية',options:()=>opAgreements().filter(k=>k.type==='تشغيل ذاتي').map(k=>({v:k.id,l:k.title}))}],
  fields:[{k:'type',label:'نوع العداد',type:'select',required:true,options:['كهرباء','مياه','غاز'],default:'كهرباء'},{k:'meterNo',label:'رقم العداد',required:true},{k:'accountNo',label:'رقم الحساب / الاشتراك'},{k:'provider',label:'الجهة المزودة'},
    {k:'agreementId',label:'اتفاقية التشغيل الذاتي',type:'select',required:true,options:()=>opAgreements().filter(k=>k.type==='تشغيل ذاتي').map(k=>({v:k.id,l:k.title}))},{k:'assetId',label:'الأصل (مبنى أو وحدة)',type:'select',required:true,options:assetOpts},
    {k:'payer',label:'السداد على',type:'select',options:['نحن','المستأجر'],default:'نحن'},{k:'status',label:'الحالة',type:'select',options:['فعّال','موقوف'],default:'فعّال'},{k:'notes',label:'ملاحظات',type:'textarea',full:true}]}; }
function addBill(meterId,after){
  const M=Store.coll('meters'); const d=new Date(); d.setMonth(d.getMonth()-1,1); const per=d.toISOString().slice(0,7); const due=new Date(); due.setDate(due.getDate()+15);
  Modal.open({title:'إضافة فاتورة عداد',body:`<div class="form">
    <div class="f full"><label>العداد *</label><select id="bM">${M.map(m=>`<option value="${m.id}" ${m.id===meterId?'selected':''}>${MT_ICON[m.type]||''} ${esc(m.type)} · ${esc(m.meterNo)} · ${esc(assetPlain(m.assetId))}</option>`).join('')}</select></div>
    <div class="f"><label>فترة الفاتورة (الشهر) *</label><input id="bP" type="month" value="${per}"></div><div class="f"><label>المبلغ *</label><input id="bA" type="number"></div>
    <div class="f"><label>تاريخ الاستحقاق</label><input id="bD" type="date" value="${due.toISOString().slice(0,10)}"></div><div class="f"><label>رقم الفاتورة</label><input id="bR"></div>
    <div class="f"><label><input id="bPaid" type="checkbox" style="width:auto"> مسددة</label></div></div>`,
    footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="bS">حفظ الفاتورة</button>`});
  $('#bS').onclick=()=>{ const amt=Number($('#bA').value), per=$('#bP').value; if(!amt||!per){ toast('أدخل الفترة والمبلغ'); return; }
    const b=Store.add('meterBills',{meterId:$('#bM').value,period:per,amount:amt,dueDate:$('#bD').value,paid:false,paidDate:'',ref:$('#bR').value});
    if($('#bPaid').checked){ markBillPaid(b,todayStr(),''); } Modal.close(); toast('تمت إضافة الفاتورة'); after&&after(); };
}
function markBillPaid(b,date,ref){ Store.update('meterBills',b.id,{paid:true,paidDate:date,ref:ref||b.ref||''}); const m=Store.get('meters',b.meterId);
  if(m&&m.payer!=='المستأجر') Store.add('finance',{date,kind:'مصروف',category:`فاتورة ${m.type}`,assetId:m.assetId,amount:Number(b.amount)||0,ref:b.id,contractId:meterAg(m)?.id||''}); }
function payBill(b,after){
  const m=Store.get('meters',b.meterId);
  Modal.open({title:`سداد فاتورة ${esc(m?.type||'')} · ${b.period}`,body:`<div class="form"><div class="f"><label>تاريخ السداد</label><input id="pbD" type="date" value="${todayStr()}"></div><div class="f"><label>مرجع السداد</label><input id="pbR" placeholder="رقم عملية سداد"></div></div><p class="small muted" style="margin-top:10px">المبلغ ${num(b.amount)} ر.س. ${m?.payer==='المستأجر'?'السداد على المستأجر، فلا يُسجَّل مصروفاً علينا.':'يُسجَّل مصروفاً على اتفاقية التشغيل الذاتي.'}</p>`,
    footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="pbS">تأكيد السداد</button>`});
  $('#pbS').onclick=()=>{ markBillPaid(b,$('#pbD').value||todayStr(),$('#pbR').value); Modal.close(); toast('تم تسجيل السداد'); after&&after(); };
}
function meterDetail(m,after){
  const reopen=()=>{ after&&after(); meterDetail(Store.get('meters',m.id),after); }; const B=billsOf(m.id), st=meterStats([m]);
  Modal.open({title:`${MT_ICON[m.type]||''} عداد ${esc(m.type)} · ${esc(m.meterNo)}`,wide:true,body:`
    <dl class="dl mb"><div><dt>رقم الحساب</dt><dd class="num">${esc(m.accountNo||'—')}</dd></div><div><dt>الجهة المزودة</dt><dd>${esc(m.provider||'—')}</dd></div><div><dt>الأصل</dt><dd>${assetName(m.assetId)}</dd></div><div><dt>الاتفاقية</dt><dd>${esc(meterAg(m)?.title||'—')}</dd></div><div><dt>السداد على</dt><dd>${esc(m.payer||'نحن')}</dd></div><div><dt>الحالة</dt><dd>${pill(m.status)}</dd></div></dl>
    <div class="grid g3 mb"><div class="card kpi" style="--kc:var(--wood)"><div class="l">التكلفة (12 شهر)</div><div class="v" style="font-size:20px">${num(st.cost12)}</div></div><div class="card kpi" style="--kc:var(--amber)"><div class="l">غير مسدد</div><div class="v" style="font-size:20px">${num(st.unpaidAmt)}</div><div class="s">${st.unpaidN} فاتورة</div></div><div class="card kpi" style="--kc:var(--red)"><div class="l">متأخر</div><div class="v" style="font-size:20px">${num(st.lateAmt)}</div><div class="s">${st.lateN} فاتورة</div></div></div>
    <div class="twrap"><table class="tbl"><thead><tr><th>الفترة</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th><th>تاريخ السداد</th><th>المرجع</th><th></th></tr></thead><tbody>
    ${B.map(b=>`<tr><td class="num">${b.period}</td><td>${num(b.amount)}</td><td class="num">${b.dueDate||'—'}</td><td>${billPill(b)}</td><td class="num">${b.paidDate||'—'}</td><td>${esc(b.ref||'—')}</td><td style="white-space:nowrap">${!b.paid&&can('edit')?`<button class="btn sm p" data-pb="${b.id}">تسجيل سداد</button>`:''} ${can('delete')?`<button class="btn sm d" data-db="${b.id}">🗑</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">لا فواتير</td></tr>'}
    </tbody></table></div>`,
    footer:`<button class="btn" onclick="Modal.close()">إغلاق</button>${can('edit')?`<button class="btn" id="mtE">✎ تعديل العداد</button>`:''}${can('create')?`<button class="btn p" id="mtB">＋ فاتورة</button>`:''}`});
  const root=$('#modalRoot');
  root.querySelectorAll('[data-pb]').forEach(x=>x.onclick=()=>payBill(Store.get('meterBills',x.dataset.pb),reopen));
  root.querySelectorAll('[data-db]').forEach(x=>x.onclick=()=>ask('حذف هذه الفاتورة؟',()=>{ Store.remove('meterBills',x.dataset.db); reopen(); },'حذف'));
  const e=$('#mtE'); if(e) e.onclick=()=>crud(meterCfg(reopen),document.createElement('div')).form(m);
  const nb=$('#mtB'); if(nb) nb.onclick=()=>addBill(m.id,reopen);
}
function renderMeters(c){
  const after=()=>{ renderMeters(c); App.refreshBadges(); };
  const SK=opAgreements().filter(k=>k.type==='تشغيل ذاتي'), M=Store.coll('meters').filter(m=>SK.some(k=>k.id===meterAg(m)?.id)), st=meterStats(M);
  c.innerHTML=`<div class="grid g4 mb">
    <div class="card kpi" style="--kc:var(--green)"><div class="l">العدادات</div><div class="v">${st.count}</div><div class="s">⚡ كهرباء ${st.elec} · 💧 مياه ${st.water}</div></div>
    <div class="card kpi" style="--kc:var(--wood)"><div class="l">تكلفة العدادات علينا (12 شهر)</div><div class="v">${short(st.cost12)}</div><div class="s">${M.filter(m=>m.payer==='المستأجر').length} عداد سداده على المستأجر</div></div>
    <div class="card kpi" style="--kc:var(--amber)"><div class="l">فواتير غير مسددة</div><div class="v">${short(st.unpaidAmt)}</div><div class="s">${st.unpaidN} فاتورة</div></div>
    <div class="card kpi" style="--kc:var(--red)"><div class="l">فواتير متأخرة</div><div class="v">${short(st.lateAmt)}</div><div class="s">${st.lateN} فاتورة تجاوزت الاستحقاق</div></div></div>
    <div class="toolbar"><h3 style="color:var(--green)">حصر العدادات</h3><span class="sp"></span>${can('create')?`<button class="btn g" id="mtNewB">＋ فاتورة</button>`:''}</div><div id="mtT"></div>`;
  crud(meterCfg(after,m=>SK.some(k=>k.id===meterAg(m)?.id)),$('#mtT',c));
  const nb=$('#mtNewB',c); if(nb) nb.onclick=()=>addBill(null,after);
}

/* ───── مقاولو التشغيل والصيانة (داخل اتفاقيات التشغيل الذاتي) ───── */
const EV_CRIT=[{k:'quality',l:'جودة العمل'},{k:'response',l:'سرعة الاستجابة'},{k:'commitment',l:'الالتزام بنطاق العمل'},{k:'safety',l:'السلامة'}];
const evalScore=e=>EV_CRIT.reduce((s,c)=>s+(Number(e[c.k])||0),0)/EV_CRIT.length;
const contractorRating=id=>{ const E=Store.coll('evaluations').filter(e=>e.contractorId===id); return E.length?E.reduce((s,e)=>s+evalScore(e),0)/E.length:0; };
const stars=n=>{ const r=Math.round(n||0); return `<span class="stars">${'★'.repeat(r)}${'☆'.repeat(5-r)}</span> <span class="small num">${n?n.toFixed(1):'—'}</span>`; };
const obsState=o=>o.status==='مغلقة'?'مغلقة':(o.dueDate&&o.dueDate<todayStr()?'متأخرة':'مفتوحة');
const obsPill=o=>{ const s=obsState(o); return `<span class="pill ${s==='مغلقة'?'ok':s==='متأخرة'?'bad':'warn'}">${s}</span>`; };
const obsStats=L=>{ const closed=L.filter(o=>o.status==='مغلقة').length, overdue=L.filter(o=>obsState(o)==='متأخرة').length; return {total:L.length,closed,open:L.length-closed,overdue,rate:pct(closed,L.length)}; };
const omContracts=()=>Store.coll('contracts').filter(k=>k.type==='تشغيل وصيانة'&&agreementFor(k.assetId)?.type==='تشغيل ذاتي');
const omPaid=k=>sum(Store.coll('finance').filter(f=>f.kind==='مصروف'&&f.ref===k.id),'amount');

function renderOM(c){
  const K=omContracts(), O=Store.coll('observations').filter(o=>K.some(k=>k.id===o.contractId)), st=obsStats(O);
  const ids=[...new Set(K.map(k=>k.contractorId).filter(Boolean))]; const val=sum(K,'value'), paid=sum(K.map(k=>({p:omPaid(k)})),'p');
  const avg=ids.length?ids.reduce((s,id)=>s+contractorRating(id),0)/ids.length:0;
  const after=()=>{ renderOM(c); App.refreshBadges(); };
  c.innerHTML=`<div class="grid g3 mb">
    <div class="card kpi" style="--kc:var(--wood)"><div class="l">المقاولون</div><div class="v">${ids.length}</div><div class="s">${K.length} عقد تشغيل وصيانة</div></div>
    <div class="card kpi" style="--kc:var(--green)"><div class="l">قيمة العقود السنوية</div><div class="v">${short(val)}</div><div class="s">ندفعها للمقاولين</div></div>
    <div class="card kpi" style="--kc:var(--gold)"><div class="l">المدفوع للمقاولين</div><div class="v">${short(paid)}</div><div class="s">${pct(paid,val)}% من القيمة السنوية</div><div class="bar gold" style="margin-top:6px"><i style="width:${Math.min(100,pct(paid,val))}%"></i></div></div>
    <div class="card kpi" style="--kc:var(--sky)"><div class="l">متوسط تقييم المقاولين</div><div class="v" style="font-size:22px">${stars(avg)}</div><div class="s">${Store.coll('evaluations').filter(e=>ids.includes(e.contractorId)).length} تقييم</div></div>
    <div class="card kpi" style="--kc:var(--green)"><div class="l">الملاحظات المغلقة</div><div class="v">${st.closed} / ${st.total}</div><div class="s">نسبة الإغلاق ${st.rate}%</div><div class="bar" style="margin-top:6px"><i style="width:${st.rate}%"></i></div></div>
    <div class="card kpi" style="--kc:var(--red)"><div class="l">ملاحظات مفتوحة</div><div class="v">${st.open}</div><div class="s">${st.overdue} متأخرة عن موعد الإغلاق</div></div>
  </div>
  <div class="toolbar"><h3 style="color:var(--green)">عقود التشغيل والصيانة</h3><span class="sp"></span>${can('create')?`<button class="btn" id="omNewC">＋ مقاول</button><button class="btn" id="omNewK">＋ عقد تشغيل وصيانة</button><button class="btn" id="omNewE">★ تقييم</button><button class="btn p" id="omNewO">＋ ملاحظة</button>`:''}</div>
  <div class="grid g2 mb">${K.map(k=>{ const ct=Store.get('contractors',k.contractorId), L=O.filter(o=>o.contractId===k.id), s2=obsStats(L), p=omPaid(k), d=daysTo(k.end);
    return `<div class="card agcard self omc" data-ct="${k.contractorId||''}">
      <div class="agth"><div><b>${esc(ct?.name||k.party)}</b><div class="small muted">${esc(k.title)} · ${esc(k.number)}</div></div>${agPill(agreementFor(k.assetId))}</div>
      <div class="mk">
        <div><div class="l">التقييم</div>${stars(contractorRating(k.contractorId))}</div>
        <div><div class="l">قيمة العقد السنوية</div><b>${num(k.value)}</b></div>
        <div><div class="l">المدفوع</div><b>${num(p)}</b> <span class="small muted">${pct(p,k.value)}%</span></div>
        <div><div class="l">الملاحظات</div><b>${s2.closed} / ${s2.total}</b> <span class="small muted">مغلقة</span></div>
        <div><div class="l">مفتوحة</div><b>${s2.open}</b>${s2.overdue?` <span class="pill bad">${s2.overdue} متأخرة</span>`:''}</div>
        <div><div class="l">ينتهي خلال</div><b>${d==null?'—':d<0?'منتهي':d+' يوم'}</b></div>
      </div>
      <div class="small muted" style="margin-top:8px">إغلاق الملاحظات ${s2.rate}%</div><div class="bar" style="margin-top:4px"><i style="width:${s2.rate}%"></i></div>
      ${k.scope?`<div class="small" style="margin-top:8px"><span class="muted">نطاق العمل:</span> ${esc(k.scope)}</div>`:''}
      ${can('create')?`<div class="toolbar" style="margin:10px 0 0"><button class="btn sm" data-ev="${k.id}">★ تقييم</button><button class="btn sm" data-ob="${k.id}">＋ ملاحظة</button><button class="btn sm g" data-omp="${k.id}">تسجيل دفعة للمقاول</button></div>`:''}
    </div>`; }).join('')||'<div class="card empty">لا توجد عقود تشغيل وصيانة. أضف مقاولاً ثم عقداً مرتبطاً بأصل ضمن اتفاقية تشغيل ذاتي.</div>'}</div>
  <h3 style="color:var(--green);margin-bottom:10px">الملاحظات على المقاولين</h3><div id="omObs"></div>`;
  c.querySelectorAll('.omc').forEach(x=>x.onclick=e=>{ if(e.target.closest('button')) return; if(x.dataset.ct) contractorDetail(x.dataset.ct,after); });
  c.querySelectorAll('[data-ev]').forEach(b=>b.onclick=()=>newEvaluation(b.dataset.ev,after));
  c.querySelectorAll('[data-ob]').forEach(b=>b.onclick=()=>obsCrud(after).form({contractId:b.dataset.ob,date:todayStr(),status:'مفتوحة',severity:'متوسطة',id:null}));
  c.querySelectorAll('[data-omp]').forEach(b=>b.onclick=()=>payContractor(Store.get('contracts',b.dataset.omp),after));
  const nc=$('#omNewC',c); if(nc) nc.onclick=()=>crud(contractorCfg(after),document.createElement('div')).form(null);
  const nk=$('#omNewK',c); if(nk) nk.onclick=()=>{ const cfg=contractCfg(null,'تشغيل وصيانة'); const sv=cfg.onSave; cfg.onSave=o=>{ sv(o); after(); }; crud(cfg,document.createElement('div')).form(null); };
  const ne=$('#omNewE',c); if(ne) ne.onclick=()=>newEvaluation(null,after);
  const no=$('#omNewO',c); if(no) no.onclick=()=>obsCrud(after).form(null);
  obsCrud(after,$('#omObs',c),o=>K.some(k=>k.id===o.contractId));
}
function contractorCfg(after){ return {coll:'contractors',title:'مقاول',onSave:()=>after&&after(),
  columns:[{k:'name',label:'المقاول'},{k:'specialty',label:'التخصص'},{k:'phone',label:'الجوال'}],
  fields:[{k:'name',label:'اسم المقاول',required:true},{k:'crNo',label:'السجل التجاري'},{k:'specialty',label:'التخصص'},{k:'contact',label:'مسؤول التواصل'},{k:'phone',label:'الجوال'},{k:'email',label:'البريد',type:'email'},{k:'status',label:'الحالة',type:'select',options:['نشط','موقوف','منتهي'],default:'نشط'},{k:'notes',label:'ملاحظات',type:'textarea',full:true}]}; }
function obsCrud(after,container,where){
  const cfg={coll:'observations',title:'ملاحظة على المقاول',where,defaultSort:'date',
    columns:[{k:'date',label:'التاريخ',fmt:r=>`<span class="num">${r.date||'—'}</span>`},{k:'title',label:'الملاحظة'},{k:'contractorId',label:'المقاول',fmt:r=>esc(Store.get('contractors',r.contractorId)?.name||'—'),plain:r=>Store.get('contractors',r.contractorId)?.name||''},{k:'assetId',label:'الأصل',fmt:r=>assetName(r.assetId),plain:r=>assetPlain(r.assetId)},{k:'severity',label:'الأهمية',fmt:r=>pill(r.severity)},{k:'dueDate',label:'موعد الإغلاق',fmt:r=>`<span class="num">${r.dueDate||'—'}</span>`},{k:'state',label:'الحالة',fmt:obsPill,plain:obsState},{k:'closedDate',label:'تاريخ الإغلاق',fmt:r=>`<span class="num">${r.closedDate||'—'}</span>`}],
    filters:[{k:'state',label:'الحالة',options:['مفتوحة','متأخرة','مغلقة'],get:obsState},{k:'contractorId',label:'المقاول',options:()=>Store.coll('contractors').map(x=>({v:x.id,l:x.name}))},{k:'severity',label:'الأهمية',options:['عالية','متوسطة','منخفضة']}],
    fields:[{k:'contractId',label:'عقد التشغيل والصيانة',type:'select',required:true,options:()=>omContracts().map(k=>({v:k.id,l:`${Store.get('contractors',k.contractorId)?.name||k.party} — ${k.title}`}))},{k:'title',label:'الملاحظة',required:true,full:true},{k:'assetId',label:'الأصل',type:'select',options:assetOpts},{k:'severity',label:'الأهمية',type:'select',options:['عالية','متوسطة','منخفضة'],default:'متوسطة'},{k:'date',label:'تاريخ الرصد',type:'date',default:todayStr},{k:'dueDate',label:'موعد الإغلاق المطلوب',type:'date'},{k:'status',label:'الحالة',type:'select',options:['مفتوحة','مغلقة'],default:'مفتوحة'},{k:'closedDate',label:'تاريخ الإغلاق',type:'date'},{k:'closure',label:'ما تم لإغلاقها',type:'textarea',full:true}],
    onSave:o=>{ const k=Store.get('contracts',o.contractId); const patch={contractorId:k?.contractorId||''}; if(!o.assetId&&k) patch.assetId=k.assetId; if(o.status==='مغلقة'&&!o.closedDate) patch.closedDate=todayStr(); Store.update('observations',o.id,patch); after&&after(); },
    detail:o=>obsDetail(o,after)};
  return crud(cfg,container||document.createElement('div'));
}
function obsDetail(o,after){
  const ct=Store.get('contractors',o.contractorId);
  Modal.open({title:`ملاحظة: ${esc(o.title)}`,body:`<dl class="dl"><div><dt>المقاول</dt><dd>${esc(ct?.name||'—')}</dd></div><div><dt>العقد</dt><dd>${esc(Store.get('contracts',o.contractId)?.title||'—')}</dd></div><div><dt>الأصل</dt><dd>${assetName(o.assetId)}</dd></div><div><dt>الأهمية</dt><dd>${pill(o.severity)}</dd></div><div><dt>تاريخ الرصد</dt><dd class="num">${o.date||'—'}</dd></div><div><dt>موعد الإغلاق</dt><dd class="num">${o.dueDate||'—'}</dd></div><div><dt>الحالة</dt><dd>${obsPill(o)}</dd></div>${o.status==='مغلقة'?`<div><dt>أُغلقت في</dt><dd class="num">${o.closedDate||'—'}</dd></div><div style="grid-column:1/-1"><dt>ما تم</dt><dd>${esc(o.closure||'—')}</dd></div>`:''}</dl>
    ${o.status!=='مغلقة'&&can('edit')?`<h4 style="margin:16px 0 8px;color:var(--green)">إغلاق الملاحظة</h4><div class="form"><div class="f"><label>تاريخ الإغلاق</label><input id="obD" type="date" value="${todayStr()}"></div><div class="f full"><label>ما تم لإغلاقها *</label><textarea id="obT"></textarea></div></div>`:''}
    ${auditHtml('observations',o.id)}`,
    footer:`<button class="btn" onclick="Modal.close()">إغلاق النافذة</button>${o.status!=='مغلقة'&&can('edit')?`<button class="btn p" id="obClose">✔ إغلاق الملاحظة</button>`:''}`});
  const b=$('#obClose'); if(b) b.onclick=()=>{ const t=$('#obT').value.trim(); if(!t){ toast('اكتب ما تم لإغلاق الملاحظة'); return; } Store.update('observations',o.id,{status:'مغلقة',closedDate:$('#obD').value||todayStr(),closure:t}); Modal.close(); toast('أُغلقت الملاحظة'); after&&after(); };
}
function newEvaluation(contractId,after){
  const K=omContracts();
  Modal.open({title:'تقييم مقاول',body:`<div class="form">
    <div class="f full"><label>عقد التشغيل والصيانة *</label><select id="evK">${K.map(k=>`<option value="${k.id}" ${k.id===contractId?'selected':''}>${esc(Store.get('contractors',k.contractorId)?.name||k.party)} — ${esc(k.title)}</option>`).join('')}</select></div>
    <div class="f"><label>تاريخ التقييم</label><input id="evD" type="date" value="${todayStr()}"></div>
    ${EV_CRIT.map(c=>`<div class="f"><label>${c.l} (1-5)</label><select id="ev_${c.k}">${[5,4,3,2,1].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n} ${'★'.repeat(n)}</option>`).join('')}</select></div>`).join('')}
    <div class="f full"><label>ملاحظات التقييم</label><textarea id="evN"></textarea></div></div>`,
    footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="evS">حفظ التقييم</button>`});
  $('#evS').onclick=()=>{ const k=Store.get('contracts',$('#evK').value); if(!k){ toast('اختر العقد'); return; } const e={contractorId:k.contractorId,contractId:k.id,date:$('#evD').value,notes:$('#evN').value}; EV_CRIT.forEach(c=>e[c.k]=Number($('#ev_'+c.k).value)); Store.add('evaluations',e); Modal.close(); toast('تم حفظ التقييم'); after&&after(); };
}
function payContractor(k,after){
  const paid=omPaid(k);
  Modal.open({title:`دفعة للمقاول: ${esc(Store.get('contractors',k.contractorId)?.name||k.party)}`,body:`<div class="form"><div class="f"><label>المبلغ *</label><input id="cpA" type="number" value="${k.period==='شهري'?Math.round((k.value||0)/12):k.period==='ربع سنوي'?Math.round((k.value||0)/4):''}"></div><div class="f"><label>التاريخ *</label><input id="cpD" type="date" value="${todayStr()}"></div><div class="f full"><label>المرجع (رقم الفاتورة أو المستخلص)</label><input id="cpR"></div></div>
    <p class="small muted" style="margin-top:10px">المدفوع حتى الآن ${num(paid)} من ${num(k.value)} سنوياً. تُسجَّل الدفعة كمصروف على اتفاقية التشغيل الذاتي فتنقص من ربحها.</p>`,
    footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="cpS">حفظ الدفعة</button>`});
  $('#cpS').onclick=()=>{ const amt=Number($('#cpA').value), dt=$('#cpD').value; if(!amt||!dt){ toast('أدخل المبلغ والتاريخ'); return; } Store.add('finance',{date:dt,kind:'مصروف',category:'عقد تشغيل وصيانة',assetId:k.assetId,amount:amt,ref:k.id,contractId:agreementFor(k.assetId)?.id||'',notes:$('#cpR').value}); Modal.close(); toast('تم تسجيل الدفعة'); after&&after(); };
}
function contractorDetail(id,after){
  const ct=Store.get('contractors',id); if(!ct) return; const reopen=()=>{ after&&after(); contractorDetail(id,after); };
  const K=Store.coll('contracts').filter(k=>k.contractorId===id), E=Store.coll('evaluations').filter(e=>e.contractorId===id).sort((x,y)=>y.date.localeCompare(x.date)), O=Store.coll('observations').filter(o=>o.contractorId===id).sort((x,y)=>(y.date||'').localeCompare(x.date||'')), st=obsStats(O);
  const P=Store.coll('finance').filter(f=>f.kind==='مصروف'&&K.some(k=>k.id===f.ref)).sort((x,y)=>y.date.localeCompare(x.date));
  Modal.open({title:`المقاول: ${esc(ct.name)}`,wide:true,body:`
    <dl class="dl mb"><div><dt>التخصص</dt><dd>${esc(ct.specialty||'—')}</dd></div><div><dt>السجل التجاري</dt><dd class="num">${esc(ct.crNo||'—')}</dd></div><div><dt>مسؤول التواصل</dt><dd>${esc(ct.contact||'—')}</dd></div><div><dt>الجوال</dt><dd class="num">${esc(ct.phone||'—')}</dd></div><div><dt>الحالة</dt><dd>${pill(ct.status)}</dd></div></dl>
    <div class="grid g4 mb">
      <div class="card kpi" style="--kc:var(--sky)"><div class="l">التقييم العام</div><div class="v" style="font-size:20px">${stars(contractorRating(id))}</div><div class="s">${E.length} تقييم</div></div>
      <div class="card kpi" style="--kc:var(--green)"><div class="l">قيمة العقود السنوية</div><div class="v" style="font-size:20px">${num(sum(K,'value'))}</div><div class="s">${K.length} عقد</div></div>
      <div class="card kpi" style="--kc:var(--gold)"><div class="l">المدفوع له</div><div class="v" style="font-size:20px">${num(sum(P,'amount'))}</div></div>
      <div class="card kpi" style="--kc:var(--red)"><div class="l">الملاحظات</div><div class="v" style="font-size:20px">${st.closed} / ${st.total} مغلقة</div><div class="s">${st.open} مفتوحة · ${st.overdue} متأخرة · نسبة الإغلاق ${st.rate}%</div></div>
    </div>
    <div class="tabs"><button class="active" data-t="o">الملاحظات (${O.length})</button><button data-t="e">التقييمات (${E.length})</button><button data-t="k">العقود (${K.length})</button><button data-t="p">الدفعات (${P.length})</button></div>
    <div data-p="o"><div class="twrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>الملاحظة</th><th>الأصل</th><th>الأهمية</th><th>موعد الإغلاق</th><th>الحالة</th><th>أُغلقت في</th></tr></thead><tbody>${O.map(o=>`<tr class="clk" data-o="${o.id}"><td class="num">${o.date||'—'}</td><td>${esc(o.title)}</td><td>${assetPlain(o.assetId)}</td><td>${pill(o.severity)}</td><td class="num">${o.dueDate||'—'}</td><td>${obsPill(o)}</td><td class="num">${o.closedDate||'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">لا ملاحظات</td></tr>'}</tbody></table></div></div>
    <div data-p="e" class="hidden"><div class="twrap"><table class="tbl"><thead><tr><th>التاريخ</th>${EV_CRIT.map(c=>`<th>${c.l}</th>`).join('')}<th>النتيجة</th><th>ملاحظات</th></tr></thead><tbody>${E.map(e=>`<tr><td class="num">${e.date}</td>${EV_CRIT.map(c=>`<td>${e[c.k]}</td>`).join('')}<td>${stars(evalScore(e))}</td><td>${esc(e.notes||'')}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">لا تقييمات</td></tr>'}</tbody></table></div></div>
    <div data-p="k" class="hidden"><div class="twrap"><table class="tbl"><thead><tr><th>الرقم</th><th>العقد</th><th>الاتفاقية</th><th>المدة</th><th>القيمة السنوية</th><th>المدفوع</th></tr></thead><tbody>${K.map(k=>`<tr><td>${esc(k.number)}</td><td>${esc(k.title)}</td><td>${agPill(agreementFor(k.assetId))}</td><td class="num">${k.start||'—'} ← ${k.end||'—'}</td><td>${num(k.value)}</td><td>${num(omPaid(k))}</td></tr>`).join('')}</tbody></table></div></div>
    <div data-p="p" class="hidden"><div class="twrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>العقد</th><th>المبلغ</th><th>المرجع</th></tr></thead><tbody>${P.map(f=>`<tr><td class="num">${f.date}</td><td>${esc(Store.get('contracts',f.ref)?.number||'')}</td><td>${num(f.amount)}</td><td>${esc(f.notes||'—')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا دفعات</td></tr>'}</tbody></table></div></div>`,
    footer:`<button class="btn" onclick="Modal.close()">إغلاق</button>${can('edit')?`<button class="btn" id="ctEdit">✎ تعديل بيانات المقاول</button>`:''}${can('create')&&K[0]?`<button class="btn" id="ctEv">★ تقييم</button><button class="btn p" id="ctOb">＋ ملاحظة</button>`:''}`});
  const root=$('#modalRoot');
  root.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ root.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); root.querySelectorAll('[data-p]').forEach(p=>p.classList.toggle('hidden',p.dataset.p!==b.dataset.t)); });
  root.querySelectorAll('[data-o]').forEach(r=>r.onclick=()=>obsDetail(Store.get('observations',r.dataset.o),reopen));
  const ed=$('#ctEdit'); if(ed) ed.onclick=()=>crud(contractorCfg(reopen),document.createElement('div')).form(ct);
  const ev=$('#ctEv'); if(ev) ev.onclick=()=>newEvaluation(K[0].id,reopen);
  const ob=$('#ctOb'); if(ob) ob.onclick=()=>obsCrud(reopen).form({contractId:K[0].id,date:todayStr(),status:'مفتوحة',severity:'متوسطة',id:null});
}

/* ملف العميل: جدول الدفعات والسداد */
function payTable(list,opts={}){
  return `<div class="twrap"><table class="tbl"><thead><tr><th>#</th>${opts.showClient?'<th>العميل</th>':''}<th>تاريخ الاستحقاق</th><th>المبلغ</th><th>المسدد</th><th>المتبقي</th><th>تاريخ السداد</th><th>طريقة السداد</th><th>الحالة</th><th></th></tr></thead><tbody>
  ${list.map((p,i)=>`<tr><td>${p.seq||i+1}</td>${opts.showClient?`<td>${esc(clientName(p.clientId))}</td>`:''}<td class="num">${p.dueDate||'—'}</td><td>${num(p.amount)}</td><td>${num(p.paid||0)}</td><td><b>${num((Number(p.amount)||0)-(Number(p.paid)||0))}</b></td><td class="num">${p.paidDate||'—'}</td><td>${esc(p.method||'—')}</td><td>${payPill(p)}</td>
    <td style="white-space:nowrap">${can('edit')&&payStatus(p)!=='مسدد'?`<button class="btn sm p" data-pay="${p.id}">تسجيل سداد</button>`:''} ${can('edit')?`<button class="btn sm" data-pe="${p.id}">✎</button>`:''} ${can('delete')?`<button class="btn sm d" data-pd="${p.id}">🗑</button>`:''}</td></tr>`).join('')||`<tr><td colspan="10" class="empty">لا يوجد جدول دفعات بعد</td></tr>`}
  </tbody></table></div>`;
}
function bindPayTable(root,after){
  root.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>recordPayment(Store.get('payments',b.dataset.pay),after));
  root.querySelectorAll('[data-pe]').forEach(b=>b.onclick=()=>editPayment(Store.get('payments',b.dataset.pe),after));
  root.querySelectorAll('[data-pd]').forEach(b=>b.onclick=()=>ask('حذف هذه الدفعة من الجدول؟',()=>{ Store.remove('payments',b.dataset.pd); after(); },'حذف'));
}
function recordPayment(p,after){
  const rem=(Number(p.amount)||0)-(Number(p.paid)||0);
  Modal.open({title:`تسجيل سداد: ${esc(clientName(p.clientId))} — دفعة ${p.seq||''}`,body:`<div class="form">
    <div class="f"><label>المبلغ المسدد *</label><input id="pyAmt" type="number" value="${rem}"></div>
    <div class="f"><label>تاريخ السداد *</label><input id="pyDate" type="date" value="${todayStr()}"></div>
    <div class="f"><label>طريقة السداد</label><select id="pyM"><option>تحويل بنكي</option><option>سداد (SADAD)</option><option>نقدي</option><option>شيك</option><option>منصة إيجار</option></select></div>
    <div class="f"><label>المرجع</label><input id="pyRef" placeholder="رقم الحوالة أو الإيصال"></div></div>
    <p class="small muted" style="margin-top:10px">المتبقي من هذه الدفعة: ${num(rem)} ر.س. يُسجَّل المبلغ تلقائياً كإيراد في المالية على اتفاقية الوحدة.</p>`,
    footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="pySave">حفظ السداد</button>`});
  $('#pySave').onclick=()=>{ const amt=Number($('#pyAmt').value), dt=$('#pyDate').value; if(!amt||amt<=0||!dt){ toast('أدخل المبلغ والتاريخ'); return; }
    Store.update('payments',p.id,{paid:(Number(p.paid)||0)+amt,paidDate:dt,method:$('#pyM').value,ref:$('#pyRef').value});
    Store.add('finance',{date:dt,kind:'إيراد',category:'إيجارات',assetId:p.assetId,amount:amt,ref:p.id,contractId:agreementFor(p.assetId)?.id||''});
    Modal.close(); toast('تم تسجيل السداد'); App.refreshBadges(); after(); };
}
function editPayment(p,after,clientId){
  const isNew=!p; p=p||{clientId,assetId:Store.get('clients',clientId)?.assetId,dueDate:todayStr(),amount:'',paid:0};
  Modal.open({title:isNew?'إضافة دفعة':'تعديل دفعة',body:`<div class="form"><div class="f"><label>تاريخ الاستحقاق *</label><input id="peD" type="date" value="${p.dueDate||''}"></div><div class="f"><label>المبلغ *</label><input id="peA" type="number" value="${p.amount??''}"></div><div class="f"><label>المسدد</label><input id="peP" type="number" value="${p.paid||0}"></div><div class="f"><label>تاريخ السداد</label><input id="pePD" type="date" value="${p.paidDate||''}"></div></div>`,
    footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="peS">حفظ</button>`});
  $('#peS').onclick=()=>{ const patch={dueDate:$('#peD').value,amount:Number($('#peA').value),paid:Number($('#peP').value)||0,paidDate:$('#pePD').value}; if(!patch.dueDate||!patch.amount){ toast('أدخل التاريخ والمبلغ'); return; }
    if(isNew){ const n=paysOfClient(p.clientId).length+1; Store.add('payments',{...patch,clientId:p.clientId,assetId:p.assetId,seq:n}); } else Store.update('payments',p.id,patch);
    Modal.close(); after(); };
}
function generateSchedule(c,after){
  const unit=Store.get('assets',c.assetId); const lease=Store.coll('contracts').find(k=>k.type==='إيجار'&&(k.party===c.id||k.assetId===c.assetId));
  Modal.open({title:`إنشاء جدول دفعات: ${esc(c.name)}`,body:`<div class="form">
    <div class="f"><label>الإيجار السنوي *</label><input id="gA" type="number" value="${lease?.value||unit?.rent||''}"></div>
    <div class="f"><label>تاريخ أول دفعة *</label><input id="gS" type="date" value="${lease?.start||todayStr()}"></div>
    <div class="f"><label>دورية السداد</label><select id="gN"><option value="1">سنوي (دفعة واحدة)</option><option value="2">نصف سنوي (دفعتان)</option><option value="4">ربع سنوي (4 دفعات)</option><option value="12">شهري (12 دفعة)</option></select></div>
    <div class="f"><label>عدد السنوات</label><input id="gY" type="number" value="1" min="1" max="10"></div></div>
    <p class="small muted" style="margin-top:10px">${paysOfClient(c.id).length?'تُضاف الدفعات الجديدة بعد الدفعات الموجودة.':''}</p>`,
    footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="gGo">إنشاء الجدول</button>`});
  $('#gGo').onclick=()=>{ const annual=Number($('#gA').value), start=$('#gS').value, n=Number($('#gN').value), years=Math.max(1,Number($('#gY').value)||1); if(!annual||!start){ toast('أدخل الإيجار وتاريخ البداية'); return; }
    let seq=paysOfClient(c.id).length; for(let y=0;y<years;y++) for(let i=0;i<n;i++){ const dt=new Date(start); dt.setMonth(dt.getMonth()+y*12+i*(12/n)); Store.add('payments',{clientId:c.id,assetId:c.assetId,contractId:lease?.id||'',seq:++seq,dueDate:dt.toISOString().slice(0,10),amount:Math.round(annual/n),paid:0,paidDate:'',method:''}); }
    Modal.close(); toast(`تم إنشاء ${years*n} دفعة`); after(); };
}
function clientDetail(c){
  if(!c) return; const reopen=()=>{ App.render(); clientDetail(Store.get('clients',c.id)); };
  const L=paysOfClient(c.id), f=finOf(L);
  Modal.open({title:`ملف العميل: ${esc(c.name)}`,wide:true,body:`
    <dl class="dl" style="margin-bottom:14px"><div><dt>الرقم</dt><dd>${esc(c.id)}</dd></div><div><dt>الجوال</dt><dd class="num">${esc(c.phone||'—')}</dd></div><div><dt>الهوية</dt><dd>${esc(c.idNo||'—')}</dd></div><div><dt>الوحدة</dt><dd>${assetName(c.assetId)}</dd></div><div><dt>الاتفاقية</dt><dd>${agPill(agreementFor(c.assetId))}</dd></div><div><dt>الحالة</dt><dd>${pill(c.status)}</dd></div></dl>
    <div class="grid g4 mb">
      <div class="card kpi" style="--kc:var(--green)"><div class="l">إجمالي الدفعات</div><div class="v" style="font-size:20px">${num(f.total)}</div><div class="s">${f.count} دفعة</div></div>
      <div class="card kpi" style="--kc:var(--gold)"><div class="l">المسدد</div><div class="v" style="font-size:20px">${num(f.paid)}</div><div class="bar gold" style="margin-top:6px"><i style="width:${f.pct}%"></i></div><div class="s">${f.pct}% من الإجمالي</div></div>
      <div class="card kpi" style="--kc:var(--sky)"><div class="l">المتبقي</div><div class="v" style="font-size:20px">${num(f.remaining)}</div><div class="s">${f.next?`القادمة ${f.next.dueDate}`:'لا دفعات قادمة'}</div></div>
      <div class="card kpi" style="--kc:var(--red)"><div class="l">المتأخر</div><div class="v" style="font-size:20px">${num(f.overdue)}</div><div class="s">${L.filter(p=>payStatus(p)==='متأخر').length} دفعة متأخرة</div></div>
    </div>
    <div class="toolbar"><h3 style="color:var(--green)">جدول الدفعات</h3><span class="sp"></span>${can('create')?`<button class="btn" id="cAdd">＋ دفعة</button><button class="btn g" id="cGen">إنشاء جدول دفعات</button>`:''}</div>
    ${payTable(L)}`,
    footer:`<button class="btn" onclick="Modal.close()">إغلاق</button>`});
  const root=$('#modalRoot'); bindPayTable(root,reopen);
  const g=$('#cGen'); if(g) g.onclick=()=>generateSchedule(c,reopen);
  const ad=$('#cAdd'); if(ad) ad.onclick=()=>editPayment(null,reopen,c.id);
}

/* التشغيل الذاتي: إشغال، تحصيل، ملفات عملاء */
M.operations={key:'operations',label:'التشغيل الذاتي',icon:'🏠',group:'نماذج التشغيل',render(v){
  const SK=opAgreements().filter(k=>k.type==='تشغيل ذاتي');
  const units=Store.coll('assets').filter(a=>a.level==='unit'); const occ=units.filter(u=>u.occupancy==='مشغول');
  const allF=finOf(Store.coll('payments')); const due=allF.overdue; const rentTotal=sum(occ,'rent');
  const bld=Store.coll('assets').filter(a=>a.level==='building');
  v.innerHTML=`<div class="pagehead self"><div><h3>🏠 التشغيل الذاتي <span class="en">Self-Operation</span></h3><p class="small muted">ندفع للهيئة الملكية ونتولى التأجير والتحصيل والتشغيل بأنفسنا.</p></div><span class="pill gold">${SK.length} اتفاقية</span></div><div class="grid g4 mb">
    <div class="card kpi"><div class="l">الإشغال</div><div class="v">${pct(occ.length,units.length)}%</div><div class="s">${occ.length}/${units.length} وحدة</div></div>
    <div class="card kpi" style="--kc:var(--gold)"><div class="l">المحصّل من جداول الدفعات</div><div class="v">${short(allF.paid)}</div><div class="s">من ${short(allF.total)} · متبقي ${short(allF.remaining)}</div><div class="bar gold" style="margin-top:6px"><i style="width:${allF.pct}%"></i></div></div>
    <div class="card kpi" style="--kc:var(--red)"><div class="l">مستحقات متأخرة (تحصيل)</div><div class="v">${short(due)}</div><div class="s">${Store.coll('clients').filter(c=>clientFin(c).overdue>0).length} عميل</div></div>
    <div class="card kpi" style="--kc:var(--sky)"><div class="l">المباني</div><div class="v">${bld.length}</div></div></div>
  <div class="tabs"><button class="active" data-t="sag">اتفاقيات التشغيل الذاتي</button><button data-t="om">مقاولو التشغيل والصيانة</button><button data-t="mt">العدادات</button><button data-t="be">سعر التعادل للتأجير</button><button data-t="occ">الإشغال والتأجير</button><button data-t="cl">ملفات العملاء</button><button data-t="bld">حالة المباني</button></div>
  <div data-p="sag"><div class="grid g2 mb">${SK.map(agCard).join('')||'<div class="card empty">لا توجد اتفاقيات تشغيل ذاتي</div>'}</div><div id="sagMg"></div></div><div data-p="om" class="hidden"></div><div data-p="mt" class="hidden"></div><div data-p="be" class="hidden"></div><div data-p="occ" class="hidden"></div><div data-p="cl" class="hidden"></div><div data-p="bld" class="hidden">
    <div class="grid g3">${bld.map(b=>{ const u=units.filter(x=>x.parentId===b.id); const o=u.filter(x=>x.occupancy==='مشغول').length; return `<div class="card"><h3>${esc(b.name)} ${pill(b.condition)}</h3><div class="small muted">${esc(assetPlain(b.parentId))} · ${agPlain(agreementFor(b.id))}</div><div style="margin:8px 0">الإشغال ${o}/${u.length}</div><div class="bar"><i style="width:${pct(o,u.length)}%"></i></div><div class="small" style="margin-top:8px">القيمة ${short(b.value)}</div></div>`; }).join('')}</div></div>`;
  v.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); v.querySelectorAll('[data-p]').forEach(p=>p.classList.toggle('hidden',p.dataset.p!==b.dataset.t)); });
  renderOM(v.querySelector('[data-p=om]')); renderMeters(v.querySelector('[data-p=mt]')); renderBE(v.querySelector('[data-p=be]'));
  bindAgCards(v); crud(contractCfg(k=>k.type==='تشغيل ذاتي','تشغيل ذاتي'),$('#sagMg',v));
  crud(Object.assign(assetCrudCfg(a=>a.level==='unit'),{title:'وحدة',columns:[{k:'code',label:'الرمز'},{k:'name',label:'الوحدة'},{k:'parentId',label:'المبنى',fmt:r=>assetPlain(r.parentId),plain:r=>assetPlain(r.parentId)},{k:'type',label:'النموذج'},{k:'occupancy',label:'الإشغال',fmt:r=>pill(r.occupancy)},{k:'tenantId',label:'المستأجر',fmt:r=>esc(clientName(r.tenantId)),plain:r=>clientName(r.tenantId)},{k:'rent',label:'الإيجار السنوي',fmt:r=>money(r.rent)},{k:'pTotal',label:'قيمة الدفعات',fmt:r=>{const f=finOf(paysOfAsset(r.id));return f.count?num(f.total):'—';},plain:r=>finOf(paysOfAsset(r.id)).total},{k:'pPaid',label:'المسدد',fmt:r=>{const f=finOf(paysOfAsset(r.id));return f.count?num(f.paid):'—';},plain:r=>finOf(paysOfAsset(r.id)).paid},{k:'pRem',label:'المتبقي',fmt:r=>{const f=finOf(paysOfAsset(r.id));return f.count?`<b>${num(f.remaining)}</b>`:'—';},plain:r=>finOf(paysOfAsset(r.id)).remaining},{k:'pOver',label:'المتأخر',fmt:r=>{const f=finOf(paysOfAsset(r.id));return f.overdue?`<span class="pill bad">${num(f.overdue)}</span>`:(f.count?'<span class="pill ok">لا يوجد</span>':'—');},plain:r=>finOf(paysOfAsset(r.id)).overdue},{k:'pBar',label:'نسبة السداد',fmt:r=>finBar(finOf(paysOfAsset(r.id))),plain:r=>finOf(paysOfAsset(r.id)).pct},{k:'agreement',label:'الاتفاقية',fmt:r=>agPill(agreementFor(r.id)),plain:r=>agPlain(agreementFor(r.id))}],filters:[{k:'occupancy',label:'الإشغال',options:['مشغول','شاغر']},{k:'parentId',label:'المبنى',options:()=>bld.map(b=>({v:b.id,l:b.name}))}]}),v.querySelector('[data-p=occ]'));
  crud({coll:'clients',title:'ملف عميل',detail:clientDetail,
    columns:[{k:'id',label:'الرقم'},{k:'name',label:'الاسم'},{k:'phone',label:'الجوال',fmt:r=>`<span class="num">${esc(r.phone||'—')}</span>`},{k:'assetId',label:'الوحدة',fmt:r=>assetName(r.assetId),plain:r=>assetPlain(r.assetId)},
      {k:'fTotal',label:'إجمالي الدفعات',fmt:r=>num(clientFin(r).total),plain:r=>clientFin(r).total},{k:'fPaid',label:'المسدد',fmt:r=>num(clientFin(r).paid),plain:r=>clientFin(r).paid},{k:'fRem',label:'المتبقي',fmt:r=>`<b>${num(clientFin(r).remaining)}</b>`,plain:r=>clientFin(r).remaining},
      {k:'fOver',label:'المتأخر',fmt:r=>{const f=clientFin(r);return f.overdue?`<span class="pill bad">${num(f.overdue)}</span>`:'<span class="pill ok">لا يوجد</span>';},plain:r=>clientFin(r).overdue},
      {k:'fNext',label:'الدفعة القادمة',fmt:r=>{const n=clientFin(r).next;return n?`<span class="num">${n.dueDate}</span> · ${num((Number(n.amount)||0)-(Number(n.paid)||0))}`:'—';},plain:r=>clientFin(r).next?.dueDate||''},
      {k:'fBar',label:'نسبة السداد',fmt:r=>finBar(clientFin(r)),plain:r=>clientFin(r).pct},{k:'status',label:'الحالة',fmt:r=>pill(r.status)}],
    filters:[{k:'fState',label:'السداد',options:[{v:'over',l:'عليه متأخرات'},{v:'ok',l:'منتظم'}],get:r=>clientFin(r).overdue>0?'over':'ok'}],
    fields:[{k:'name',label:'الاسم',required:true},{k:'idNo',label:'رقم الهوية'},{k:'phone',label:'الجوال'},{k:'email',label:'البريد',type:'email'},{k:'kind',label:'النوع',type:'select',options:['مستأجر','مالك','مستثمر','جهة حكومية'],default:'مستأجر'},{k:'assetId',label:'الوحدة',type:'select',options:assetOpts},{k:'status',label:'الحالة',type:'select',options:['نشط','منتهي','متعثر'],default:'نشط'},{k:'notes',label:'ملاحظات',type:'textarea',full:true}]},v.querySelector('[data-p=cl]'));
}};

/* 8. المستخدمون والصلاحيات + الموافقات + سجل العمليات */
M.users={key:'users',label:'المستخدمون والصلاحيات',icon:'👥',group:'الأساسي',render(v){
  v.innerHTML=`<div class="tabs"><button class="active" data-t="us">المستخدمون والأدوار</button><button data-t="lg">سجل العمليات (Audit)</button></div><div data-p="us"></div><div data-p="lg" class="hidden"></div>`;
  v.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); v.querySelectorAll('[data-p]').forEach(p=>p.classList.toggle('hidden',p.dataset.p!==b.dataset.t)); });
  crud({coll:'users',title:'مستخدم',readonly:!can('users'),
    columns:[{k:'name',label:'الاسم'},{k:'role',label:'الدور',fmt:r=>pill(ROLES[r.role]||r.role),plain:r=>ROLES[r.role]},{k:'email',label:'البريد'},{k:'perms',label:'الصلاحيات',fmt:r=>(PERM[r.role]||[]).map(p=>({create:'إنشاء',edit:'تعديل',delete:'حذف',users:'إدارة المستخدمين',export:'تصدير'}[p])).join('، '),plain:r=>''}],
    fields:[{k:'name',label:'الاسم',required:true},{k:'role',label:'الدور',type:'select',required:true,options:Object.entries(ROLES).map(([v,l])=>({v,l}))},{k:'email',label:'البريد',type:'email'},{k:'phone',label:'الجوال'}]},v.querySelector('[data-p=us]'));
  crud({coll:'audit',title:'عملية',readonly:true,defaultSort:'at',
    columns:[{k:'at',label:'الوقت',fmt:r=>`<span class="num">${r.at}</span>`},{k:'by',label:'المستخدم',fmt:r=>esc(userName(r.by)),plain:r=>userName(r.by)},{k:'action',label:'العملية',fmt:r=>pill(r.action)},{k:'coll',label:'القسم'},{k:'refId',label:'السجل'},{k:'changes',label:'التغييرات'}],
    filters:[{k:'action',label:'العملية',options:['إضافة','تعديل','حذف']},{k:'coll',label:'القسم',options:()=>[...new Set(Store.coll('audit').map(a=>a.coll))]}],fields:[]},v.querySelector('[data-p=lg]'));
  // اجعل الترتيب الافتراضي تنازلياً للسجل
}};

/* 9. التقارير والتحليلات — مبنية على نوعي الاتفاقيات */
const RepView={grp:'self',cur:{self:'selfProfit',inv:'invProfit',gen:'compare'},type:'',ag:''};
M.reports={key:'reports',label:'التقارير والتحليلات',icon:'📈',group:'الأساسي',render(v){
  const st=RepView;
  const GRP={self:{l:'التشغيل الذاتي',en:'Self-Operation',i:'🏠',t:'تشغيل ذاتي'},inv:{l:'إسناد التشغيل لمستثمر',en:'Investor-Operated',i:'🤝',t:'مستثمر'},gen:{l:'عام ومقارنات',en:'',i:'📋',t:''}};
  const scopeType=()=>GRP[st.grp].t||st.type;
  const ks=()=>opAgreements().filter(k=>(!scopeType()||k.type===scopeType())&&(!st.ag||k.id===st.ag));
  const unfiltered=()=>st.grp==='gen'&&!st.type&&!st.ag;
  const inScope=id=>{ if(unfiltered()) return true; const k=agreementFor(id); return !!k&&ks().some(x=>x.id===k.id); };
  const agOf=id=>agPlain(agreementFor(id));
  const P=(n,d)=>`${pct(n,d)}%`;
  const payOf=k=>k.payToAuthority===''||k.payToAuthority==null?'غير محدد':Number(k.payToAuthority);
  const F=Store.coll('finance'); const months=[...new Set(F.map(f=>f.date.slice(0,7)))].sort().slice(-12);
  const kIdOf=f=>f.contractId||agreementFor(f.assetId)?.id;

  const REPORTS={
    /* ───── التشغيل الذاتي ───── */
    selfProfit:{g:'self',l:'ربح التشغيل الذاتي',cols:['الاتفاقية','الأصل','الوحدات','الإشغال','الدخل','التكاليف','ندفع للهيئة','ربحنا','الهامش'],
      rows:()=>ks().map(k=>{ const p=agreementPL(k), o=agreementOps(k); return [k.title,assetPlain(k.assetId),o.units,o.units?`${o.occPct}%`:'—',p.rev,p.exp,payOf(k),p.profit,`${p.margin}%`]; }),
      chart:{type:'bar',li:0,vi:7,label:'ربحنا'},
      insight:r=>{ const t=r.reduce((s,x)=>s+(Number(x[7])||0),0), rv=r.reduce((s,x)=>s+(Number(x[4])||0),0); const best=r.slice().sort((a,b)=>b[7]-a[7])[0]; return r.length?`التشغيل الذاتي حقق ربحاً صافياً ${short(t)} بعد سداد الهيئة، بهامش ${pct(t,rv)}% من الدخل. الأعلى ربحاً: ${best[0]}.`:''; }},
    selfOcc:{g:'self',l:'الإشغال والإيجارات',cols:['المبنى','الاتفاقية','الوحدات','مشغول','شاغر','الإشغال','الإيجار التعاقدي'],
      rows:()=>Store.coll('assets').filter(b=>b.level==='building'&&inScope(b.id)).map(b=>{ const u=Store.coll('assets').filter(x=>x.parentId===b.id&&x.level==='unit'); const o=u.filter(x=>x.occupancy==='مشغول'); return [b.name,agOf(b.id),u.length,o.length,u.length-o.length,`${pct(o.length,u.length)}%`,sum(o,'rent')]; }).filter(r=>r[2]),
      chart:{type:'bar',li:0,vi:3,label:'وحدات مشغولة'},
      insight:r=>{ const u=r.reduce((s,x)=>s+x[2],0), o=r.reduce((s,x)=>s+x[3],0); return r.length?`${o} وحدة مشغولة من ${u} (${pct(o,u)}%). ${u-o} وحدة شاغرة تمثل فرصة دخل غير مستغلة.`:''; }},
    selfCost:{g:'self',l:'التكاليف حسب التصنيف',cols:['التصنيف','عدد الحركات','الإجمالي','النسبة من التكاليف'],
      rows:()=>{ const ids=new Set(ks().map(k=>k.id)); const m={}; F.filter(f=>f.kind==='مصروف'&&ids.has(kIdOf(f))).forEach(f=>{ m[f.category]=m[f.category]||[0,0]; m[f.category][0]++; m[f.category][1]+=Number(f.amount)||0; }); const tot=Object.values(m).reduce((s,x)=>s+x[1],0); return Object.entries(m).map(([c,[n,t]])=>[c,n,t,P(t,tot)]).sort((a,b)=>b[2]-a[2]); },
      chart:{type:'doughnut',li:0,vi:2},
      insight:r=>r.length?`أكبر بند تكلفة: ${r[0][0]} بنسبة ${r[0][3]} من تكاليف التشغيل الذاتي.`:''},
    selfArrears:{g:'self',l:'متأخرات العملاء',cols:['العميل','الوحدة','الاتفاقية','الجوال','المتأخر','إجمالي المتبقي','الحالة'],
      rows:()=>Store.coll('clients').filter(c=>clientFin(c).overdue>0&&inScope(c.assetId)).map(c=>{ const f=clientFin(c); return [c.name,assetPlain(c.assetId),agOf(c.assetId),c.phone||'—',f.overdue,f.remaining,c.status]; }).sort((a,b)=>b[4]-a[4]),
      chart:{type:'bar',li:0,vi:4,label:'المتأخرات'},
      insight:r=>r.length?`${r.length} عميل متأخر بإجمالي ${short(r.reduce((s,x)=>s+x[4],0))}.`:'لا توجد متأخرات على العملاء.'},

    /* ───── إسناد التشغيل لمستثمر ───── */
    invProfit:{g:'inv',l:'ربح الإسناد حسب المستثمر',cols:['المستثمر','الاتفاقية','الأصل','يدفع لنا','المحصّل','نسبة التحصيل','ندفع للهيئة','ربحنا','الهامش'],
      rows:()=>ks().map(k=>{ const p=agreementPL(k); return [k.party,k.title,assetPlain(k.assetId),p.due,p.rev,P(p.rev,p.due),payOf(k),p.profit,`${p.margin}%`]; }),
      chart:{type:'bar',li:0,vi:7,label:'ربحنا'},
      insight:r=>{ const t=r.reduce((s,x)=>s+(Number(x[7])||0),0), d=r.reduce((s,x)=>s+x[3],0); return r.length?`عقود الإسناد تحقق ربحاً ${short(t)} سنوياً، أي ${pct(t,d)}% مما يدفعه المستثمرون، دون أي تكاليف تشغيل علينا.`:''; }},
    invCollect:{g:'inv',l:'التحصيل الشهري من المستثمرين',
      get cols(){ return ['الشهر',...ks().map(k=>k.party),'المحصّل','المتوقع','الفرق']; },
      rows:()=>{ const K=ks(); const exp=K.reduce((s,k)=>s+(Number(k.payFromInvestor)||0)/12,0); return months.map(mo=>{ const per=K.map(k=>sum(F.filter(f=>f.kind==='إيراد'&&kIdOf(f)===k.id&&f.date.startsWith(mo)),'amount')); const t=per.reduce((s,x)=>s+x,0); return [mo,...per,t,Math.round(exp),Math.round(t-exp)]; }); },
      chartFn:(rows,cols)=>Charts.make('rc','bar',rows.map(r=>r[0]),[{label:'المحصّل',data:rows.map(r=>r[cols.length-3])},{label:'المتوقع',data:rows.map(r=>r[cols.length-2]),color:COLORS[1]}]),
      insight:r=>{ const late=r.filter(x=>x[x.length-1]<0).length; return r.length?(late?`${late} شهر حصل فيه نقص عن المتوقع من المستثمرين.`:'التحصيل من المستثمرين مطابق للمتوقع في كل الأشهر.'):''; }},
    invRenew:{g:'inv',l:'انتهاء العقود والتجديد',cols:['المستثمر','رقم العقد','الأصل','البداية','النهاية','متبقي (يوم)','التجديد','نطاق العمل'],
      rows:()=>ks().map(k=>[k.party,k.number,assetPlain(k.assetId),k.start||'—',k.end||'—',daysTo(k.end)??'—',k.renewal||'—',k.scope||'—']).sort((a,b)=>(Number(a[5])||0)-(Number(b[5])||0)),
      insight:r=>{ const s=r.filter(x=>Number(x[5])<=90); return s.length?`${s.length} عقد ينتهي خلال 90 يوماً: ${s.map(x=>x[0]).join('، ')}. ابدأ قرار التجديد أو إعادة الطرح الآن.`:'لا عقود تنتهي خلال 90 يوماً.'; }},
    invCond:{g:'inv',l:'حالة الأصول المسندة',cols:['المستثمر','الأصول','الوحدات','ممتاز/جيد','مقبول','يحتاج صيانة','القيمة'],
      rows:()=>ks().map(k=>{ const L=[Store.get('assets',k.assetId),...descendants(k.assetId)].filter(x=>x&&agreementFor(x.id)?.id===k.id); return [k.party,L.length,L.filter(x=>x.level==='unit').length,L.filter(x=>['ممتاز','جيد'].includes(x.condition)).length,L.filter(x=>x.condition==='مقبول').length,L.filter(x=>x.condition==='يحتاج صيانة').length,Number(Store.get('assets',k.assetId)?.value)||0]; }),
      chart:{type:'bar',li:0,vi:5,label:'يحتاج صيانة'},
      insight:r=>{ const n=r.reduce((s,x)=>s+x[5],0); return n?`${n} أصل مسند يحتاج صيانة. الصيانة من مسؤولية المستثمر، فطالبه بها حسب نطاق العمل.`:'كل الأصول المسندة بحالة مقبولة أو أفضل.'; }},

    /* ───── عام ───── */
    compare:{g:'gen',l:'مقارنة نوعي الاتفاقيات',cols:['النوع','الاتفاقيات','الأصول','الوحدات','قيمة الأصول','الدخل','تكاليف التشغيل','ندفع للهيئة','ربحنا','الهامش'],
      rows:()=>['تشغيل ذاتي','مستثمر'].map(t=>{ const K=opAgreements().filter(k=>k.type===t); const L=K.map(k=>({...agreementPL(k),...agreementOps(k)})); const inc=t==='مستثمر'?sum(L,'due'):sum(L,'rev'); return [AG_LABEL[t],K.length,sum(L,'assets'),sum(L,'units'),sum(L,'value'),inc,t==='مستثمر'?'على المستثمر':sum(L,'exp'),sum(L,'pay'),sum(L,'profit'),`${pct(sum(L,'profit'),inc)}%`]; }),
      chart:{type:'bar',li:0,vi:8,label:'ربحنا'},
      insight:r=>{ if(r.length<2) return ''; const [a,b]=r; return `التشغيل الذاتي: ربح ${short(a[8])} بهامش ${a[9]}. إسناد التشغيل لمستثمر: ربح ${short(b[8])} بهامش ${b[9]} وبدون تكاليف تشغيل علينا.`; }},
    authority:{g:'gen',l:'الالتزامات للهيئة الملكية',cols:['الاتفاقية','النوع','الرقم','الدورية','المبلغ','النسبة من الإجمالي','تنتهي'],
      rows:()=>{ const K=ks(); const tot=K.reduce((s,k)=>s+(Number(k.payToAuthority)||0),0); return K.map(k=>[k.title,AG_LABEL[k.type],k.number,k.period||'—',payOf(k),P(Number(k.payToAuthority)||0,tot),k.end||'—']); },
      chart:{type:'doughnut',li:0,vi:4},
      insight:r=>{ const tot=r.reduce((s,x)=>s+(Number(x[4])||0),0), miss=r.filter(x=>x[4]==='غير محدد').length; return `إجمالي ما ندفعه للهيئة ${short(tot)}${miss?`، و${miss} اتفاقية بدون مبلغ محدد يجب استكمالها`:''}.`; }},
    cond:{g:'gen',l:'حالة الأصول حسب الاتفاقية',cols:['الحالة الفنية','التشغيل الذاتي','إسناد التشغيل لمستثمر','غير مرتبط','الإجمالي'],
      rows:()=>['ممتاز','جيد','مقبول','يحتاج صيانة'].map(c=>{ const L=Store.coll('assets').filter(a=>a.condition===c&&inScope(a.id)); const t=x=>L.filter(a=>(agreementFor(a.id)?.type||'none')===x).length; return [c,t('تشغيل ذاتي'),t('مستثمر'),t('none'),L.length]; }),
      chart:{type:'doughnut',li:0,vi:4},
      insight:r=>{ const n=r.find(x=>x[0]==='يحتاج صيانة'); return n&&n[4]?`${n[4]} أصل يحتاج صيانة: ${n[1]} في التشغيل الذاتي (علينا) و${n[2]} في الإسناد (على المستثمر).`:'لا توجد أصول تحتاج صيانة.'; }},
    contracts:{g:'gen',l:'العقود والانتهاءات',cols:['الرقم','النوع','الطرف','الأصل','الاتفاقية التشغيلية','النهاية','متبقي (يوم)','القيمة','الحالة'],
      rows:()=>Store.coll('contracts').filter(k=>!k.assetId||inScope(k.assetId)).map(k=>[k.number,OP_TYPES.includes(k.type)?AG_LABEL[k.type]:k.type,k.party?.startsWith('C-')?clientName(k.party):k.party,assetPlain(k.assetId),agOf(k.assetId),k.end||'—',daysTo(k.end)??'—',Number(k.value)||0,k.status]).sort((a,b)=>(Number(a[6])||0)-(Number(b[6])||0)),
      insight:r=>{ const s=r.filter(x=>Number(x[6])>=0&&Number(x[6])<=90); return s.length?`${s.length} عقد ينتهي خلال 90 يوماً.`:'لا عقود تنتهي خلال 90 يوماً.'; }},
  };

  const draw=()=>{ const cur=st.cur[st.grp]; const R=REPORTS[cur]; const rows=R.rows(); const cols=R.cols; Charts.destroy();
    const scopeLbl=st.ag?esc(Store.get('contracts',st.ag)?.title||''):scopeType()?`كل اتفاقيات ${AG_LABEL[scopeType()]}`:'كل الأصول';
    const ins=R.insight?R.insight(rows):'';
    $('#rep',v).innerHTML=`<div class="toolbar"><h3 style="color:var(--green)">${R.l}</h3><span class="pill">${scopeLbl}</span><span class="sp"></span><button class="btn ${IN_FRAME?'hidden':''}" id="rcsv">⬇ Excel/CSV</button>${IN_FRAME?'':'<button class="btn" onclick="window.print()">🖨 PDF / طباعة</button>'}</div>
      ${ins?`<div class="alert info mb"><div><b>الخلاصة</b><span style="font-size:13.5px;color:var(--text)">${esc(ins)}</span></div></div>`:''}
      ${(R.chart||R.chartFn)&&rows.length?`<div class="card mb"><div class="chart"><canvas id="rc"></canvas></div></div>`:''}
      <div class="card" style="padding:0"><div class="twrap"><table class="tbl"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${typeof c==='number'?num(c):c==='غير محدد'?'<span class="pill warn">غير محدد</span>':esc(c)}</td>`).join('')}</tr>`).join('')||`<tr><td class="empty" colspan="${cols.length}">لا بيانات ضمن هذا النطاق</td></tr>`}</tbody></table></div></div>`;
    if(rows.length){ if(R.chartFn) R.chartFn(rows,cols); else if(R.chart) Charts.make('rc',R.chart.type,rows.map(r=>r[R.chart.li]),[{label:R.chart.label||'',data:rows.map(r=>Number(r[R.chart.vi])||0)}],R.chart.type==='bar'&&rows.length>4?{indexAxis:'y'}:{}); }
    $('#rcsv',v).onclick=()=>{ const lines=[cols.join(',')]; rows.forEach(r=>lines.push(r.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(','))); dl(new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),`${cur}-${todayStr()}.csv`); };
  };
  const paint=()=>{ const g=st.grp, list=Object.entries(REPORTS).filter(([,r])=>r.g===g); const agList=opAgreements().filter(k=>!scopeType()||k.type===scopeType());
    v.innerHTML=`<div class="grid g3 mb">${Object.entries(GRP).map(([k,x])=>{ const K=x.t?opAgreements().filter(a=>a.type===x.t):opAgreements(); return `<div class="card kpi agc ${g===k?'sel':''}" data-g="${k}" style="--kc:${k==='self'?'var(--wood)':k==='inv'?'var(--sky)':'var(--green)'}"><div class="l">${x.i} تقارير</div><div class="v" style="font-size:20px">${x.l}${x.en?` <span class="en">${x.en}</span>`:''}</div><div class="s">${x.t?`${K.length} اتفاقية · ربح ${short(sum(K.map(agreementPL),'profit'))}`:'مقارنة النوعين والالتزامات والعقود'}</div></div>`; }).join('')}</div>
      <div class="toolbar">
        ${g==='gen'?`<select id="fType" style="width:auto"><option value="">كل الأنواع</option><option value="تشغيل ذاتي" ${st.type==='تشغيل ذاتي'?'selected':''}>التشغيل الذاتي</option><option value="مستثمر" ${st.type==='مستثمر'?'selected':''}>إسناد التشغيل لمستثمر</option></select>`:''}
        <select id="fAg" style="width:auto"><option value="">كل الاتفاقيات</option>${agList.map(k=>`<option value="${k.id}" ${st.ag===k.id?'selected':''}>${esc(k.type==='مستثمر'?k.party+' — '+k.title:k.title)}</option>`).join('')}</select>
      </div>
      <div class="toolbar">${list.map(([k,r])=>`<button class="btn ${k===st.cur[g]?'p':''}" data-r="${k}">${r.l}</button>`).join('')}</div><div id="rep"></div>`;
    v.querySelectorAll('[data-g]').forEach(c=>c.onclick=()=>{ st.grp=c.dataset.g; st.ag=''; paint(); });
    const ft=$('#fType',v); if(ft) ft.onchange=()=>{ st.type=ft.value; st.ag=''; paint(); };
    $('#fAg',v).onchange=e=>{ st.ag=e.target.value; draw(); };
    v.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{ st.cur[g]=b.dataset.r; v.querySelectorAll('[data-r]').forEach(x=>x.classList.toggle('p',x.dataset.r===st.cur[g])); draw(); });
    draw();
  };
  paint();
}};

/* 11. الخرائط GIS */
M.gis={key:'gis',label:'الخرائط GIS',icon:'🗺️',group:'متقدم',render(v){
  const maps=Store.coll('maps'); let curMap=maps[0]?.id||null; let placing=null;
  const draw=()=>{ const mp=Store.get('maps',curMap); const pins=Store.coll('assets').filter(a=>a.x!=null&&a.y!=null&&(!mp||!a.mapId||a.mapId===mp.id));
    v.innerHTML=`<div class="toolbar"><select id="mapSel">${maps.map(m=>`<option value="${m.id}" ${m.id===curMap?'selected':''}>${esc(m.name)}</option>`).join('')}${maps.length?'':'<option>لا توجد خرائط</option>'}</select>
      ${can('edit')?`<label class="btn">📤 رفع خريطة/مخطط<input type="file" accept="image/*" id="mapUp" class="hidden"></label>`:''}
      <select id="placeSel"><option value="">— اختر أصلاً لتحديد موقعه —</option>${Store.coll('assets').filter(a=>a.level!=='equipment').map(a=>`<option value="${a.id}">${LEVELS[a.level]}: ${esc(a.name)}</option>`).join('')}</select>
      <span class="small muted" id="hint">${placing?'انقر على الخريطة لتثبيت الموقع':'اختر أصلاً ثم انقر على الخريطة'}</span><span class="sp"></span>${mp&&can('delete')?`<button class="btn d sm" id="mapDel">حذف الخريطة</button>`:''}</div>
      <div class="card" style="padding:8px"><div class="map" id="map">${mp?`<img src="${mp.src}" alt="">`:`<div class="ph"><div><div style="font-size:40px">🗺️</div>ارفع المخطط العام للمشروع أو مخطط الحي (صورة)، ثم ثبّت مواقع الأصول عليه.<br><span class="small">عند توفر إحداثيات GPS نربطها بخريطة تفاعلية لاحقاً.</span></div></div>`}
      ${mp?pins.map(a=>`<div class="pin" style="left:${a.x}%;top:${a.y}%" data-id="${a.id}" title="${esc(a.name)}">${{project:'🏙️',district:'🏘️',building:'🏢',unit:'🏠'}[a.level]||'📍'}<span>${esc(a.name)} · ${esc(a.condition)}</span></div>`).join(''):''}</div></div>
      <div class="card" style="margin-top:14px"><h3>الأصول المربوطة بالموقع (${pins.length})</h3><table class="tbl"><thead><tr><th>الأصل</th><th>المستوى</th><th>الموقع</th><th>س%</th><th>ص%</th><th>الحالة</th></tr></thead><tbody>${pins.map(a=>`<tr class="clk" data-id="${a.id}"><td>${esc(a.name)}</td><td>${LEVELS[a.level]}</td><td>${esc(a.location||'')}</td><td class="num">${a.x}</td><td class="num">${a.y}</td><td>${pill(a.condition)}</td></tr>`).join('')}</tbody></table></div>`;
    $('#mapSel',v).onchange=e=>{ curMap=e.target.value; draw(); };
    const up=$('#mapUp',v); if(up) up.onchange=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ const m={id:'MAP-'+Date.now(),name:f.name.replace(/\.[^.]+$/,''),src:r.result}; Store.coll('maps').push(m); Store.log('إضافة','maps',m.id,'رفع خريطة'); Store.save(); curMap=m.id; draw(); toast('تم رفع الخريطة'); }; r.readAsDataURL(f); };
    $('#placeSel',v).onchange=e=>{ placing=e.target.value||null; $('#hint',v).textContent=placing?'انقر على الخريطة لتثبيت الموقع':'اختر أصلاً ثم انقر على الخريطة'; };
    const md=$('#mapDel',v); if(md) md.onclick=()=>{ ask('حذف الخريطة؟',()=>{ const i=maps.findIndex(m=>m.id===curMap); maps.splice(i,1); Store.save(); curMap=maps[0]?.id||null; draw(); },'حذف'); };
    $('#map',v).onclick=e=>{ if(!placing||!mp||!can('edit')) return; const r=$('#map',v).getBoundingClientRect(); const x=+((e.clientX-r.left)/r.width*100).toFixed(1), y=+((e.clientY-r.top)/r.height*100).toFixed(1); Store.update('assets',placing,{x,y,mapId:mp.id}); toast('تم تثبيت الموقع'); draw(); };
    v.querySelectorAll('.pin,[data-id].clk').forEach(p=>p.onclick=e=>{ if(placing&&p.classList.contains('pin')) return; e.stopPropagation(); assetDetail(Store.get('assets',p.dataset.id)); });
  };
  draw();
}};

/* 12. الموردون */
/* ───── التدفقات النقدية وفترة الاسترداد ───── */
const moIdx=mo=>{ const [y,m]=mo.split('-').map(Number); return y*12+m-1; };
const addMo=(mo,n)=>{ const i=moIdx(mo)+n; return `${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`; };
const curMo=()=>todayStr().slice(0,7);
/* توزيع مبلغ سنوي على الأشهر حسب دورية السداد وتاريخ البداية والنهاية */
function sched(annual,period,start,end,mo){ annual=Number(annual)||0; if(!annual) return 0; const s=start?start.slice(0,7):null, e=end?end.slice(0,7):null;
  if(s&&mo<s) return 0; if(e&&mo>e) return 0; if(period==='دفعة واحدة') return mo===s?annual:0;
  const n={'شهري':12,'ربع سنوي':4,'نصف سنوي':2,'سنوي':1}[period]||12, step=12/n; if(!s) return annual/n; return ((moIdx(mo)-moIdx(s))%step===0)?annual/n:0; }
const CF_IN=[{k:'self',l:'إيرادات التشغيل الذاتي (إيجارات)'},{k:'inv',l:'دفعات المستثمرين'}];
const CF_OUT=[{k:'auth',l:'التزام الهيئة الملكية'},{k:'om',l:'مقاولو التشغيل والصيانة'},{k:'meters',l:'فواتير العدادات'},{k:'other',l:'تكاليف تشغيل أخرى'}];
/* التدفق الشهري لاتفاقية: فعلي حتى الشهر الحالي، ومتوقع بعده */
function agreementCF(k,months){
  const cur=curMo(), F=Store.coll('finance').filter(f=>(f.contractId||agreementFor(f.assetId)?.id)===k.id), self=k.type!=='مستثمر';
  const OM=Store.coll('contracts').filter(x=>x.type==='تشغيل وصيانة'&&agreementFor(x.assetId)?.id===k.id);
  const MT=Store.coll('meters').filter(m=>meterAg(m)?.id===k.id&&m.payer!=='المستأجر'), MB=Store.coll('meterBills').filter(b=>MT.some(m=>m.id===b.meterId));
  const isOm=f=>f.category==='عقد تشغيل وصيانة', isMt=f=>String(f.category||'').startsWith('فاتورة');
  const actual=mo=>{ const E=F.filter(f=>f.date.startsWith(mo)); return {self:self?sum(E.filter(f=>f.kind==='إيراد'),'amount'):0,inv:self?0:sum(E.filter(f=>f.kind==='إيراد'),'amount'),auth:sched(k.payToAuthority,k.period,k.start,k.end,mo),om:sum(E.filter(f=>f.kind==='مصروف'&&isOm(f)),'amount'),meters:sum(MB.filter(b=>b.period===mo),'amount'),other:sum(E.filter(f=>f.kind==='مصروف'&&!isOm(f)&&!isMt(f)),'amount')}; };
  const last6=[0,1,2,3,4,5].map(i=>addMo(cur,-i)).map(actual), avg=key=>last6.reduce((s,x)=>s+x[key],0)/6;
  const mAvg=(()=>{ const per=[...new Set(MB.map(b=>b.period))].sort().slice(-6); return per.length?sum(MB.filter(b=>per.includes(b.period)),'amount')/per.length:0; })();
  const run={self:avg('self'),other:avg('other')};
  const rows={}; [...CF_IN,...CF_OUT].forEach(c=>rows[c.k]=[]);
  months.forEach(mo=>{ let r; if(mo<=cur) r=actual(mo); else r={self:self?run.self:0,inv:self?0:sched(k.payFromInvestor,k.period,k.start,k.end,mo),auth:sched(k.payToAuthority,k.period,k.start,k.end,mo),om:OM.reduce((s,x)=>s+sched(x.value,x.period,x.start,x.end,mo),0),meters:mAvg,other:self?run.other:0};
    Object.keys(rows).forEach(key=>rows[key].push(Math.round(r[key]||0))); });
  return rows;
}
function cfAggregate(K,months){ const T={}; [...CF_IN,...CF_OUT].forEach(c=>T[c.k]=months.map(()=>0)); K.forEach(k=>{ const r=agreementCF(k,months); Object.keys(T).forEach(key=>r[key].forEach((v,i)=>T[key][i]+=v)); });
  const inflow=months.map((_,i)=>CF_IN.reduce((s,c)=>s+T[c.k][i],0)), outflow=months.map((_,i)=>CF_OUT.reduce((s,c)=>s+T[c.k][i],0)), net=months.map((_,i)=>inflow[i]-outflow[i]);
  let c=0; const cum=net.map(x=>c+=x); return {T,inflow,outflow,net,cum}; }
/* فترة الاسترداد: التكلفة الاستثمارية ÷ صافي التدفق السنوي (ربح الاتفاقية) */
function payback(k){ const p=agreementPL(k), inv=Number(k.investment)||0, annual=p.profit; const yrs=inv&&annual>0?inv/annual:null;
  const elapsed=k.start?Math.max(0,(new Date(todayStr())-new Date(k.start))/31557600000):0; const recovered=Math.min(inv,Math.max(0,annual*elapsed));
  let date=null; if(yrs!=null&&k.start){ const d=new Date(k.start); d.setDate(d.getDate()+Math.round(yrs*365.25)); date=d.toISOString().slice(0,10); }
  const term=k.start&&k.end?(new Date(k.end)-new Date(k.start))/31557600000:null;
  return {inv,annual,yrs,recovered,pctRec:inv?Math.round(recovered/inv*100):0,date,term,withinTerm:yrs!=null&&term!=null?yrs<=term:null}; }
const paybackTxt=pb=>!pb.inv?'<span class="pill warn">أدخل التكلفة الاستثمارية</span>':pb.yrs==null?'<span class="pill bad">لا يُسترد بالأداء الحالي</span>':`<b>${pb.yrs.toFixed(1)} سنة</b>`;
/* ───── مؤشر صحة الاتفاقية (0-100) ───── */
const clamp=(x,lo=0,hi=100)=>Math.max(lo,Math.min(hi,x));
function agreementHealth(k){
  const p=agreementPL(k), o=agreementOps(k), self=k.type!=='مستثمر', income=self?p.rev:p.due, noi=self?p.rev-p.exp:p.due, C=[];
  const add=(l,w,score,note)=>C.push({l,w,score:score==null?null:Math.round(clamp(score)),note});
  add('الربحية',25,income?(p.profit/income)/0.30*100:0,`هامش ${income?Math.round(p.profit/income*100):0}% بعد الهيئة (30% = كامل الدرجة)`);
  add('تغطية التزام الهيئة',15,p.pay?(noi/p.pay-1)/0.5*100:null,p.pay?`الدخل التشغيلي يغطي الهيئة ${(noi/p.pay).toFixed(2)} مرة (1.5 = كامل)`:'مبلغ الهيئة غير محدد');
  if(self){
    add('الإشغال',20,o.units?o.occPct:null,o.units?`${o.occ} من ${o.units} وحدة مشغولة`:'لا وحدات');
    const set=new Set([k.assetId,...descendants(k.assetId).map(x=>x.id)]), dueP=Store.coll('payments').filter(x=>set.has(x.assetId)&&x.dueDate&&x.dueDate<=todayStr());
    const dA=sum(dueP,'amount'), dP=dueP.reduce((s,x)=>s+Math.min(Number(x.paid)||0,Number(x.amount)||0),0);
    add('تحصيل الإيجارات',20,dA?(dP/dA*100-80)/20*100:null,dA?`حُصّل ${Math.round(dP/dA*100)}% من المستحق (80% = صفر، 100% = كامل)`:'لا دفعات مستحقة');
    const OM=Store.coll('contracts').filter(x=>x.type==='تشغيل وصيانة'&&agreementFor(x.assetId)?.id===k.id);
    if(OM.length){ const ob=obsStats(Store.coll('observations').filter(x=>OM.some(c=>c.id===x.contractId))), rt=OM.reduce((s,c)=>s+contractorRating(c.contractorId),0)/OM.length; add('أداء المقاول',10,((ob.total?ob.rate:100)+(rt?rt*20:60))/2-ob.overdue*10,`تقييم ${rt?rt.toFixed(1):'—'} · أُغلق ${ob.closed} من ${ob.total} ملاحظة${ob.overdue?` · ${ob.overdue} متأخرة`:''}`); } else add('أداء المقاول',10,null,'لا عقود تشغيل وصيانة');
    const ms=meterStats(Store.coll('meters').filter(m=>meterAg(m)?.id===k.id&&m.payer!=='المستأجر'));
    add('انتظام فواتير العدادات',10,ms.count?100-ms.lateN*25-ms.unpaidN*5:null,ms.count?`${ms.unpaidN} غير مسددة · ${ms.lateN} متأخرة`:'لا عدادات');
  } else {
    add('التحصيل من المستثمر',25,p.due?(p.rev/p.due*100-80)/20*100:null,p.due?`حُصّل ${Math.round(p.rev/p.due*100)}% من المستحق السنوي`:'لا مبلغ محدد');
    const st=reqStats(reqsOf(k.id)); add('تنفيذ المتطلبات',20,st.total?st.done/st.total*100+st.prog/st.total*40-st.late*25:null,st.total?`${st.done} من ${st.total} منجز · ${st.late} متأخر`:'لا متطلبات مسجلة');
    const d=daysTo(k.end); add('استقرار العقد',15,d==null?null:d<0?0:d>=365?100:d<=90?20:20+(d-90)/275*80,d==null?'بلا تاريخ نهاية':d<0?'العقد منتهي':`ينتهي خلال ${d} يوم`);
  }
  const V=C.filter(c=>c.score!=null), W=sum(V,'w'); const score=W?Math.round(V.reduce((s,c)=>s+c.score*c.w,0)/W):0;
  const grade=score>=80?{l:'ممتاز',c:'ok'}:score>=60?{l:'جيد',c:'info'}:score>=40?{l:'يحتاج متابعة',c:'warn'}:{l:'حرج',c:'bad'};
  const weakest=V.slice().sort((x,y)=>x.score-y.score)[0];
  return {score,grade,comps:C,weakest};
}
const healthBadge=(k,big)=>{ const h=agreementHealth(k); return `<span class="hbadge ${h.grade.c} ${big?'big':''}" data-h="${k.id}" title="مؤشر الصحة: ${h.grade.l}"><b>${h.score}</b><small>${h.grade.l}</small></span>`; };
function healthModal(id){ const k=Store.get('contracts',id); if(!k) return; const h=agreementHealth(k);
  Modal.open({title:`مؤشر صحة: ${esc(k.type==='مستثمر'?k.party:k.title)}`,body:`<div class="hhead">${healthBadge(k,true)}<div><b>${AG_LABEL[k.type]}</b><div class="small muted">${esc(k.title)} · ${esc(k.number)}</div>${h.weakest?`<div class="small" style="margin-top:6px">أضعف عنصر: <b>${esc(h.weakest.l)}</b> (${h.weakest.score})</div>`:''}</div></div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>العنصر</th><th>الوزن</th><th>الدرجة</th><th></th><th>التفسير</th></tr></thead><tbody>
    ${h.comps.map(c=>`<tr><td>${esc(c.l)}</td><td>${c.w}%</td><td><b>${c.score==null?'—':c.score}</b></td><td style="min-width:110px">${c.score==null?'<span class="small muted">لا يُحسب</span>':`<div class="bar ${c.score<40?'red':c.score<60?'gold':''}"><i style="width:${c.score}%"></i></div>`}</td><td class="small">${esc(c.note)}</td></tr>`).join('')}
    </tbody></table><p class="small muted" style="margin-top:10px">80 فأكثر ممتاز، 60 إلى 79 جيد، 40 إلى 59 يحتاج متابعة، أقل من 40 حرج. العناصر غير المتوفرة لا تُحسب ويُعاد توزيع وزنها.</p>`,
    footer:`<button class="btn" onclick="Modal.close()">إغلاق</button><button class="btn" onclick="Modal.close();location.hash='#whatif'">🔍 دراسة الفرص</button>`}); }
document.addEventListener('click',e=>{ const b=e.target.closest('.hbadge[data-h]'); if(b&&!b.closest('.modal')){ e.stopPropagation(); e.preventDefault(); healthModal(b.dataset.h); } },true);

const MADAR_MARK=`<svg viewBox="0 0 152 140" width="36" height="33" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10 0H142Q152 0 152 10V116L128 140H42V84L0 104V10Q0 0 10 0ZM42 38V100H112V38Z"/><path fill="#b9925a" d="M0 118L42 96V140H10Q0 140 0 130Z"/></svg>`;
/* ───── دراسة الفرص: نمذجة شهرية لثلاثة بدائل تشغيل مع توصية واختبار ضغط ─────
   البدائل: تشغيل ذاتي بفريقنا · تشغيل ذاتي عبر شركة إدارة أملاك · إسناد لمستثمر
   كل بديل يُحاكى شهرياً على مدة القرار، ثم يُقارن بالقيمة الحالية الصافية بعد إضافة علاوة مخاطر تشغيلية لكل بديل */
const WIView={k:'',opt:''};
const WI_OPTS={team:{l:'تشغيل ذاتي بفريقنا',ic:'🏠',c:'#a9713d',risk:'مرتفعة',rk:3},pm:{l:'تشغيل ذاتي عبر شركة إدارة أملاك',ic:'🧰',c:'#b9925a',risk:'متوسطة',rk:2},inv:{l:'إسناد التشغيل لمستثمر',ic:'🤝',c:'#5b8aa8',risk:'منخفضة',rk:1}};
const WI_COND={new:{l:'جديد أو مجدَّد حديثاً',setup:5000,renew:3000,every:7,setupM:2},mid:{l:'متوسط',setup:15000,renew:6000,every:5,setupM:3},old:{l:'قديم ويحتاج تأهيلاً',setup:35000,renew:10000,every:3,setupM:6}};
const WI_TEAM={yes:{l:'نعم، فريق جاهز',prem:1},part:{l:'جزئياً',prem:2.5},no:{l:'لا يوجد',prem:4}};
const WI_RISK={low:{l:'متحفظ: أفضّل الدخل المضمون',close:20},mid:{l:'متوازن',close:10},high:{l:'مرن: أقبل المخاطرة لعائد أعلى',close:3}};
const WI_YN={yes:{l:'نعم'},no:{l:'لا، يحتاج تجهيزاً'}};
const WI_PAY={a:{l:'سنوي مقدم'},q:{l:'ربع سنوي'},m:{l:'شهري'}};
const WI_WHO={us:{l:'نحن'},inv:{l:'المستثمر'}};
/* ما يقرأه النموذج من النظام عن الاتفاقية */
/* الدراسة لمشروع جديد: لا تُقرأ بيانات من النظام، كل القيم من إجاباتك أو تقديرات السوق */
function wiSys(){ return {self:false,units:0,pricedN:0,rent:0,occ:null,opexPct:null,auth:0,offer:0}; }
const WI_KEY='new';
/* تعريف كل المدخلات: الأسئلة العامة (q) ثم الافتراضات التفصيلية. القيمة الافتراضية تُحسب من النظام ومن إجابات الأسئلة */
const r100=x=>Math.round((x||0)/100)*100, r1000=x=>Math.round((x||0)/1000)*1000;
const WI_FD=[
  {id:'qUnits',g:'q',s:'الوحدات',min:1,req:1,l:'كم وحدة قابلة للتأجير؟',u:'وحدة',def:(v,S)=>S.units,src:S=>S.units?'من النظام':''},
  {id:'qRent',g:'q',s:'الإيجار السنوي',min:0,req:1,l:'كم متوسط الإيجار السنوي للوحدة؟',u:'ر.س',def:(v,S)=>S.rent,src:S=>S.pricedN?'من إيجارات الوحدات':S.self&&S.rent?'سعر التعادل':''},
  {id:'auth',g:'q',s:'المسدد للهيئة سنوياً',min:0,l:'كم تدفع للهيئة الملكية سنوياً مقابل الاتفاقية؟',u:'ر.س',def:(v,S)=>S.auth,src:S=>S.auth?'من الاتفاقية':''},
  {id:'qOcc',g:'q',s:'الإشغال',min:0,max:100,l:'كم تتوقع نسبة الإشغال بعد الاستقرار؟',u:'%',def:()=>85,src:S=>S.occ?'الإشغال الحالي':''},
  {id:'qRamp',g:'q',s:'الوصول للإشغال',min:0,max:60,l:'كم شهراً يحتاج حتى يصل لهذا الإشغال؟',u:'شهر',def:v=>v.qReady==='yes'?6:12},
  {id:'qCond',g:'q',s:'حالة الأصل',l:'ما حالة الأصل؟',opts:WI_COND,def:()=>'mid'},
  {id:'qReady',g:'q',s:'جاهز للتأجير',l:'هل الأصل جاهز للتأجير الآن؟',opts:WI_YN,def:()=>'no'},
  {id:'qTeam',g:'q',s:'فريق التشغيل',l:'هل لديك فريق تأجير وتشغيل وتحصيل؟',opts:WI_TEAM,def:()=>'part'},
  {id:'qOffer',g:'q',s:'عرض المستثمر',min:0,l:'كم عرض المستثمر السنوي؟',u:'ر.س',def:(v,S)=>S.offer,src:S=>S.offer?'العقد الحالي':'',hint:'اتركه صفراً إن لم يصلك عرض، وتظهر لك أقل قيمة تقبلها'},
  {id:'qCash',g:'q',s:'السيولة المتاحة',min:0,l:'كم السيولة المتاحة لهذا الأصل؟',u:'ر.س',def:()=>0,hint:'صفر = لم تُحدد، فلا نختبر كفاية السيولة'},
  {id:'qH',g:'q',s:'مدة القرار',min:1,max:30,l:'كم سنة مدة القرار؟',u:'سنة',def:()=>5},
  {id:'qRisk',g:'q',s:'تقبّل المخاطرة',l:'ما مدى تقبّلك للمخاطرة؟',opts:WI_RISK,def:()=>'mid'},
  // التوقيت والاستثمار الأولي
  {id:'setup',g:'التوقيت والاستثمار الأولي',l:'تكلفة تجهيز الأصل للتشغيل الذاتي',u:'ر.س',def:v=>v.qReady==='yes'?0:r1000(v.qUnits*WI_COND[v.qCond].setup),hint:'تشطيب، أثاث، أنظمة، تسويق الإطلاق'},
  {id:'setupM',g:'التوقيت والاستثمار الأولي',l:'مدة التجهيز قبل بدء الإيرادات',u:'شهر',def:v=>v.qReady==='yes'?0:WI_COND[v.qCond].setupM,hint:'يُصرف التجهيز موزعاً على هذه الأشهر'},
  {id:'invCost',g:'التوقيت والاستثمار الأولي',l:'تكاليف أولية نتحملها عند الإسناد',u:'ر.س',def:()=>50000,hint:'الطرح والتقييم والاستشارات القانونية والتسليم'},
  // الإيرادات
  {id:'rGrow',g:'الإيرادات',l:'نمو الإيجارات سنوياً',u:'%',def:()=>2},
  {id:'coll',g:'الإيرادات',l:'نسبة التحصيل الفعلي من الإيجارات',u:'%',def:v=>v.qTeam==='yes'?96:v.qTeam==='part'?93:90},
  // تكاليف التشغيل
  {id:'fixed',g:'تكاليف التشغيل',l:'تكاليف ثابتة سنوية',u:'ر.س',def:(v,S)=>r1000(v.qUnits*v.qRent*(v.qOcc/100)*((S.opexPct||30)/100)*0.6),hint:'رواتب، حراسة، نظافة، تأمين، أنظمة'},
  {id:'varPct',g:'تكاليف التشغيل',l:'تكاليف متغيرة من الدخل',u:'%',def:(v,S)=>Math.round((S.opexPct||30)*0.4),hint:'صيانة دورية، خدمات، عمولات تأجير'},
  {id:'cGrow',g:'تكاليف التشغيل',l:'نمو التكاليف سنوياً',u:'%',def:()=>3},
  {id:'pmFee',g:'تكاليف التشغيل',l:'أتعاب شركة إدارة الأملاك من المحصَّل',u:'%',def:()=>8,hint:'السائد في السوق 5% إلى 10%'},
  {id:'pmSave',g:'تكاليف التشغيل',l:'ما توفره شركة الإدارة من التكاليف الثابتة',u:'%',def:()=>50,hint:'لأنها تتولى فريق التأجير والتحصيل'},
  // عرض المستثمر
  {id:'esc',g:'عرض المستثمر',l:'الزيادة الدورية على العرض',u:'%',def:()=>5},
  {id:'escN',g:'عرض المستثمر',l:'كل كم سنة تُطبَّق الزيادة',u:'سنة',def:()=>3},
  {id:'grace',g:'عرض المستثمر',l:'فترة سماح بدون دفع',u:'شهر',def:v=>v.qReady==='yes'?2:6,hint:'يطلبها المستثمر عادة لفترة التجهيز'},
  {id:'payT',g:'عرض المستثمر',l:'مواعيد سداد المستثمر',opts:WI_PAY,def:()=>'q'},
  // الالتزامات التعاقدية
  {id:'authInv',g:'الالتزامات التعاقدية',l:'من يدفع التزام الهيئة عند الإسناد؟',opts:WI_WHO,def:()=>'us'},
  {id:'oblig',g:'الالتزامات التعاقدية',l:'التزامات أخرى علينا سنوياً في كل البدائل',u:'ر.س',def:()=>0,hint:'صيانة إنشائية، تأمين المبنى، رسوم حكومية'},
  // التجديدات والقيمة المتبقية
  {id:'renew',g:'التجديدات والقيمة المتبقية',l:'تكلفة التجديد الرأسمالي للوحدة في كل دورة',u:'ر.س',def:v=>WI_COND[v.qCond].renew,hint:'استبدال مكيفات، دهانات، أرضيات، أجهزة'},
  {id:'renewN',g:'التجديدات والقيمة المتبقية',l:'كل كم سنة يتكرر التجديد',u:'سنة',def:v=>WI_COND[v.qCond].every},
  {id:'renewInv',g:'التجديدات والقيمة المتبقية',l:'من يتحمل التجديدات عند الإسناد؟',opts:WI_WHO,def:()=>'inv'},
  {id:'resid',g:'التجديدات والقيمة المتبقية',l:'قيمة التجهيزات المتبقية بنهاية المدة',u:'%',def:()=>20,hint:'نسبة من تكلفة التجهيز تعود لك قيمتها'},
  // السيولة والتمويل
  {id:'wc',g:'السيولة والتمويل',l:'سيولة تشغيلية تغطي الفجوة بين الصرف والتحصيل',u:'شهر',def:v=>v.qTeam==='yes'?2:3,hint:'عدد أشهر من التكاليف، تُحجز عند بدء التشغيل وتعود بنهايته'},
  {id:'fin',g:'السيولة والتمويل',l:'نسبة التمويل من تكلفة التجهيز',u:'%',def:()=>0},
  {id:'finR',g:'السيولة والتمويل',l:'تكلفة التمويل السنوية',u:'%',def:()=>7},
  {id:'finY',g:'السيولة والتمويل',l:'مدة سداد التمويل',u:'سنة',def:()=>5},
  // الخصم والزكاة
  {id:'disc',g:'معدل الخصم والزكاة',l:'معدل الخصم (العائد المطلوب على رأس المال)',u:'%',def:()=>8,hint:'تُضاف إليه علاوة مخاطر لكل بديل'},
  {id:'zakat',g:'معدل الخصم والزكاة',l:'الزكاة أو الضريبة على صافي الربح',u:'%',def:()=>2.5,hint:'حسب الانطباق، وصفر إن لم تنطبق'},
];
/* شرح جانبي لكل سؤال: لماذا نسأل، كيف يدخل في الحساب، ونصيحة عملية */
const WI_WHY={
  qUnits:['هي أساس الدخل: كل وحدة مؤجرة تضيف إيجاراً.','الدخل الكامل = عدد الوحدات × متوسط الإيجار. ويُستخدم العدد أيضاً لتقدير تكلفة التجهيز والتجديدات لكل وحدة.','احسب الوحدات الجاهزة للتأجير فقط، واستبعد المخصصة لاستخدام داخلي.'],
  qRent:['يحدد سقف الدخل الذي يمكن أن يحققه الأصل.','يدخل في الدخل الشهري، وينمو كل سنة بنسبة نمو الإيجارات (2% افتراضياً).','استخدم إيجار السوق لوحدات مشابهة في نفس المدينة، لا السعر المأمول.'],
  auth:['هذا عادة أكبر التزام ثابت، ويُدفع سواء امتلأت الوحدات أو لا.','يُخصم شهرياً من كل البدائل كتكلفة. وعند الإسناد تحدد في الافتراضات التفصيلية من يدفعه: أنت أو المستثمر.','إن كان المقابل يزيد دورياً في الاتفاقية، ضع متوسطه على مدة القرار.'],
  qOcc:['الإشغال يحدد كم من الدخل الكامل تحققه فعلاً.','يُضرب في الدخل الكامل. واختبار الضغط يقيس أثر نزوله 10 نقاط على القرار.','الإسكان المستقر عادة بين 85% و95%، والتجاري الجديد أقل في أول سنتين.'],
  qRamp:['الأصل الجديد أو المعاد طرحه لا يمتلئ من أول يوم.','الإشغال يتصاعد تدريجياً خلال هذه الأشهر حتى يصل للنسبة المستهدفة، فيقل دخل السنة الأولى.','صفر إن كان مؤجراً حالياً، ومن 6 إلى 18 شهراً لأصل جديد حسب الطلب.'],
  qCond:['حالة الأصل تحدد كم ستصرف لتجهيزه وصيانته مستقبلاً.','تحدد التقدير الأولي لتكلفة التجهيز ومدته، وتكلفة التجديدات الرأسمالية وكل كم سنة تتكرر.','تقدر تعدّل هذه التقديرات بدقة من الافتراضات التفصيلية بعد ظهور النتيجة.'],
  qReady:['إن احتاج الأصل تجهيزاً، فهناك صرف وانتظار قبل أي دخل.','«نعم»: لا تكلفة تجهيز ويبدأ الدخل فوراً. «لا»: تكلفة تجهيز وأشهر بلا دخل في التشغيل الذاتي، ويطلب المستثمر عادة فترة سماح.','التجهيز يشمل التشطيب والأثاث والأنظمة وتسويق الإطلاق.'],
  qTeam:['التشغيل الذاتي يحتاج فريقاً يؤجر ويحصّل ويتابع الصيانة.','بدون فريق ترتفع علاوة مخاطر التشغيل الذاتي وتنخفض نسبة التحصيل المتوقعة، فيقترب خيار شركة إدارة الأملاك أو المستثمر.','«جزئياً» تعني أن لديك بعض الأدوار وتحتاج تعيين أو تعاقد للباقي.'],
  qOffer:['عرض المستثمر هو البديل المضمون للتشغيل الذاتي.','نحسب دفعاته مع الزيادة الدورية وفترة السماح ونقارنها بالتشغيل الذاتي. إن تركته صفراً نحسب لك أقل عرض يستحق القبول.','قارن العروض على نفس الشروط: الزيادة الدورية، فترة السماح، ومن يدفع للهيئة الملكية.'],
  qCash:['حتى المشروع الرابح قد يتعثر إن نفدت السيولة قبل استقرار الدخل.','نقارنها بأقصى احتياج سيولة في التشغيل الذاتي (التجهيز + أشهر الانتظار + الالتزامات)، وننبهك إن لم تكفِ.','صفر يعني تجاهل هذا الاختبار.'],
  qH:['هي الأفق الزمني الذي نقارن عليه البدائل.','صافي الربح والقيمة الحالية والاسترداد كلها تُحسب على هذه المدة.','اجعلها مساوية للمدة المتبقية من الاتفاقية مع الهيئة الملكية، أو لمدة عقد المستثمر المقترح.'],
  qRisk:['نفس الأرقام قد تناسب جهة ولا تناسب أخرى.','عند تقارب البدائل نختار الأقل مخاطرة: المتحفظ يقبل فرقاً حتى 20%، والمتوازن 10%، والمرن 3%.','إن كان الدخل الثابت أهم لك من تعظيم الربح، اختر «متحفظ».']
};
const WI_BY=Object.fromEntries(WI_FD.map(f=>[f.id,f]));
/* المدخلات المالية الاثنا عشر ومدى اكتمال كل منها */
const WI_CHECK=[['مدة الاستثمار',['qH','setupM','qRamp']],['الاستثمار الأولي',['setup','invCost']],['إيرادات التشغيل الذاتي',['qUnits','qRent','qOcc','rGrow','coll']],['تكاليف التشغيل',['fixed','varPct','cGrow']],['عرض المستثمر',['qOffer','esc','escN','grace','payT']],['الالتزامات التعاقدية',['auth','authInv','oblig']],['التجديدات الرأسمالية',['renew','renewN','renewInv']],['معدل الخصم',['disc']],['القيمة المتبقية',['resid']],['السيولة التشغيلية',['wc','qCash']],['التمويل',['fin','finR','finY']],['الزكاة والضرائب',['zakat']]];
function wiSaved(){ const all=Store.data.wiStudies||(Store.data.wiStudies={}); return all[WI_KEY]||(all[WI_KEY]={v:{},t:{}}); }
function wiVals(){ const S=wiSys(), sv=wiSaved(), v={}; WI_FD.forEach(f=>{ v[f.id]=sv.t[f.id]?sv.v[f.id]:f.def(v,S); }); return {S,v,sv}; }
/* المحاكاة الشهرية لبديل واحد. over = تعديلات مؤقتة لاختبار الضغط */
function wiSim(V,opt,over){ const v=Object.assign({},V,over||{}), H=Math.max(1,Math.min(30,Math.round(v.qH)||1)), N=H*12, cf=new Array(N+1).fill(0);
  const rows=[...Array(H)].map((_,i)=>({y:i+1,rev:0,opex:0,fee:0,auth:0,capex:0,fin:0,zakat:0,profit:0,interest:0}));
  const yi=m=>Math.min(H-1,Math.max(0,Math.ceil(m/12)-1)), add=(m,key,x)=>{ m=Math.max(0,Math.min(N,m)); cf[m]+=x; rows[yi(m)][key]+=x; };
  const full=v.qUnits*v.qRent, occS=Math.max(0,Math.min(100,v.qOcc))/100, g=y=>Math.pow(1+v.cGrow/100,y);
  for(let m=1;m<=N;m++){ add(m,'auth',-(opt==='inv'&&v.authInv==='inv'?0:v.auth)/12); add(m,'auth',-v.oblig/12); }
  if(opt==='inv'){
    add(0,'capex',-v.invCost);
    const per={a:12,q:3,m:1}[v.payT]||3;
    for(let m=Math.max(0,Math.round(v.grace));m<N;m+=per){ const len=Math.min(per,N-m), yr=Math.floor(m/12), amt=v.qOffer*Math.pow(1+v.esc/100,Math.floor(yr/Math.max(1,v.escN)))*len/12; add(v.payT==='a'?m:m+len,'rev',amt); }
    if(v.renewInv==='us') for(let m=1;m<=N;m++) add(m,'capex',-v.qUnits*v.renew/Math.max(1,v.renewN)/12*g((m-1)/12));
  } else {
    const S0=Math.max(0,Math.round(v.setupM)), fixedEff=v.fixed*(opt==='pm'?1-v.pmSave/100:1);
    if(S0>0) for(let m=0;m<S0;m++) add(m,'capex',-v.setup/S0); else add(0,'capex',-v.setup);
    const loan=v.setup*Math.max(0,Math.min(100,v.fin))/100;
    if(loan>0){ add(0,'fin',loan); const r=v.finR/1200, n=Math.max(1,Math.round(v.finY*12)), pay=r?loan*r/(1-Math.pow(1+r,-n)):loan/n; let bal=loan;
      for(let i=1;i<=n&&bal>0.5;i++){ const m=S0+i; if(m>=N){ add(N,'fin',-bal); break; } const int=bal*r; rows[yi(m)].interest+=int; bal-=pay-int; add(m,'fin',-pay); } }
    const wcAmt=v.wc*(fixedEff/12+full*occS*(v.varPct/100)/12+(opt==='pm'?full*occS*(v.coll/100)*(v.pmFee/100)/12:0));
    if(S0<N){ add(S0,'capex',-wcAmt); add(N,'capex',wcAmt); }
    for(let m=S0+1;m<=N;m++){ const t=m-S0, yr=Math.floor((m-1)/12), occ=v.qRamp>0?occS*Math.min(1,t/v.qRamp):occS;
      const gross=full/12*occ*Math.pow(1+v.rGrow/100,yr), coll=gross*v.coll/100;
      add(m,'rev',coll); add(m,'opex',-(gross*v.varPct/100+fixedEff/12*g(yr))); if(opt==='pm') add(m,'fee',-coll*v.pmFee/100); }
    for(let m=S0+1;m<=N;m++) add(m,'capex',-v.qUnits*v.renew/Math.max(1,v.renewN)/12*g((m-1)/12)); // احتياطي تجديدات شهري
    add(N,'capex',v.setup*v.resid/100);
  }
  rows.forEach(r=>{ r.profit=r.rev+r.opex+r.fee+r.auth-r.interest; const z=Math.max(0,r.profit)*v.zakat/100; if(z){ r.zakat=-z; cf[Math.min(N,r.y*12)]-=z; } });
  let c=0; const cum=cf.map(x=>c+=x); rows.forEach(r=>{ r.net=r.rev+r.opex+r.fee+r.auth+r.capex+r.fin+r.zakat; r.cum=cum[Math.min(N,r.y*12)]; });
  const npv=rate=>{ const rm=Math.pow(1+rate/100,1/12)-1; return cf.reduce((s,x,m)=>s+x/Math.pow(1+rm,m),0); };
  let irr=null; const out0=cum.slice(0,13).some(x=>x<-1); if(out0&&cf.some(x=>x>1)){ let lo=-90,hi=300; if(npv(lo)*npv(hi)<0){ for(let i=0;i<80;i++){ const mid=(lo+hi)/2; if(npv(mid)>0) lo=mid; else hi=mid; } irr=(lo+hi)/2; if(irr>299||irr<-89) irr=null; } }
  let pb=null, wasNeg=false; for(let m=0;m<=N;m++){ if(cum[m]<-1) wasNeg=true; else if(wasNeg&&pb==null&&cum[m]>=0) pb=m; if(cum[m]<-1&&pb!=null) pb=null; }
  return {opt,H,N,cf,cum,rows,npv,irr,pb:wasNeg?pb:0,total:cum[N],y1:rows[0].net,peak:Math.min(0,...cum),avgProfit:rows.reduce((s,r)=>s+r.profit,0)/H}; }
const wiRate=(v,opt)=>v.disc+(opt==='team'?WI_TEAM[v.qTeam].prem:opt==='pm'?1:0.5);
/* القرار: أعلى قيمة حالية بعد علاوة المخاطر، وعند التقارب يُفضَّل البديل الأقل مخاطرة حسب درجة تقبّلك للمخاطرة */
function wiDecide(V,over){ const v=Object.assign({},V,over||{}), R={}; ['team','pm','inv'].forEach(o=>{ R[o]=wiSim(v,o); R[o].val=R[o].npv(wiRate(v,o)); });
  const cand=v.qOffer>0?['team','pm','inv']:['team','pm']; let best=cand.reduce((a,b)=>R[b].val>R[a].val?b:a);
  if(!v.qOffer&&R[best].val<0) return {v,R,best:'inv',closePick:false,cand,seek:true};
  const close=WI_RISK[v.qRisk].close/100; let closePick=false;
  cand.filter(o=>WI_OPTS[o].rk<WI_OPTS[best].rk).sort((a,b)=>WI_OPTS[a].rk-WI_OPTS[b].rk).some(o=>{ if(R[best].val-R[o].val<=Math.abs(R[best].val)*close){ best=o; closePick=true; return true; } });
  return {v,R,best,closePick,cand}; }
function wiMinOffer(V,target){ const f=x=>{ const s=wiSim(V,'inv',{qOffer:x}); return s.npv(wiRate(V,'inv')); }, a=f(0), b=f(1e6); return b===a?null:Math.max(0,(target-a)/(b-a)*1e6); }
function wiOccBreak(V,opt){ const f=o=>wiSim(V,opt,{qOcc:o}).npv(wiRate(V,opt)); if(f(100)<0) return 101; if(f(0)>=0) return 0; let lo=0,hi=100; for(let i=0;i<30;i++){ const m=(lo+hi)/2; if(f(m)>=0) hi=m; else lo=m; } return hi; }
const wiYrs=n=>n===1?'سنة واحدة':n===2?'سنتين':n<=10?`${n} سنوات`:`${n} سنة`;
const wiPb=(R)=>R.pb==null?'لا يُسترد خلال المدة':R.pb===0?'فوري':R.pb<12?`${R.pb} شهر`:`${(R.pb/12).toFixed(1)} سنة`;
const SAR=n=>`${Math.round(n).toLocaleString('en-US')} ر.س`;
function wiAdvice(D,S){ const {v,R,best,closePick}=D, b=R[best], sb=R.team.val>=R.pm.val?'team':'pm', s=R[sb], why=[], plan=[];
  if(!v.qUnits||!v.qRent) return {title:'أجب عن عدد الوحدات ومتوسط الإيجار لتظهر التوصية',why:[],plan:[],tone:'warn'};
  const minOffer=wiMinOffer(v,Math.max(R.team.val,R.pm.val)), occB=wiOccBreak(v,sb);
  const allNeg=D.cand.every(o=>R[o].val<0), z=allNeg?wiMinOffer(v,0):null, floor=z!=null?Math.max(z,minOffer||0):minOffer;
  if(allNeg&&!D.seek){ why.push(`تنبيه: كل البدائل خاسرة بهذه البيانات، والسبب الرئيسي التزامات ثابتة (${short(v.auth+v.oblig)} سنوياً) أكبر من الدخل المتوقع. فاوض الهيئة على الالتزام أو راجع الإيجارات قبل أي قرار.`); if(z!=null) why.push(`ليصبح الإسناد رابحاً تحتاج عرضاً لا يقل عن ${SAR(z)} سنوياً.`); }
  if(D.seek){ why.push(`التشغيل الذاتي خاسر بهذه البيانات: القيمة الحالية ${short(R.team.val)} بفريقك و${short(R.pm.val)} عبر شركة إدارة على ${wiYrs(R.team.H)}.`); why.push(`صافي ربحه التشغيلي ${short(s.avgProfit)} سنوياً لا يغطي التجهيز والتجديدات والالتزامات.`); }
  if(closePick) why.push(`البدائل متقاربة في القيمة، واخترنا الأقل مخاطرة لأنك ${v.qRisk==='low'?'متحفظ':'متوازن'} في تقبّل المخاطرة.`);
  const others=D.cand.filter(o=>o!==best).map(o=>`${WI_OPTS[o].l} بـ${short(Math.abs(b.val-R[o].val))}`);
  if(others.length&&!D.seek) why.push(`القيمة الحالية لهذا البديل ${short(b.val)} على ${wiYrs(b.H)}، ${b.val>=Math.max(...D.cand.map(o=>R[o].val))?'وتتفوق على':'والفرق عن'} ${others.join(' و')}.`);
  if(best!=='inv'){
    if(b.irr!=null) why.push(`العائد الداخلي ${b.irr.toFixed(1)}% ${b.irr>=v.disc?'أعلى من':'أقل من'} العائد المطلوب ${v.disc}%.`);
    why.push(occB>100?'تحذير: حتى بإشغال كامل لا يغطي الدخل التكاليف والالتزامات بهذه الإيجارات.':`يبقى رابحاً ما دام الإشغال فوق ${Math.round(occB)}%، والمفترض ${v.qOcc}%.`);
    if(best==='pm') why.push(`شركة الإدارة تكلف ${v.pmFee}% من المحصّل، لكنها توفر ${v.pmSave}% من التكاليف الثابتة وتخفض مخاطر التشغيل${v.qTeam!=='yes'?'، وهذا مهم لأن فريقك غير مكتمل':''}.`);
    if(best==='team'&&v.qTeam!=='yes') why.push('تفوق التشغيل بفريقك مشروط بتجهيز فريق تأجير وتحصيل قبل الإطلاق.');
  } else {
    if(v.qOffer&&b.avgProfit>0) why.push(`دخل مضمون بالعقد: ${short(b.avgProfit)} في المتوسط سنوياً بعد ${v.authInv==='us'?'التزام الهيئة':'الالتزامات'}، بلا تكاليف تشغيل أو مخاطر إشغال علينا.`);
    if(v.grace&&v.qOffer) why.push(`فترة السماح (${v.grace} شهر) تكلفك ${short(v.qOffer*v.grace/12)} تقريباً، فاجعلها مقابل التزام المستثمر بالتجهيز.`);
  }
  if(minOffer!=null) why.push(minOffer<1000&&!v.qOffer?`أي عرض من مستثمر أفضل من التشغيل الذاتي هنا، بشرط ألا تتحمل التزامات إضافية.`:Math.max(R.team.val,R.pm.val)<0&&!v.qOffer?`أي عرض يزيد على ${SAR(minOffer)} سنوياً أفضل من التشغيل الذاتي.`:v.qOffer?`أقل عرض يجعل الإسناد مساوياً للتشغيل الذاتي: ${SAR(minOffer)} سنوياً، والعرض الذي وصلك ${v.qOffer>=minOffer?'أعلى منه':'أقل منه'}.`:`لم يصلك عرض بعد: لا تقبل أقل من ${SAR(minOffer)} سنوياً بنفس الزيادات والسماح.`);
  const need=-s.peak; if(best!=='inv'&&v.qCash>0&&need>v.qCash) why.push(`السيولة غير كافية: يحتاج التشغيل الذاتي حتى ${short(need)} في أصعب نقطة والمتاح ${short(v.qCash)}. ارفع نسبة التمويل أو قلّل التجهيز.`);
  if(best==='inv'){ plan.push(`اطرح المشروع لمستثمرين ${floor!=null&&floor>=1000?`بحد أدنى ${SAR(floor)} سنوياً`:'بأعلى عرض يغطي التزام الهيئة'}، وزيادة ${v.esc}% كل ${wiYrs(v.escN)}.`); plan.push('اشترط ضماناً بنكياً يعادل دفعات سنة، وسداداً مقدماً لكل فترة.'); plan.push(`نُص في العقد على من يتحمل التجديدات والتزام الهيئة (الافتراض الحالي: التجديدات ${v.renewInv==='us'?'علينا':'على المستثمر'}، والتزام الهيئة ${v.authInv==='us'?'علينا':'على المستثمر'}).`); }
  else if(best==='pm'){ plan.push(`اطلب عروض ثلاث شركات إدارة أملاك بأتعاب لا تتجاوز ${v.pmFee}% من المحصّل.`); plan.push(`اربط الأتعاب بمؤشرات: إشغال ${v.qOcc}% وتحصيل ${v.coll}% على الأقل، مع تقرير مالي شهري.`); plan.push(`خصّص احتياطي تجديدات قرابة ${short(v.qUnits*v.renew/Math.max(1,v.renewN))} سنوياً.`); }
  else { plan.push(`جهّز فريق التأجير والتحصيل ${v.setupM?`خلال فترة التجهيز (${v.setupM} شهر)`:'قبل بدء التشغيل'}.`); plan.push(`احجز سيولة تشغيلية ${short(-b.peak)} على الأقل لتغطية الفجوة حتى يستقر التحصيل.`); plan.push(`راقب الإشغال شهرياً: نزوله تحت ${Math.round(Math.min(100,occB))}% يعني مراجعة القرار.`); }
  const title=D.seek?'التوصية: لا تشغّله ذاتياً، واطلب عروض مستثمرين':`التوصية: ${WI_OPTS[best].l}`, action=D.seek?'التشغيل الذاتي خاسر بهذه الأرقام، فالأفضل البحث عن مستثمر.':best==='inv'?'اطرح المشروع لمستثمر بالشروط أدناه.':best==='pm'?'شغّله ذاتياً، وتعاقد مع شركة إدارة أملاك تتولى التأجير والتحصيل.':'شغّله ذاتياً بفريقك.';
  return {title,action,why,plan,tone:(best!=='inv'&&v.qCash>0&&need>v.qCash)||occB>100||allNeg?'warn':'ok',minOffer,occB,sb}; }
M.whatif={key:'whatif',label:'دراسة الفرص',icon:'🔍',group:'الرئيسية',render(v){
  const st=WIView, {S,v:val,sv}=wiVals(), D=wiDecide(val), A=wiAdvice(D,S), R=D.R;
  const Q=WI_FD.filter(f=>f.g==='q'); if(st.step===undefined) st.step=sv.done?null:0;
  const toolbar=`<div class="toolbar"><span class="muted">حلّل أي مشروع جديد: أجب عن الأسئلة، ويقترح لك طريقة التشغيل الأنسب وأرقامها.</span><span class="sp"></span><button class="btn sm" id="wiReset">↺ دراسة مشروع جديد</button></div>`;
  const bindTop=()=>{ $('#wiReset',v).onclick=()=>ask('ستُمسح إجابات الدراسة الحالية وتبدأ الأسئلة من جديد لمشروع آخر.',()=>{ delete Store.data.wiStudies[WI_KEY]; Store.save(); st.opt=''; st.step=0; M.whatif.render(v); },'دراسة جديدة'); };
  const disp=f=>{ const x=val[f.id]; if(f.opts) return f.opts[x]?.l||'—'; if(!x&&['qOffer','qCash'].includes(f.id)) return f.id==='qCash'?'غير محددة':'لا يوجد'; if(f.id==='qH') return wiYrs(x); if(f.id==='qRamp') return x?`${x} شهر`:'فوري'; return `${Number(x).toLocaleString('en-US')} ${f.u||''}`; };
  if(st.step!=null){ const i=Math.max(0,Math.min(Q.length-1,st.step)), f=Q[i], cur=val[f.id], sug=f.def(val,S), from=f.src&&f.src(S);
    const W=WI_WHY[f.id]||[], full=val.qUnits*val.qRent, occI=Q.findIndex(q=>q.id==='qOcc'), atOcc=full*(val.qOcc/100);
    const side=`<aside class="card wzside"><h4>لماذا نسأل؟</h4><p>${esc(W[0]||'')}</p><h4>كيف يدخل في الحساب</h4><p>${esc(W[1]||'')}</p>${W[2]?`<h4>نصيحة</h4><p>${esc(W[2])}</p>`:''}
      <div class="wzlive"><div class="small muted">حسب إجاباتك حتى الآن (سنوياً)</div>
        <div><span>الدخل الكامل</span><b>${short(full)}</b></div>
        <div><span>الدخل بإشغال ${val.qOcc}%</span><b>${short(atOcc)}</b></div>
        <div><span>المسدد للهيئة الملكية</span><b class="neg">${val.auth?'-'+short(val.auth):'0'}</b></div>
        <div class="tot"><span>المتبقي قبل التشغيل</span><b class="${atOcc-val.auth<0?'neg':''}">${short(atOcc-val.auth)}</b></div></div></aside>`;
    v.innerHTML=`${toolbar}<div class="wizw"><div class="card wiz"><div class="wzp"><span>السؤال ${i+1} من ${Q.length}</span><div class="bar gold"><i style="width:${Math.round((i+1)/Q.length*100)}%"></i></div></div>
      <div class="wzdots">${Q.map((q,j)=>`<button type="button" class="${j===i?'on':''} ${sv.t[q.id]?'ok':''}" data-j="${j}" title="${esc(q.s)}" aria-label="${esc(q.s)}"></button>`).join('')}</div>
      <h2 class="wzq">${esc(f.l)}</h2>${f.hint?`<p class="muted wzh">${esc(f.hint)}</p>`:''}
      ${f.opts?`<div class="wzo">${Object.entries(f.opts).map(([a,o])=>`<button type="button" class="wzb ${cur===a?'on':''}" data-a="${a}">${o.l}</button>`).join('')}</div>`
        :`<div class="wzn"><input id="wzI" type="number" inputmode="decimal" ${f.min!=null?`min="${f.min}"`:''} ${f.max!=null?`max="${f.max}"`:''} value="${Math.round(cur*100)/100}"><span>${f.u||''}</span></div>
        ${f.req&&!sug?'<div class="small muted wzs">أدخل الرقم الصحيح لمشروعك</div>':''}<div class="small muted wzs" ${f.req&&!sug?'hidden':''}>المقترح: <b>${Number(sug).toLocaleString('en-US')} ${f.u||''}</b>${from?` · ${from}`:''} ${sug!==cur?`<button type="button" class="lnk" id="wzSug">استخدمه</button>`:''}</div>`}
      <div class="wzf"><button class="btn" id="wzBack" ${i?'':'disabled'}>السابق</button><span class="sp"></span>${sv.done?'<button class="btn" id="wzRes">النتيجة مباشرة</button>':''}<button class="btn p" id="wzNext">${i===Q.length-1?'عرض النتيجة':'التالي'}</button></div></div>${side}</div>`;
    bindTop();
    const save=x=>{ sv.v[f.id]=x; sv.t[f.id]=1; }, go=j=>{ if(j>=Q.length){ sv.done=1; st.step=null; } else st.step=Math.max(0,j); Store.save(); M.whatif.render(v); window.scrollTo({top:0,behavior:'smooth'}); };
    const readN=()=>{ let x=Number($('#wzI',v).value); if(!isFinite(x)) x=0; if(f.min!=null) x=Math.max(f.min,x); if(f.max!=null) x=Math.min(f.max,x); return x; };
    v.querySelectorAll('.wzb').forEach(b=>b.onclick=()=>{ v.querySelectorAll('.wzb').forEach(x=>x.classList.remove('on')); b.classList.add('on'); save(b.dataset.a); setTimeout(()=>go(i+1),180); });
    const inp=$('#wzI',v); if(inp){ inp.focus(); inp.select(); inp.onkeydown=e=>{ if(e.key==='Enter'){ if(need()) return; save(readN()); go(i+1); } }; }
    if($('#wzSug',v)) $('#wzSug',v).onclick=()=>{ $('#wzI',v).value=Math.round(sug*100)/100; $('#wzI',v).focus(); };
    const need=()=>{ if(inp&&f.req&&!(Number(inp.value)>0)){ toast('هذا السؤال مطلوب لحساب الدخل',true); inp.focus(); return true; } return false; };
    $('#wzNext',v).onclick=()=>{ if(need()) return; if(inp) save(readN()); else if(!sv.t[f.id]) save(cur); go(i+1); };
    $('#wzBack',v).onclick=()=>{ if(inp) save(readN()); go(i-1); };
    if($('#wzRes',v)) $('#wzRes',v).onclick=()=>{ if(need()) return; if(inp) save(readN()); go(Q.length); };
    v.querySelectorAll('[data-j]').forEach(b=>b.onclick=()=>{ if(inp) save(readN()); go(Number(b.dataset.j)); });
    return; }
  if(!WI_OPTS[st.opt]) st.opt=D.best; const open=new Set([...v.querySelectorAll('details[open]')].map(d=>d.dataset.d));
  const tag=f=>sv.t[f.id]?'<span class="srcTag ok">مُدخل</span>':f.src&&f.src(S)?`<span class="srcTag">${f.src(S)}</span>`:'<span class="srcTag need">تقدير</span>';
  const FI=f=>`<div class="f ${f.g==='q'?'wq':''}"><label>${esc(f.l)} ${tag(f)}</label>${f.opts?`<select data-w="${f.id}">${Object.entries(f.opts).map(([a,o])=>`<option value="${a}" ${val[f.id]===a?'selected':''}>${o.l}</option>`).join('')}</select>`:`<div class="inpu"><input data-w="${f.id}" type="number" inputmode="decimal" value="${Math.round(val[f.id]*100)/100}">${f.u?`<span>${f.u}</span>`:''}</div>`}${f.hint?`<div class="small muted">${f.hint}</div>`:''}</div>`;
  const groups=[...new Set(WI_FD.filter(f=>f.g!=='q').map(f=>f.g))];
  const chk=WI_CHECK.map(([l,ids])=>{ const n=ids.filter(i=>sv.t[i]).length; return {l,s:n===ids.length?'ok':n?'part':'est'}; }), done=chk.filter(c=>c.s==='ok').length;
  const irrT=x=>x==null?'—':`${x.toFixed(1)}%`;
  const optCard=o=>{ const x=R[o], na=o==='inv'&&!val.qOffer; return `<button type="button" class="wopt ${o===D.best?'best':''} ${o===st.opt?'sel':''}" data-opt="${o}" style="--oc:${WI_OPTS[o].c}">
    <div class="wh"><span>${WI_OPTS[o].ic} ${WI_OPTS[o].l}</span>${o===D.best?'<span class="pill ok">موصى به</span>':''}</div>
    ${na?'<div class="small muted" style="padding:10px 0">لا يوجد عرض بعد. أقل عرض مقبول:<div class="wbig">'+(A.minOffer==null?'—':A.minOffer<1000?'أي عرض':num(Math.round(A.minOffer))+'</div>ر.س سنوياً<div>')+'</div></div>':`
    <div class="wbig">${short(x.val)}</div><div class="small muted">القيمة الحالية الصافية بعد علاوة المخاطر (${wiRate(val,o).toFixed(1)}%)</div>
    <dl><dt>صافي الربح على ${wiYrs(x.H)}</dt><dd>${short(x.total)}</dd><dt>صافي السنة الأولى</dt><dd>${short(x.y1)}</dd><dt>متوسط الربح السنوي</dt><dd>${short(x.avgProfit)}</dd><dt>العائد الداخلي</dt><dd>${o==='inv'&&!val.invCost?'بلا استثمار':irrT(x.irr)}</dd><dt>أقصى احتياج سيولة</dt><dd>${x.peak<0?short(-x.peak):'لا يوجد'}</dd><dt>فترة الاسترداد</dt><dd>${wiPb(x)}</dd><dt>المخاطر علينا</dt><dd>${WI_OPTS[o].risk}</dd></dl>`}</button>`; };
  const STRESS=[['الإشغال أقل بـ10 نقاط',{qOcc:val.qOcc-10}],['الإيجار أقل 10%',{qRent:val.qRent*0.9}],['التكاليف أعلى 15%',{fixed:val.fixed*1.15,varPct:val.varPct*1.15}],['تأخر بدء الإيرادات 6 أشهر',{setupM:val.setupM+6}],['التحصيل 85%',{coll:Math.min(val.coll,85)}],['العائد المطلوب +2%',{disc:val.disc+2}]].map(([l,o])=>{ const d=wiDecide(val,o); return {l,team:d.R.team.val,pm:d.R.pm.val,inv:d.R.inv.val,best:d.best}; });
  const sel=R[st.opt], rowsT=[['الإيرادات المحصّلة','rev'],['تكاليف التشغيل','opex'],['أتعاب شركة الإدارة','fee'],['المسدد للهيئة الملكية والالتزامات الأخرى','auth'],['التجهيز والتجديدات والسيولة','capex'],['التمويل (سحب وسداد)','fin'],['الزكاة والضرائب','zakat']].filter(([,key])=>sel.rows.some(r=>Math.abs(r[key])>0.5));
  v.innerHTML=`${toolbar}
  <div class="card mb"><div class="wsumh"><h3>إجاباتك</h3><span class="small muted">اضغط أي إجابة لتعديلها</span><span class="sp"></span><button class="btn sm" id="wzRe">مراجعة الأسئلة من البداية</button></div>
    <div class="wsum">${Q.map((f,j)=>`<button type="button" class="wchip" data-j="${j}"><span>${esc(f.s)}</span><b>${esc(disp(f))}</b></button>`).join('')}</div></div>
  <div class="card rec ${A.tone} mb">
    <h3>${D.best?WI_OPTS[D.best].ic+' ':''}${A.title}</h3>${A.action?`<p style="margin:-4px 0 10px"><b>${A.action}</b></p>`:''}
    <div class="grid g2 wrec"><div><div class="small muted" style="margin-bottom:6px">لماذا</div><ul class="why">${A.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>
    <div><div class="small muted" style="margin-bottom:6px">الخطوات المقترحة</div><ol class="why">${A.plan.map(w=>`<li>${esc(w)}</li>`).join('')}</ol></div></div>
  </div>
  <div class="grid g3 mb wopts">${['team','pm','inv'].map(optCard).join('')}</div>
  <div class="grid g2 mb">
    <div class="card"><h3>اختبار الضغط <span class="small muted">القيمة الحالية لكل بديل لو تغيّر افتراض واحد</span></h3><div class="twrap"><table class="tbl wit"><thead><tr><th>السيناريو</th><th>🏠 فريقنا</th><th>🧰 شركة إدارة</th><th>🤝 مستثمر</th><th>التوصية</th></tr></thead><tbody>
      <tr><td><b>الأساس</b></td><td>${short(R.team.val)}</td><td>${short(R.pm.val)}</td><td>${val.qOffer?short(R.inv.val):'—'}</td><td><b>${WI_OPTS[D.best].ic}</b></td></tr>
      ${STRESS.map(s=>`<tr><td>${s.l}</td><td class="${s.team<0?'neg':''}">${short(s.team)}</td><td class="${s.pm<0?'neg':''}">${short(s.pm)}</td><td>${val.qOffer?short(s.inv):'—'}</td><td class="${s.best!==D.best?'flip':''}">${WI_OPTS[s.best].ic}${s.best!==D.best?' تتغير':''}</td></tr>`).join('')}
    </tbody></table></div><div class="small muted" style="margin-top:8px">${STRESS.every(s=>s.best===D.best)?'التوصية ثابتة في كل السيناريوهات، فهي قرار متين.':'التوصية تتغير في بعض السيناريوهات، فتأكد من الافتراض المعني قبل القرار.'}</div></div>
    <div class="card"><h3>اكتمال الدراسة <span class="small muted">${done} من ${chk.length} مدخلات مؤكدة</span></h3><div class="wchk">${chk.map(c=>`<span class="${c.s}">${c.s==='ok'?'✓':c.s==='part'?'◐':'○'} ${c.l}</span>`).join('')}</div>
      <div class="small muted" style="margin-top:10px">✓ أكّدته بنفسك · ◐ جزئي · ○ تقدير تلقائي. كل ما تعدّله يُحفظ لهذه الاتفاقية.</div></div>
  </div>
  <details class="card mb" data-d="as" ${open.has('as')?'open':''}><summary><b>الافتراضات التفصيلية</b> <span class="small muted">الاستثمار والإيرادات والتكاليف وعرض المستثمر والتجديدات والتمويل والزكاة</span></summary>
    ${groups.map(g=>`<h4 class="wg">${g}</h4><div class="form">${WI_FD.filter(f=>f.g===g).map(FI).join('')}</div>`).join('')}</details>
  <details class="card" data-d="cf" ${open.has('cf')?'open':''}><summary><b>التدفقات السنوية</b> <span class="small muted">${WI_OPTS[st.opt].ic} ${WI_OPTS[st.opt].l} · اضغط أي بديل أعلاه لعرضه</span></summary>
    <div class="twrap" style="margin-top:12px"><table class="tbl cft"><thead><tr><th>البند</th>${sel.rows.map(r=>`<th>سنة ${r.y}</th>`).join('')}<th>الإجمالي</th></tr></thead><tbody>
      ${rowsT.map(([l,key])=>`<tr><td>${l}</td>${sel.rows.map(r=>`<td class="${r[key]<0?'neg':''}">${num(Math.round(r[key]))}</td>`).join('')}<td><b>${num(Math.round(sel.rows.reduce((s,r)=>s+r[key],0)))}</b></td></tr>`).join('')}
      <tr class="net"><td>صافي التدفق</td>${sel.rows.map(r=>`<td class="${r.net<0?'neg':''}">${num(Math.round(r.net))}</td>`).join('')}<td><b>${num(Math.round(sel.total))}</b></td></tr>
      <tr class="net"><td>الرصيد التراكمي</td>${sel.rows.map(r=>`<td class="${r.cum<0?'neg':''}">${num(Math.round(r.cum))}</td>`).join('')}<td></td></tr>
    </tbody></table></div>
    <div class="chart" style="margin-top:14px"><canvas id="wiC"></canvas></div>
    <div class="small muted" style="margin-top:8px">النموذج شهري: التجهيز يُصرف على أشهره، الإشغال يتصاعد حتى يستقر، الإيجار والتكاليف تنمو سنوياً، دفعات المستثمر حسب مواعيدها بعد فترة السماح، والزكاة تُحسب على ربح كل سنة. السيولة التشغيلية تُحجز عند البدء وتعود بالنهاية، والقيمة المتبقية تُضاف في آخر شهر.</div>
  </details>`;
  bindTop(); $('#wzRe',v).onclick=()=>{ st.step=0; M.whatif.render(v); window.scrollTo({top:0,behavior:'smooth'}); };
  v.querySelectorAll('.wchip').forEach(b=>b.onclick=()=>{ st.step=Number(b.dataset.j); M.whatif.render(v); window.scrollTo({top:0,behavior:'smooth'}); });
  v.querySelectorAll('[data-w]').forEach(i=>i.onchange=()=>{ const f=WI_BY[i.dataset.w]; sv.v[f.id]=f.opts?i.value:(Number(i.value)||0); sv.t[f.id]=1; Store.save(); M.whatif.render(v); });
  v.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{ st.opt=b.dataset.opt; const d=v.querySelector('details[data-d="cf"]'); M.whatif.render(v); const n=v.querySelector('details[data-d="cf"]'); n.open=true; n.scrollIntoView({behavior:'smooth',block:'start'}); });
  const yl=['الآن',...sel.rows.map(r=>`سنة ${r.y}`)];
  Charts.make('wiC','line',yl,['team','pm','inv'].filter(o=>o!=='inv'||val.qOffer).map(o=>({label:WI_OPTS[o].l,data:[Math.round(R[o].cum[0]),...R[o].rows.map(r=>Math.round(r.cum))],color:WI_OPTS[o].c,fill:false,borderWidth:o===D.best?3.5:2})));
}};

const CFView={scope:'all'};
M.cashflow={key:'cashflow',label:'التدفقات النقدية والاسترداد',icon:'💵',group:'الرئيسية',render(v){
  const st=CFView, cur=curMo(), months=[]; for(let i=-11;i<=12;i++) months.push(addMo(cur,i)); const nA=12;
  const all=opAgreements(), K=st.scope==='all'?all:OP_TYPES.includes(st.scope)?all.filter(k=>k.type===st.scope):all.filter(k=>k.id===st.scope);
  const C=cfAggregate(K,months), sA=a=>a.slice(0,nA).reduce((s,x)=>s+x,0), sF=a=>a.slice(nA).reduce((s,x)=>s+x,0);
  const fNet=C.net.slice(nA), minI=fNet.indexOf(Math.min(...fNet)), PB=K.map(k=>({k,...payback(k)})), invT=sum(PB,'inv'), recT=sum(PB,'recovered');
  const scopeLbl=st.scope==='all'?'كل الاتفاقيات':OP_TYPES.includes(st.scope)?AG_LABEL[st.scope]:Store.get('contracts',st.scope)?.title;
  const cell=x=>x?num(x):'<span class="muted">—</span>';
  v.innerHTML=`<div class="toolbar"><select id="cfS" style="width:auto"><option value="all">كل الاتفاقيات</option><option value="تشغيل ذاتي" ${st.scope==='تشغيل ذاتي'?'selected':''}>التشغيل الذاتي</option><option value="مستثمر" ${st.scope==='مستثمر'?'selected':''}>إسناد التشغيل لمستثمر</option>${all.map(k=>`<option value="${k.id}" ${st.scope===k.id?'selected':''}>— ${esc(k.type==='مستثمر'?k.party:k.title)}</option>`).join('')}</select><span class="small muted">فعلي آخر 12 شهراً حتى ${cur}، ومتوقع 12 شهراً قادمة</span></div>
  <div class="grid g4 mb">
    <div class="card kpi" style="--kc:var(--green)"><div class="l">صافي التدفق الفعلي (12 شهر)</div><div class="v">${short(sA(C.net))}</div><div class="s">داخل ${short(sA(C.inflow))} · خارج ${short(sA(C.outflow))}</div></div>
    <div class="card kpi" style="--kc:var(--sky)"><div class="l">صافي التدفق المتوقع (12 شهر)</div><div class="v">${short(sF(C.net))}</div><div class="s">داخل ${short(sF(C.inflow))} · خارج ${short(sF(C.outflow))}</div></div>
    <div class="card kpi" style="--kc:var(--red)"><div class="l">أضعف شهر متوقع</div><div class="v">${short(fNet[minI]||0)}</div><div class="s">${months[nA+minI]||'—'}${(fNet[minI]||0)<0?' · سيولة سالبة، جهّز تغطية':''}</div></div>
    <div class="card kpi" style="--kc:var(--gold)"><div class="l">الاستثمار المسترد حتى الآن</div><div class="v">${pct(recT,invT)}%</div><div class="s">${short(recT)} من ${short(invT)}</div><div class="bar gold" style="margin-top:6px"><i style="width:${pct(recT,invT)}%"></i></div></div>
  </div>
  <div class="card mb"><h3>التدفق الشهري والرصيد التراكمي <span class="small muted">${esc(scopeLbl||'')}</span></h3><div class="chart tall"><canvas id="cfc"></canvas></div><div class="small muted" style="margin-top:6px">الأشهر بعد ${cur} تقديرية. الإيرادات والتكاليف الأخرى للتشغيل الذاتي مقدرة بمتوسط آخر 6 أشهر، ودفعات المستثمرين والهيئة والمقاولين حسب دورية كل عقد.</div></div>
  ${st.scope==='all'?`<div class="card mb"><h3>التدفق حسب نوع الاتفاقية</h3><div class="twrap"><table class="tbl"><thead><tr><th>النوع</th><th>داخل فعلي</th><th>خارج فعلي</th><th>صافي فعلي</th><th class="fc">داخل متوقع</th><th class="fc">خارج متوقع</th><th class="fc">صافي متوقع</th></tr></thead><tbody>
    ${['تشغيل ذاتي','مستثمر'].map(t=>{ const X=cfAggregate(all.filter(k=>k.type===t),months); return `<tr class="clk" data-sc="${t}"><td><b>${AG_LABEL[t]}</b></td><td>${num(sA(X.inflow))}</td><td>${num(sA(X.outflow))}</td><td><b>${num(sA(X.net))}</b></td><td class="fc">${num(sF(X.inflow))}</td><td class="fc">${num(sF(X.outflow))}</td><td class="fc"><b>${num(sF(X.net))}</b></td></tr>`; }).join('')}
    <tr><td><b>الإجمالي</b></td><td>${num(sA(C.inflow))}</td><td>${num(sA(C.outflow))}</td><td><b>${num(sA(C.net))}</b></td><td class="fc">${num(sF(C.inflow))}</td><td class="fc">${num(sF(C.outflow))}</td><td class="fc"><b>${num(sF(C.net))}</b></td></tr></tbody></table></div></div>`:''}
  <div class="card mb" style="padding:0"><div style="padding:16px 18px 0"><h3>قائمة التدفقات النقدية الشهرية</h3></div><div class="twrap"><table class="tbl cft"><thead><tr><th>البند</th>${months.map((m,i)=>`<th class="${i>=nA?'fc':''}">${m}<div class="small">${i>=nA?'متوقع':'فعلي'}</div></th>`).join('')}<th>فعلي 12 شهر</th><th class="fc">متوقع 12 شهر</th></tr></thead><tbody>
    <tr class="sec"><td colspan="${months.length+3}">التدفقات الداخلة</td></tr>
    ${CF_IN.map(c=>`<tr><td>${c.l}</td>${C.T[c.k].map((x,i)=>`<td class="${i>=nA?'fc':''}">${cell(x)}</td>`).join('')}<td>${num(sA(C.T[c.k]))}</td><td class="fc">${num(sF(C.T[c.k]))}</td></tr>`).join('')}
    <tr class="tot"><td>إجمالي الداخل</td>${C.inflow.map((x,i)=>`<td class="${i>=nA?'fc':''}">${num(x)}</td>`).join('')}<td>${num(sA(C.inflow))}</td><td class="fc">${num(sF(C.inflow))}</td></tr>
    <tr class="sec"><td colspan="${months.length+3}">التدفقات الخارجة</td></tr>
    ${CF_OUT.map(c=>`<tr><td>${c.l}</td>${C.T[c.k].map((x,i)=>`<td class="${i>=nA?'fc':''}">${cell(x)}</td>`).join('')}<td>${num(sA(C.T[c.k]))}</td><td class="fc">${num(sF(C.T[c.k]))}</td></tr>`).join('')}
    <tr class="tot"><td>إجمالي الخارج</td>${C.outflow.map((x,i)=>`<td class="${i>=nA?'fc':''}">${num(x)}</td>`).join('')}<td>${num(sA(C.outflow))}</td><td class="fc">${num(sF(C.outflow))}</td></tr>
    <tr class="net"><td>صافي التدفق</td>${C.net.map((x,i)=>`<td class="${i>=nA?'fc':''} ${x<0?'neg':''}">${num(x)}</td>`).join('')}<td>${num(sA(C.net))}</td><td class="fc">${num(sF(C.net))}</td></tr>
    <tr class="net"><td>الرصيد التراكمي</td>${C.cum.map((x,i)=>`<td class="${i>=nA?'fc':''} ${x<0?'neg':''}">${num(x)}</td>`).join('')}<td></td><td class="fc"></td></tr>
  </tbody></table></div></div>
  <div class="card"><h3>فترة الاسترداد لكل اتفاقية</h3><div class="twrap"><table class="tbl"><thead><tr><th>الاتفاقية</th><th>النوع</th><th>التكلفة الاستثمارية</th><th>صافي التدفق السنوي</th><th>فترة الاسترداد</th><th>تاريخ الاسترداد المتوقع</th><th>مدة الاتفاقية</th><th>المسترد حتى الآن</th><th></th></tr></thead><tbody>
    ${PB.map(x=>`<tr><td>${esc(x.k.type==='مستثمر'?x.k.party:x.k.title)}<div class="small muted">${esc(x.k.number)}</div></td><td>${pill(AG_LABEL[x.k.type])}</td><td>${x.inv?num(x.inv):'—'}</td><td>${num(x.annual)}</td><td>${paybackTxt(x)}</td><td class="num">${x.date||'—'}</td><td>${x.term?`${x.term.toFixed(1)} سنة ${x.withinTerm===false?'<span class="pill bad">الاسترداد بعد نهاية الاتفاقية</span>':x.withinTerm?'<span class="pill ok">ضمن المدة</span>':''}`:'—'}</td><td style="min-width:140px">${x.inv?`<div class="bar gold"><i style="width:${x.pctRec}%"></i></div><span class="small muted">${x.pctRec}% · ${short(x.recovered)}</span>`:'—'}</td><td>${can('edit')?`<button class="btn sm" data-inv="${x.k.id}">✎</button>`:''}</td></tr>`).join('')}
  </tbody></table></div><div class="small muted" style="margin-top:8px">فترة الاسترداد = التكلفة الاستثمارية الأولية ÷ صافي ربح الاتفاقية السنوي بعد سداد الهيئة. المسترد حتى الآن تقدير بالربح السنوي منذ بداية الاتفاقية.</div></div>`;
  $('#cfS',v).onchange=e=>{ st.scope=e.target.value; M.cashflow.render(v); };
  v.querySelectorAll('[data-sc]').forEach(r=>r.onclick=()=>{ st.scope=r.dataset.sc; M.cashflow.render(v); });
  v.querySelectorAll('[data-inv]').forEach(b=>b.onclick=()=>{ const k=Store.get('contracts',b.dataset.inv);
    Modal.open({title:`التكلفة الاستثمارية: ${esc(k.title)}`,body:`<div class="form"><div class="f full"><label>ما صرفناه لتجهيز الأصل وتشغيله (ر.س)</label><input id="ivA" type="number" value="${k.investment??''}"></div></div><p class="small muted" style="margin-top:8px">مثل تكاليف التطوير والتشطيب والتجهيز ورسوم التعاقد.</p>`,footer:`<button class="btn" onclick="Modal.close()">إلغاء</button><button class="btn p" id="ivS">حفظ</button>`});
    $('#ivS').onclick=()=>{ Store.update('contracts',k.id,{investment:Number($('#ivA').value)||0}); Modal.close(); M.cashflow.render(v); }; });
  Charts.make('cfc','bar',months,[{label:'الداخل',data:C.inflow,color:'#3d6b8a'},{label:'الخارج',data:C.outflow.map(x=>-x),color:'#c25a4a'},{label:'الرصيد التراكمي',data:C.cum,type:'line',color:'#b8963e',backgroundColor:'transparent',pointRadius:2,borderWidth:2.5}]);
}};

/* التنبيهات (صفحة كاملة) */
M.alerts={key:'alerts',label:'التنبيهات',icon:'🔔',group:'الرئيسية',render(v){ const a=computeAlerts(); v.innerHTML=`<div class="card"><h3>كل التنبيهات (${a.length})</h3>${alertsHtml(a)}</div>`; }};

/* الإعدادات */
M.system={key:'system',label:'الإعدادات والنسخ',icon:'⚙️',group:'متقدم',render(v){
  v.innerHTML=`<div class="grid g2"><div class="card"><h3>بيانات النظام</h3><div class="form"><div class="f"><label>اسم المشروع</label><input id="pn" value="${esc(Store.data.settings.projectName)}"></div><div class="f"><label>العملة</label><input id="cur" value="${esc(Store.data.settings.currency)}"></div></div><button class="btn p" id="sv" style="margin-top:12px">حفظ</button></div>
  <div class="card"><h3>النسخ الاحتياطي والبيانات</h3><p class="small muted">البيانات محفوظة محلياً في هذا المتصفح. صدّر نسخة احتياطية بانتظام، وعند الرفع للإنتاج ننقلها إلى قاعدة بيانات سحابية.</p><div class="toolbar" style="margin-top:12px"><button class="btn ${IN_FRAME?'hidden':''}" id="ex">⬇ تصدير JSON</button><label class="btn">⬆ استيراد JSON<input type="file" id="im" accept=".json" class="hidden"></label><button class="btn d" id="rs">↺ إعادة البيانات التجريبية</button></div>
  <div class="small muted" style="margin-top:10px">السجلات: ${['assets','contracts','documents','finance','clients','payments','audit'].map(c=>`${c} ${Store.coll(c).length}`).join(' · ')}</div></div></div>`;
  $('#sv',v).onclick=()=>{ Store.data.settings.projectName=$('#pn',v).value; Store.data.settings.currency=$('#cur',v).value; Store.save(); toast('تم الحفظ'); };
  $('#ex',v).onclick=()=>Store.export(); $('#im',v).onchange=e=>e.target.files[0]&&Store.import(e.target.files[0]);
  $('#rs',v).onclick=()=>ask('سيتم حذف كل البيانات المحلية وإعادة البيانات التجريبية.',()=>{ Store.reset(); location.reload(); },'إعادة البيانات');
}};

/* ───────────────────────── App / Router ───────────────────────── */
const NAV_ORDER=['dashboard','cashflow','whatif','agreements','alerts','operations','investor','assets','documents','contracts','finance','users','reports','gis','system'];
const App={
  user:null,
  init(){
    Store.load(); Store.syncSeed();
    const savedUser=ls.get('am_user')||'u1'; this.user=Store.get('users',savedUser)||Store.coll('users')[0];
    const us=$('#userSel'); us.innerHTML=Store.coll('users').map(u=>`<option value="${u.id}" ${u.id===this.user.id?'selected':''}>${esc(u.name)} — ${ROLES[u.role]}</option>`).join('');
    us.onchange=()=>{ this.user=Store.get('users',us.value); ls.set('am_user',us.value); this.render(); };
    const theme=ls.get('am_theme'); if(theme) document.documentElement.dataset.theme=theme;
    $('#themeBtn').onclick=()=>{ const d=document.documentElement.dataset.theme==='dark'?'':'dark'; document.documentElement.dataset.theme=d; ls.set('am_theme',d); this.render(); };
    $('#alertsBtn').onclick=()=>location.hash='#alerts';
    this.buildNav(); window.addEventListener('hashchange',()=>this.render()); this.render();
  },
  buildNav(){
    let html=`<div class="brand"><div class="mark">${MADAR_MARK}</div><div><h1>مدار الأصول<small>منصة إدارة الأصول العقارية</small></h1></div></div></div>`; let g='';
    NAV_ORDER.forEach(k=>{ const m=M[k]; if(m.group!==g){ g=m.group; html+=`<div class="group">${g}</div>`; } html+=`<a class="item" href="#${k}" data-k="${k}"><span class="ic">${m.icon}</span>${m.label}<span class="badge hidden" data-b="${k}"></span></a>`; });
    $('#nav').innerHTML=html; this.refreshBadges();
  },
  refreshBadges(){
    const b={alerts:computeAlerts().length};
    Object.entries(b).forEach(([k,n])=>{ const el=$(`[data-b="${k}"]`); if(el){ el.textContent=n; el.classList.toggle('hidden',!n); } });
    $('#alertCount').textContent=b.alerts;
  },
  render(){
    Charts.destroy(); Modal.close();
    const h=location.hash.replace(/^#\/?/,'').replace(/^asset\//,'asset-')||'dashboard';
    if(h.startsWith('asset-')){ const a=Store.get('assets',h.slice(6)); M.assets.render($('#view')); if(a) assetDetail(a); this.setTitle('assets'); return; }
    const m=M[h]||M.dashboard; this.setTitle(m.key); m.render($('#view')); window.scrollTo(0,0); $('#nav').classList.remove('open');
  },
  setTitle(k){ $('#pageTitle').textContent=M[k].label; document.querySelectorAll('.nav .item').forEach(a=>a.classList.toggle('active',a.dataset.k===k)); }
};
document.addEventListener('DOMContentLoaded',()=>App.init());
