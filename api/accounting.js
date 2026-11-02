import {validateInvoice,validDate,scaled,normalizeInvoice} from '../src/domain.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!base||!key)return res.status(503).json({error:'Nejprve připojte Supabase podle README.'});
 const token=req.headers.authorization;
 if(!token?.startsWith('Bearer '))return res.status(401).json({error:'Přihlaste se.'});
 try{
 const userResponse=await fetch(`${base}/auth/v1/user`,{headers:{apikey:key,Authorization:token},signal:AbortSignal.timeout(10000)});
 if(!userResponse.ok)return res.status(401).json({error:'Přihlášení vypršelo.'});
 const user=await userResponse.json();
 const db=async(path,method='GET',body,prefer)=>{const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:token,'Content-Type':'application/json',Prefer:prefer||'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});let d=await r.text();if(!r.ok)throw Error('Databázová operace se nezdařila. Zkontrolujte data a instalaci SQL.');return d?JSON.parse(d):null;};
 const {action,payload:p={}}=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
 if(JSON.stringify(p).length>200000)return res.status(413).json({error:'Příliš velký požadavek.'});
 const owner=`user_id=eq.${user.id}`;
 if(action==='load'){
 const all=async table=>{let rows=[],offset=0;for(;;){const batch=await db(`${table}?${owner}&order=id&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)break;offset+=500;if(offset>50000)throw Error('Příliš mnoho záznamů.');}return rows;};
 const[contacts,invoices,payments,bank_transactions,settings]=await Promise.all([all('contacts'),all('invoices'),all('payments'),all('bank_transactions'),db(`settings?${owner}`)]);
 return res.json({contacts,invoices,payments,bank_transactions,settings:settings[0]?.data||{}});
 }
 if(action==='saveSettings'){
 if(!p.name?.trim())throw Error('Doplňte název firmy.');await db('settings?on_conflict=user_id','POST',{user_id:user.id,data:p},'resolution=merge-duplicates,return=minimal');
 }else if(action==='saveContact'){
 if(!p.data?.name?.trim()||!p.data?.address?.trim())throw Error('Doplňte jméno a adresu kontaktu.');
 if(p.id&&!uuid(p.id))throw Error('Neplatné ID.');await db(p.id?`contacts?id=eq.${p.id}&${owner}`:'contacts',p.id?'PATCH':'POST',{data:p.data,...(!p.id?{user_id:user.id}:{})});
 }else if(action==='saveInvoice'){
 p.data=normalizeInvoice(p.data);validateInvoice(p.data);if(p.id&&!uuid(p.id))throw Error('Neplatné ID.');const result=await db(p.id?`invoices?id=eq.${p.id}&${owner}&status=eq.draft`:'invoices',p.id?'PATCH':'POST',{data:p.data,...(!p.id?{user_id:user.id}:{})});if(!result.length)throw Error('Koncept nebyl uložen.');
 }else if(action==='issueInvoice'){
 if(!uuid(p.id))throw Error('Neplatné ID.');const[i]=await db(`invoices?id=eq.${p.id}&${owner}`);if(!i)throw Error('Doklad neexistuje.');validateInvoice(i.data);await db('rpc/issue_invoice','POST',{invoice_uuid:p.id});
 }else if(action==='payment'){
 if(!uuid(p.invoice_id)||!Number.isSafeInteger(p.amount)||p.amount<=0||!validDate(p.date)||(p.bank_transaction_id&&!uuid(p.bank_transaction_id)))throw Error('Neplatná úhrada.');await db('rpc/record_payment','POST',{invoice_uuid:p.invoice_id,amount_cents:p.amount,payment_date:p.date,bank_uuid:p.bank_transaction_id||null,payment_note:p.note||''});
 }else if(action==='fio'){
 if(user.id!==process.env.FIO_OWNER_ID||!process.env.FIO_TOKEN)return res.status(503).json({error:'Fio není připojeno k tomuto uživateli.'});
 if(!validDate(p.from)||!validDate(p.to)||p.from>p.to||Date.parse(p.to)-Date.parse(p.from)>90*86400000)throw Error('Vyberte období do 90 dnů.');
 if(!await db('rpc/claim_bank_sync','POST',{}))return res.status(429).json({error:'Mezi importy počkejte alespoň 31 sekund.'});
 const r=await fetch(`https://fioapi.fio.cz/v1/rest/periods/${process.env.FIO_TOKEN}/${p.from}/${p.to}/transactions.json`,{redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error(`Fio odmítlo požadavek (HTTP ${r.status}).`);
 const data=await r.json();const rows=(data.accountStatement?.transactionList?.transaction||[]).map(t=>{const v=n=>t[`column${n}`]?.value;const raw=String(v(1));return{user_id:user.id,external_id:String(v(22)),date:String(v(0)).slice(0,10),amount:Number(scaled(raw.replace('-',''),2))*(raw.startsWith('-')?-1:1),currency:v(14),vs:String(v(5)||''),description:String(v(16)||v(25)||v(7)||'')};});
 for(let n=0;n<rows.length;n+=200)await db('bank_transactions?on_conflict=user_id,external_id','POST',rows.slice(n,n+200),'resolution=ignore-duplicates,return=minimal');
 }else return res.status(400).json({error:'Neznámá operace.'});
 return res.json({ok:true});
 }catch(e){const safe=e.name==='TimeoutError'?'Spojení vypršelo. Zkuste to znovu.':e.message;return res.status(400).json({error:safe.includes('http')||safe.includes('fetch')?'Spojení se službou se nezdařilo.':safe});}
}
