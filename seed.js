/* بيانات أولية تجريبية — تُحمَّل مرة واحدة ثم تُحفظ محلياً في المتصفح */
window.SEED = (function(){
  const today = new Date();
  const d = (offsetDays)=>{ const x=new Date(today); x.setDate(x.getDate()+offsetDays); return x.toISOString().slice(0,10); };
  const m = (offsetMonths)=>{ const x=new Date(today); x.setMonth(x.getMonth()+offsetMonths,1); return x.toISOString().slice(0,7); };

  const users = [
    {id:'u1', name:'مدير النظام', role:'admin', email:'admin@local'},
    {id:'u2', name:'مدير الأصول', role:'manager', email:'manager@local'},
    {id:'u3', name:'مهندس تشغيل', role:'engineer', email:'eng@local'},
    {id:'u4', name:'محاسب', role:'finance', email:'fin@local'},
    {id:'u5', name:'مطّلع', role:'viewer', email:'viewer@local'},
  ];

  // الهيكل: مشروع ← حي ← مبنى ← وحدة ← معدات
  const assets = [
    {id:'A-0002', code:'D-A', name:'حي النخيل (A)', level:'district', parentId:null, type:'حي', location:'الجهة الشمالية', area:120000, ownership:'مخصص', value:300000000, condition:'جيد', status:'قيد التشغيل', operatingModel:'self', x:30,y:35},
    {id:'A-0003', code:'D-B', name:'حي العزيزية (B)', level:'district', parentId:null, type:'حي', location:'الجهة الجنوبية', area:140000, ownership:'مخصص', value:320000000, condition:'جيد', status:'قيد التشغيل', operatingModel:'investor', x:65,y:60},
    {id:'A-0005', code:'B-A-04', name:'بلوك 4', level:'building', parentId:'A-0002', type:'بلوك فلل', location:'حي النخيل', area:18000, ownership:'مخصص', value:62000000, condition:'جيد', status:'قيد التشغيل', operatingModel:'self', x:25,y:30},
    {id:'A-0006', code:'B-A-05', name:'بلوك 5', level:'building', parentId:'A-0002', type:'بلوك فلل', location:'حي النخيل', area:17500, ownership:'مخصص', value:60000000, condition:'مقبول', status:'قيد التشغيل', operatingModel:'self', x:35,y:40},
    {id:'A-0007', code:'B-B-09', name:'بلوك 9', level:'building', parentId:'A-0003', type:'بلوك فلل', location:'حي العزيزية', area:21000, ownership:'مخصص', value:71000000, condition:'جيد', status:'قيد التشغيل', operatingModel:'investor', x:62,y:55},
    {id:'A-0008', code:'B-C-MALL', name:'المركز التجاري', level:'building', parentId:null, type:'تجاري', location:'الوسط', area:9000, ownership:'مخصص', value:55000000, condition:'ممتاز', status:'قيد التشغيل', operatingModel:'investor', x:52,y:72},
    {id:'A-0010', code:'V-4-01', name:'فيلا 4-01', level:'unit', parentId:'A-0005', type:'فيلا نموذج A', location:'بلوك 4', area:320, ownership:'مخصص', value:1450000, condition:'جيد', status:'مؤجر', operatingModel:'self', occupancy:'مشغول', tenantId:'C-001', rent:65000},
    {id:'A-0011', code:'V-4-02', name:'فيلا 4-02', level:'unit', parentId:'A-0005', type:'فيلا نموذج A', location:'بلوك 4', area:320, ownership:'مخصص', value:1450000, condition:'جيد', status:'مؤجر', operatingModel:'self', occupancy:'مشغول', tenantId:'C-002', rent:65000},
    {id:'A-0012', code:'V-4-03', name:'فيلا 4-03', level:'unit', parentId:'A-0005', type:'فيلا نموذج A', location:'بلوك 4', area:320, ownership:'مخصص', value:1450000, condition:'ممتاز', status:'شاغر', operatingModel:'self', occupancy:'شاغر', rent:65000},
    {id:'A-0013', code:'V-5-01', name:'فيلا 5-01', level:'unit', parentId:'A-0006', type:'فيلا نموذج B1', location:'بلوك 5', area:280, ownership:'مخصص', value:1250000, condition:'مقبول', status:'مؤجر', operatingModel:'self', occupancy:'مشغول', tenantId:'C-003', rent:58000},
    {id:'A-0014', code:'V-5-02', name:'فيلا 5-02', level:'unit', parentId:'A-0006', type:'فيلا نموذج B1', location:'بلوك 5', area:280, ownership:'مخصص', value:1250000, condition:'يحتاج صيانة', status:'شاغر', operatingModel:'self', occupancy:'شاغر', rent:58000},
    {id:'A-0015', code:'V-9-01', name:'فيلا 9-01', level:'unit', parentId:'A-0007', type:'فيلا نموذج B2', location:'بلوك 9', area:300, ownership:'مخصص', value:1350000, condition:'جيد', status:'مؤجر', operatingModel:'investor', occupancy:'مشغول', rent:60000},
    {id:'A-0016', code:'EQ-4-01-AC', name:'وحدة تكييف مركزي', level:'equipment', parentId:'A-0010', type:'تكييف', location:'فيلا 4-01', area:0, ownership:'مخصص', value:45000, condition:'جيد', status:'يعمل', serial:'AC-88213', warrantyEnd:d(40), lifeYears:12},
    {id:'A-0017', code:'EQ-MALL-ELV', name:'مصعد رئيسي', level:'equipment', parentId:'A-0008', type:'مصاعد', location:'المركز التجاري', area:0, ownership:'مخصص', value:380000, condition:'جيد', status:'يعمل', serial:'ELV-2291', warrantyEnd:d(400), lifeYears:20},
  ];


  // مشروع فلل العزيزة: 17 عمارة × 10 شقق
  assets.push({id:'AZ-P', code:'PRJ-02', name:'مشروع فلل العزيزة', level:'project', parentId:null, type:'مشروع سكني', location:'العزيزة', area:'', ownership:'مخصص', value:'', condition:'جيد', status:'قيد التشغيل', operatingModel:'self', x:50,y:50});
  for(let b=1;b<=17;b++){
    const bid='AZ-B'+String(b).padStart(2,'0');
    assets.push({id:bid, code:'AZ-'+String(b).padStart(2,'0'), name:'عمارة '+b, level:'building', parentId:'AZ-P', type:'عمارة سكنية', location:'فلل العزيزة', area:'', ownership:'مخصص', value:'', condition:'جيد', status:'قيد التشغيل', operatingModel:'self'});
    for(let u=1;u<=10;u++){
      assets.push({id:bid+'-U'+String(u).padStart(2,'0'), code:'AZ-'+String(b).padStart(2,'0')+'-'+String(u).padStart(2,'0'), name:'شقة '+u+' - عمارة '+b, level:'unit', parentId:bid, type:'شقة', location:'عمارة '+b, area:'', ownership:'مخصص', value:'', condition:'جيد', status:'شاغر', operatingModel:'self', occupancy:'شاغر', rent:''});
    }
  }

  const contracts = [
    {id:'K-001', number:'FW-2023-01', type:'إطارية', title:'الاتفاقية الإطارية مع الجهة المالكة', party:'الهيئة الملكية', assetId:'', start:d(-900), end:d(10000), value:0, obligations:'تطوير وتشغيل المشروع وفق المخططات المعتمدة', status:'ساري', renewal:'تلقائي', notes:'الأساس التعاقدي لكل ما يليها'},
    {id:'K-002', number:'ALC-2024-01', type:'تخصيص', title:'اتفاقية تخصيص المشروع لنا', party:'الهيئة الملكية', assetId:'', start:d(-600), end:d(9000), value:0, obligations:'إدارة الأصول وتشغيلها؛ المبلغ المستحق للهيئة يُحدد في كل اتفاقية تشغيلية', status:'ساري', renewal:'بموجب الإطارية', parentId:'K-001'},
    {id:'K-003', investment:1500000, number:'INV-2025-03', type:'مستثمر', title:'عقد تشغيل حي العزيزية مع مستثمر', party:'شركة عمران للاستثمار', assetId:'A-0003', start:d(-300), end:d(75), value:12000000, payToAuthority:3200000, payFromInvestor:4500000, period:'سنوي', scope:'التشغيل الكامل: التأجير والتحصيل والصيانة والأمن والنظافة وإدارة المرافق لحي العزيزية', obligations:'سداد المبلغ السنوي لنا في موعده وتقديم تقرير ربع سنوي وتسليم الأصل بحالة جيدة عند الانتهاء', status:'ساري', renewal:'يحتاج قرار', parentId:'K-002'},
    {id:'K-004', investment:800000, number:'INV-2025-07', type:'مستثمر', title:'عقد تشغيل المركز التجاري', party:'مجموعة الواحة التجارية', assetId:'A-0008', start:d(-200), end:d(500), value:8000000, payToAuthority:1500000, payFromInvestor:2600000, period:'سنوي', scope:'إدارة وتأجير المحلات وصيانة المبنى والمواقف والمرافق المشتركة', obligations:'سداد سنوي مقدم وتأمين المبنى والالتزام بالاشتراطات', status:'ساري', renewal:'قابل للتجديد', parentId:'K-002'},
    {id:'K-009', investment:12000000, number:'SELF-2025-01', type:'تشغيل ذاتي', title:'اتفاقية تشغيل ذاتي لحي النخيل', party:'الهيئة الملكية', assetId:'A-0002', start:d(-400), end:d(2500), value:0, payToAuthority:2000000, period:'سنوي', scope:'نحن المسؤولون: التأجير والتحصيل والصيانة وإدارة المرافق', obligations:'سداد المبلغ السنوي للهيئة والمحافظة على الأصل', status:'ساري', renewal:'بموجب التخصيص', parentId:'K-002'},
    {id:'K-010', investment:8000000, number:'SELF-2026-02', type:'تشغيل ذاتي', title:'اتفاقية تشغيل ذاتي لمشروع فلل العزيزة', party:'الهيئة الملكية', assetId:'AZ-P', start:d(-30), end:d(3600), value:0, payToAuthority:'', period:'سنوي', scope:'نحن المسؤولون: تأجير 170 شقة وتحصيلها وصيانتها', obligations:'', status:'ساري', renewal:'بموجب التخصيص', parentId:'K-002'},
    {id:'K-005', number:'OM-2025-02', type:'تشغيل وصيانة', title:'عقد صيانة المصاعد', party:'شركة الرفع الحديثة', assetId:'A-0017', start:d(-100), end:d(25), value:120000, obligations:'صيانة دورية شهرية واستجابة طارئة خلال 4 ساعات', status:'ساري', renewal:'قابل للتجديد'},
    {id:'K-006', number:'LS-2025-11', type:'إيجار', title:'عقد إيجار فيلا 4-01', party:'C-001', assetId:'A-0010', start:d(-120), end:d(245), value:65000, obligations:'سداد سنوي مقدم', status:'ساري', renewal:'قابل للتجديد'},
    {id:'K-007', number:'LS-2025-12', type:'إيجار', title:'عقد إيجار فيلا 4-02', party:'C-002', assetId:'A-0011', start:d(-340), end:d(20), value:65000, obligations:'سداد نصف سنوي', status:'ساري', renewal:'يحتاج قرار'},
    {id:'K-008', number:'LS-2026-01', type:'إيجار', title:'عقد إيجار فيلا 5-01', party:'C-003', assetId:'A-0013', start:d(-60), end:d(305), value:58000, obligations:'سداد ربع سنوي', status:'ساري', renewal:'قابل للتجديد'},
  ];

  const documents = [
    {id:'DOC-001', title:'صك الأرض الرئيسي', type:'صك', assetId:'', number:'3910021', issued:d(-1200), expiry:'', issuer:'كتابة العدل', status:'ساري'},
    {id:'DOC-002', title:'الاتفاقية الإطارية الموقعة', type:'عقد', assetId:'', number:'FW-2023-01', issued:d(-900), expiry:'', issuer:'الهيئة الملكية', status:'ساري'},
    {id:'DOC-003', title:'اتفاقية التخصيص', type:'عقد', assetId:'', number:'ALC-2024-01', issued:d(-600), expiry:'', issuer:'الهيئة الملكية', status:'ساري'},
    {id:'DOC-004', title:'المخطط الرئيسي المعتمد', type:'مخطط', assetId:'', number:'MP-07', issued:d(-800), expiry:'', issuer:'الاستشاري', status:'ساري'},
    {id:'DOC-005', title:'شهادة استلام بلوك 4', type:'شهادة استلام', assetId:'A-0005', number:'HO-04', issued:d(-200), expiry:'', issuer:'المقاول الرئيسي', status:'ساري'},
    {id:'DOC-006', title:'ضمان المصعد الرئيسي', type:'ضمان', assetId:'A-0017', number:'W-ELV-2291', issued:d(-330), expiry:d(400), issuer:'الشركة المصنعة', status:'ساري'},
    {id:'DOC-007', title:'ضمان وحدة التكييف 4-01', type:'ضمان', assetId:'A-0016', number:'W-AC-88213', issued:d(-690), expiry:d(40), issuer:'الوكيل', status:'ساري'},
    {id:'DOC-008', title:'وثيقة تأمين المركز التجاري', type:'تأمين', assetId:'A-0008', number:'INS-2025-44', issued:d(-250), expiry:d(115), issuer:'شركة التأمين', status:'ساري'},
  ];

  const finance = [];
  // تشغيل ذاتي: إيرادات ومصروفات فعلية. مستثمر: دفعات المستثمر لنا فقط (المستثمر يتحمل التشغيل)
  for(let i=11;i>=0;i--){
    const mo=m(-i);
    finance.push({id:`FN-R-${i}-0`, date:mo+'-05', kind:'إيراد', category:'إيجارات', assetId:'A-0002', amount:Math.round(520000*(0.92+Math.random()*0.16)), ref:'مصدر تجريبي'});
    finance.push({id:`FN-E-${i}-0`, date:mo+'-20', kind:'مصروف', category:'تشغيل وصيانة', assetId:'A-0002', amount:Math.round(520000*0.38*(0.9+Math.random()*0.2)), ref:'مصدر تجريبي'});
    finance.push({id:`FN-R-${i}-1`, date:mo+'-05', kind:'إيراد', category:'دفعة مستثمر', assetId:'A-0003', amount:375000, ref:'مصدر تجريبي'});
    finance.push({id:`FN-R-${i}-2`, date:mo+'-05', kind:'إيراد', category:'دفعة مستثمر', assetId:'A-0008', amount:216667, ref:'مصدر تجريبي'});
  }

  const clients = [
    {id:'C-001', name:'محمد العتيبي', idNo:'10xxxxxxx1', phone:'0551111111', email:'', kind:'مستأجر', assetId:'A-0010', status:'نشط', notes:''},
    {id:'C-002', name:'سارة الحربي', idNo:'10xxxxxxx2', phone:'0552222222', email:'', kind:'مستأجر', assetId:'A-0011', status:'نشط', notes:''},
    {id:'C-003', name:'خالد الشمري', idNo:'10xxxxxxx3', phone:'0553333333', email:'', kind:'مستأجر', assetId:'A-0013', status:'نشط', notes:''},
  ];

  // جداول دفعات المستأجرين (من عقود الإيجار)
  const payments = [];
  const sched=(clientId,assetId,contractId,start,annual,count)=>{ for(let i=0;i<count;i++){ const dt=new Date(start); dt.setMonth(dt.getMonth()+i*(12/count)); payments.push({id:`PY-${clientId}-${i+1}`, clientId, assetId, contractId, seq:i+1, dueDate:dt.toISOString().slice(0,10), amount:Math.round(annual/count), paid:0, paidDate:'', method:''}); } };
  sched('C-001','A-0010','K-006',d(-120),65000,1);
  sched('C-002','A-0011','K-007',d(-340),65000,2);
  sched('C-003','A-0013','K-008',d(-60),58000,4);
  payments.forEach(p=>{ if(p.clientId==='C-001'||(p.clientId==='C-002'&&p.seq===1)||(p.clientId==='C-003'&&p.seq===1)){ p.paid=p.amount; p.paidDate=p.dueDate; p.method='تحويل بنكي'; } });

  // مقاولو التشغيل والصيانة (في اتفاقيات التشغيل الذاتي)
  const contractors = [
    {id:'CT-001', name:'شركة الإتقان للتشغيل والصيانة', crNo:'4030xxxxxx', phone:'0501111111', email:'', specialty:'تشغيل وصيانة شاملة', contact:'م. فهد', status:'نشط'},
    {id:'CT-002', name:'مؤسسة البيئة النظيفة', crNo:'4031xxxxxx', phone:'0502222222', email:'', specialty:'نظافة وتشغيل مرافق', contact:'أ. ماجد', status:'نشط'},
  ];
  contracts.push(
    {id:'K-011', number:'OM-2026-01', type:'تشغيل وصيانة', title:'عقد تشغيل وصيانة حي النخيل', party:'شركة الإتقان للتشغيل والصيانة', contractorId:'CT-001', assetId:'A-0002', parentId:'K-009', start:d(-200), end:d(165), value:480000, period:'شهري', scope:'صيانة وقائية وتصحيحية للفلل والمرافق، تشغيل المضخات والإنارة، استجابة للطوارئ خلال 4 ساعات', status:'ساري', renewal:'قابل للتجديد'},
    {id:'K-012', number:'OM-2026-02', type:'تشغيل وصيانة', title:'عقد تشغيل ونظافة فلل العزيزة', party:'مؤسسة البيئة النظيفة', contractorId:'CT-002', assetId:'AZ-P', parentId:'K-010', start:d(-30), end:d(335), value:360000, period:'ربع سنوي', scope:'نظافة المداخل والممرات ورفع المخلفات وتشغيل المرافق المشتركة', status:'ساري', renewal:'قابل للتجديد'}
  );
  for(let i=5;i>=0;i--){ const x=new Date(today); x.setMonth(x.getMonth()-i,25); finance.push({id:`FN-OM-${i}`, date:x.toISOString().slice(0,10), kind:'مصروف', category:'عقد تشغيل وصيانة', assetId:'A-0002', amount:40000, ref:'K-011'}); }
  finance.push({id:'FN-OM-AZ1', date:d(-25), kind:'مصروف', category:'عقد تشغيل وصيانة', assetId:'AZ-P', amount:90000, ref:'K-012'});
  const evaluations = [
    {id:'EV-001', contractorId:'CT-001', contractId:'K-011', date:d(-90), quality:4, response:3, commitment:4, safety:5, notes:'تأخر في الاستجابة للبلاغات الطارئة'},
    {id:'EV-002', contractorId:'CT-001', contractId:'K-011', date:d(-30), quality:4, response:4, commitment:4, safety:4, notes:'تحسن في سرعة الاستجابة'},
    {id:'EV-003', contractorId:'CT-002', contractId:'K-012', date:d(-5), quality:3, response:3, commitment:4, safety:4, notes:'بداية العقد، مستوى النظافة متوسط'},
  ];
  const observations = [
    {id:'OB-001', contractorId:'CT-001', contractId:'K-011', assetId:'A-0005', date:d(-80), title:'تأخر في إصلاح إنارة الممرات', severity:'متوسطة', dueDate:d(-73), status:'مغلقة', closedDate:d(-75), closure:'تم استبدال الكشافات'},
    {id:'OB-002', contractorId:'CT-001', contractId:'K-011', assetId:'A-0002', date:d(-50), title:'عدم الالتزام بجدول الصيانة الوقائية للمضخات', severity:'عالية', dueDate:d(-40), status:'مغلقة', closedDate:d(-35), closure:'تم اعتماد جدول جديد والتزم به'},
    {id:'OB-003', contractorId:'CT-001', contractId:'K-011', assetId:'A-0002', date:d(-15), title:'نقص في معدات السلامة للفنيين', severity:'عالية', dueDate:d(-5), status:'مفتوحة', closedDate:'', closure:''},
    {id:'OB-004', contractorId:'CT-001', contractId:'K-011', assetId:'A-0014', date:d(-4), title:'تسرب في خزان فيلا 5-02 لم يُعالج', severity:'عالية', dueDate:d(3), status:'مفتوحة', closedDate:'', closure:''},
    {id:'OB-005', contractorId:'CT-002', contractId:'K-012', assetId:'AZ-P', date:d(-20), title:'تأخر رفع المخلفات', severity:'منخفضة', dueDate:d(-10), status:'مغلقة', closedDate:d(-12), closure:'زيادة عدد مرات الرفع'},
    {id:'OB-006', contractorId:'CT-002', contractId:'K-012', assetId:'AZ-B03', date:d(-3), title:'نظافة مداخل العمارة 3 غير مكتملة', severity:'متوسطة', dueDate:d(5), status:'مفتوحة', closedDate:'', closure:''},
  ];

  // متطلبات عقود المستثمرين (التزامات يجب تنفيذها)
  const requirements = [
    {id:'RQ-001', contractId:'K-003', seq:1, title:'بناء مسجد', dueDate:d(120), status:'قيد التنفيذ', progress:40, notes:'اكتمل الهيكل الخرساني', updatedAt:d(-10)},
    {id:'RQ-002', contractId:'K-003', seq:2, title:'ترميم المبنى الإداري', dueDate:d(-30), status:'منجز', progress:100, notes:'استُلم بمحضر', updatedAt:d(-35)},
    {id:'RQ-003', contractId:'K-003', seq:3, title:'تركيب كاميرات مراقبة للحي', dueDate:d(-5), status:'لم يبدأ', progress:0, notes:'', updatedAt:d(-60)},
    {id:'RQ-004', contractId:'K-004', seq:1, title:'تجديد واجهات المركز التجاري', dueDate:d(200), status:'قيد التنفيذ', progress:25, notes:'', updatedAt:d(-7)},
    {id:'RQ-005', contractId:'K-004', seq:2, title:'توفير 40 موقف سيارات إضافي', dueDate:d(-60), status:'منجز', progress:100, notes:'', updatedAt:d(-62)},
  ];

  // عدادات الخدمات في اتفاقيات التشغيل الذاتي وفواتيرها
  const meters = [
    {id:'MT-001', agreementId:'K-009', assetId:'A-0005', type:'كهرباء', meterNo:'E-4410221', accountNo:'30012345671', provider:'الشركة السعودية للكهرباء', payer:'نحن', status:'فعّال'},
    {id:'MT-002', agreementId:'K-009', assetId:'A-0005', type:'مياه', meterNo:'W-882014', accountNo:'7004412201', provider:'شركة المياه الوطنية', payer:'نحن', status:'فعّال'},
    {id:'MT-003', agreementId:'K-009', assetId:'A-0006', type:'كهرباء', meterNo:'E-4410388', accountNo:'30012345688', provider:'الشركة السعودية للكهرباء', payer:'نحن', status:'فعّال'},
    {id:'MT-004', agreementId:'K-009', assetId:'A-0006', type:'مياه', meterNo:'W-882077', accountNo:'7004412277', provider:'شركة المياه الوطنية', payer:'نحن', status:'فعّال'},
    {id:'MT-005', agreementId:'K-009', assetId:'A-0010', type:'كهرباء', meterNo:'E-4419001', accountNo:'30012399001', provider:'الشركة السعودية للكهرباء', payer:'المستأجر', status:'فعّال'},
    {id:'MT-006', agreementId:'K-010', assetId:'AZ-B01', type:'كهرباء', meterNo:'E-5520101', accountNo:'30055520101', provider:'الشركة السعودية للكهرباء', payer:'نحن', status:'فعّال'},
    {id:'MT-007', agreementId:'K-010', assetId:'AZ-B01', type:'مياه', meterNo:'W-990101', accountNo:'7009990101', provider:'شركة المياه الوطنية', payer:'نحن', status:'فعّال'},
    {id:'MT-008', agreementId:'K-010', assetId:'AZ-B02', type:'كهرباء', meterNo:'E-5520102', accountNo:'30055520102', provider:'الشركة السعودية للكهرباء', payer:'نحن', status:'فعّال'},
  ];
  const meterBills = [];
  const base={'MT-001':6200,'MT-002':1800,'MT-003':5900,'MT-004':1650,'MT-005':900,'MT-006':3400,'MT-007':1200,'MT-008':3100};
  meters.forEach(mt=>{ for(let i=6;i>=1;i--){ const x=new Date(today); x.setMonth(x.getMonth()-i,1); const per=x.toISOString().slice(0,7); const due=new Date(x); due.setMonth(due.getMonth()+1,15);
    const amount=Math.round(base[mt.id]*(0.85+((i*7+mt.id.length)%5)*0.08)); const unpaid=(i===1&&['MT-001','MT-006','MT-008'].includes(mt.id))||(i===2&&mt.id==='MT-007');
    meterBills.push({id:`MB-${mt.id}-${per}`, meterId:mt.id, period:per, amount, dueDate:due.toISOString().slice(0,10), paid:!unpaid, paidDate:unpaid?'':due.toISOString().slice(0,10), ref:''}); } });

  const audit = [
    {id:'LG-2', at:d(-2)+' 14:40', by:'u2', action:'تعديل', coll:'assets', refId:'A-0014', changes:'الحالة: جيد ← يحتاج صيانة'},
    {id:'LG-3', at:d(-1)+' 10:05', by:'u4', action:'إضافة', coll:'finance', refId:'FN-R-0-0', changes:'إنشاء السجل'},
  ];

  return {users, assets, contracts, documents, finance, clients, payments, contractors, evaluations, observations, requirements, meters, meterBills, audit, maps:[], settings:{projectName:'مشروع جبين', currency:'ر.س'}};
})();
