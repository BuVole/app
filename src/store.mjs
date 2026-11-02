import {today,validateInvoice,totals,balance,normalizeInvoice} from './domain.mjs';
const URL=import.meta.env?.VITE_SUPABASE_URL, KEY=import.meta.env?.VITE_SUPABASE_ANON_KEY;
export const configured=Boolean(URL&&KEY);
let session=null;
export const auth={
 async login(email,password){const r=await fetch(`${URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)throw Error('Přihlášení se nepodařilo. Zkontrolujte e-mail a heslo.');session=d;return d.user;},
 async logout(){if(session)await fetch(`${URL}/auth/v1/logout`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${session.access_token}`}});session=null;},
 async token(){if(!session)throw Error('Přihlaste se.');if(session.expires_at*1000<Date.now()+60000){const r=await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});if(!r.ok)throw Error('Přihlášení vypršelo. Přihlaste se znovu.');session=await r.json();}return session.access_token;}
};
export function seed(){const date=today(),year=date.slice(0,4);const contacts=[{id:crypto.randomUUID(),data:{name:'Ukázková agentura s.r.o.',ico:'00000001',dic:'CZ00000001',address:'Ukázková 10, Praha',email:'fakturace@example.com',currency:'CZK'}},{id:crypto.randomUUID(),data:{name:'Demo Partner s.r.o.',ico:'00000002',dic:'SK00000002',address:'Vzorová 2, Bratislava',email:'partner@example.com',currency:'EUR'}}];const seller={name:'Moje ukázková firma',ico:'00000000',dic:'CZ00000000',address:'Vzorová 1, Praha',bank:'',iban:'',email:'info@example.com',footer:'Děkujeme za spolupráci.'};const invoices=[{id:crypto.randomUUID(),number:year+'0001',status:'issued',data:{direction:'issued',contact:contacts[0].data,seller,currency:'CZK',exchangeRate:'1',regime:'domestic',taxNote:'',issuedDate:date,taxDate:date,dueDate:date,description:'Affiliate marketing — ukázka',items:[{name:'Marketingové služby',quantity:'1',price:'12000',priceType:'net',rate:21,discount:'0',unit:'měsíc'}]}}];return {contacts,invoices,payments:[],bank_transactions:[],settings:seller};}
const demoKey='faktura-demo-v1';
export function demoStore(){let state;try{state=JSON.parse(localStorage.getItem(demoKey))}catch{}if(!state)state=seed();const save=()=>localStorage.setItem(demoKey,JSON.stringify(state));return {
 async load(){return structuredClone(state)},
 async run(action,p){
 if(action==='saveContact'){let x={id:p.id||crypto.randomUUID(),data:p.data};state.contacts=state.contacts.filter(y=>y.id!==x.id).concat(x);}
 if(action==='saveSettings')state.settings=p;
 if(action==='saveInvoice'){p={...p,data:normalizeInvoice(p.data)};validateInvoice(p.data);let prev=state.invoices.find(i=>i.id===p.id);if(prev&&prev.status!=='draft')throw Error('Vystavený doklad nelze měnit.');state.invoices=state.invoices.filter(i=>i.id!==p.id).concat({id:p.id||crypto.randomUUID(),number:null,status:'draft',data:p.data});}
 if(action==='issueInvoice'){const i=state.invoices.find(i=>i.id===p.id);if(!i||i.status!=='draft')throw Error('Doklad již byl vystaven.');validateInvoice(i.data);const prefix=i.data.issuedDate.slice(0,4);const nums=state.invoices.filter(x=>x.number?.startsWith(prefix)).map(x=>Number(x.number.slice(4))).filter(Number.isFinite);i.number=i.data.direction==='received'?`P-${prefix}-${String(state.invoices.filter(x=>x.data.direction==='received'&&x.status==='issued').length+1).padStart(4,'0')}`:prefix+String(Math.max(0,...nums)+1).padStart(4,'0');i.status='issued';}
 if(action==='payment'){let i=state.invoices.find(i=>i.id===p.invoice_id);if(!i||i.status!=='issued'||!Number.isSafeInteger(p.amount)||p.amount<=0||p.amount>balance(i,state.payments))throw Error('Neplatná výše úhrady.');state.payments.push({...p,id:crypto.randomUUID(),currency:i.data.currency});}
 if(action==='fio')throw Error('Fio je dostupné po připojení serveru a databáze.');save();return this.load();}
};}
export function liveStore(){return {async load(){return request('load',{})},async run(action,payload){await request(action,payload);return this.load()}};}
async function request(action,payload){const r=await fetch('/api/accounting',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.token()}`},body:JSON.stringify({action,payload})});let d;try{d=await r.json()}catch{throw Error('Server není dostupný.')}if(!r.ok)throw Error(d.error||'Operace se nezdařila.');return d;}
