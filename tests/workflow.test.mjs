import test from 'node:test';import assert from 'node:assert/strict';
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const{demoStore}=await import('../src/store.mjs');
test('Kontakt → koncept → vystavení → částečná a úplná úhrada → obnovení dat',async()=>{
 const s=demoStore(),d=await s.load();let draft=structuredClone(d.invoices[0].data);draft.description='Test';
 let next=await s.run('saveInvoice',{data:draft});let i=next.invoices.find(x=>x.status==='draft');assert.ok(i);assert.equal(i.number,null);
 next=await s.run('issueInvoice',{id:i.id});i=next.invoices.find(x=>x.id===i.id);assert.ok(i.number.endsWith('0002'));assert.equal(i.status,'issued');
 await assert.rejects(()=>s.run('issueInvoice',{id:i.id}));await assert.rejects(()=>s.run('saveInvoice',{id:i.id,data:draft}));
 await s.run('payment',{invoice_id:i.id,amount:10000,date:'2026-11-02'});
 await assert.rejects(()=>s.run('payment',{invoice_id:i.id,amount:99999999,date:'2026-11-02'}));
 await s.run('payment',{invoice_id:i.id,amount:1442000,date:'2026-11-02'});
 await assert.rejects(()=>s.run('payment',{invoice_id:i.id,amount:1,date:'2026-11-02'}));
 const restored=await demoStore().load();assert.equal(restored.payments.filter(p=>p.invoice_id===i.id).length,2);
 const original=restored.invoices.find(x=>x.id===i.id).data.contact.name;
 await s.run('saveContact',{id:d.contacts[0].id,data:{...d.contacts[0].data,name:'Změněný partner'}});
 assert.equal((await s.load()).invoices.find(x=>x.id===i.id).data.contact.name,original);
});
