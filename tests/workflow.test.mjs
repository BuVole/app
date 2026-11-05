import test from 'node:test';import assert from 'node:assert/strict';
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const{demoStore}=await import('../src/store.mjs');
const{balance,status}=await import('../src/domain.mjs');
test('Kontakt → koncept → vystavení → částečná úhrada → přeplatek → obnovení dat',async()=>{
 const s=demoStore(),d=await s.load();let draft=structuredClone(d.invoices[0].data);draft.description='Test';
 let next=await s.run('saveInvoice',{data:draft});let i=next.invoices.find(x=>x.status==='draft');assert.ok(i);assert.equal(i.number,null);
 next=await s.run('issueInvoice',{id:i.id});i=next.invoices.find(x=>x.id===i.id);assert.ok(i.number.endsWith('0002'));assert.equal(i.status,'issued');
 await assert.rejects(()=>s.run('issueInvoice',{id:i.id}));await assert.rejects(()=>s.run('saveInvoice',{id:i.id,data:draft}));
 await s.run('payment',{invoice_id:i.id,amount:10000,date:'2026-11-02'});
 await s.run('payment',{invoice_id:i.id,amount:1500000,date:'2026-11-02'});
 const restored=await demoStore().load();assert.equal(restored.payments.filter(p=>p.invoice_id===i.id).length,2);assert.equal(balance(restored.invoices.find(x=>x.id===i.id),restored.payments),-58000);assert.equal(status(restored.invoices.find(x=>x.id===i.id),restored.payments),'Přeplatek');
 const original=restored.invoices.find(x=>x.id===i.id).data.contact.name;
 await s.run('saveContact',{id:d.contacts[0].id,data:{...d.contacts[0].data,name:'Změněný partner'}});
 assert.equal((await s.load()).invoices.find(x=>x.id===i.id).data.contact.name,original);
});
test('Dvojice kontaktů se stejným názvem zůstane oddělená a IČ je text',async()=>{const s=demoStore();const details={name:'Stejný název',ico:'00123456',addressLine:'První 1',postalCode:'110 00',city:'Praha',emails:'prvni@example.cz'};let next=await s.run('saveContact',{data:details});next=await s.run('saveContact',{data:{...details,addressLine:'Druhá 2',emails:'druhy@example.cz'}});const matches=next.contacts.filter(c=>c.data.name==='Stejný název');assert.equal(matches.length,2);assert.equal(matches[0].data.ico,'00123456');assert.notEqual(matches[0].id,matches[1].id);assert.notEqual(matches[0].data.address,matches[1].data.address)});
