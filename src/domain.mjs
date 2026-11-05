export const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
export const money=(n,c='CZK')=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency:c}).format(n/100);
export function normalizeContact(data={}){
 const text=value=>String(value??'').trim();
 const emails=(Array.isArray(data.emails)?data.emails:String(data.emails??data.email??'').split(','))
  .map(text).filter(Boolean).filter((value,index,all)=>all.indexOf(value)===index);
 const addressLine=text(data.addressLine??data.address);
 const postalCode=text(data.postalCode);
 const city=text(data.city);
 const country=text(data.country);
 const locality=[postalCode,city].filter(Boolean).join(' ');
 const address=[addressLine,locality,country].filter(Boolean).join(', ');
 const paymentDays=text(data.paymentDays||'14');
 const discount=text(data.discount||'0');
 if(!/^\d{1,3}$/.test(paymentDays)||Number(paymentDays)>365)throw Error('Splatnost kontaktu musí být 0 až 365 dní.');
 if(!/^\d{1,2}(?:[.,]\d{1,2})?$/.test(discount)||Number(discount.replace(',','.'))>100)throw Error('Sleva kontaktu musí být 0 až 100 %.');
 return {...data,name:text(data.name),ico:text(data.ico),dic:text(data.dic),addressLine,postalCode,city,country,address,email:emails[0]||'',emails,contactPerson:text(data.contactPerson),phone:text(data.phone),paymentDays,discount:discount.replace(',','.'),bank:text(data.bank),note:text(data.note),currency:data.currency==='EUR'?'EUR':'CZK'};
}
export const contactSnapshot=data=>normalizeContact(data);
export function scaled(value, places=2){
 const s=String(value).trim().replace(',','.');
 if(!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(s))throw Error(`Zadejte nezáporné číslo s nejvýše ${places} desetinnými místy.`);
 const[a,b='']=s.split('.');const n=BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,'0'));
 if(n>100000000000000n)throw Error('Částka je příliš vysoká.');return n;
}
const round=(n,d)=>(n+d/2n)/d;
export function totals(items,regime='domestic'){
 if(!items.length||items.length>100)throw Error('Faktura musí mít 1 až 100 položek.');
 const lines=items.map(x=>{
 if(!x.name?.trim())throw Error('Doplňte název položky.');
 const qty=scaled(x.quantity,4), price=scaled(x.price,4),discount=scaled(x.discount||'0',2),rate=Number(x.rate);
 if(qty===0n||discount>10000n||![0,12,21].includes(rate))throw Error('Neplatné množství, sleva nebo sazba DPH.');
 if(regime!=='domestic'&&rate!==0)throw Error('Zvolený režim vyžaduje položky bez vyčíslené DPH.');
 if(!['net','gross'].includes(x.priceType))throw Error('Neplatný typ ceny.');
 const amount=round(qty*price*(10000n-discount),10000000000n);
 const net=x.priceType==='gross'?round(amount*100n,100n+BigInt(rate)):amount;
 const tax=x.priceType==='gross'?amount-net:round(net*BigInt(rate),100n);
 if(net+tax>100000000000n)throw Error('Částka je příliš vysoká.');
 return {...x,net:Number(net),tax:Number(tax),gross:Number(net+tax)};
 });return {lines,net:lines.reduce((a,x)=>a+x.net,0),tax:lines.reduce((a,x)=>a+x.tax,0),gross:lines.reduce((a,x)=>a+x.gross,0)};
}
export function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;}
export function validateInvoice(d){
 if(!['issued','received'].includes(d.direction)||!['CZK','EUR'].includes(d.currency)||!['domestic','reverse','exempt','nonvat'].includes(d.regime))throw Error('Neplatný typ faktury.');
 if(!d.contact?.name?.trim()||!d.contact?.address?.trim())throw Error('Doplňte partnera a jeho adresu.');
 if(!d.seller?.name?.trim()||!d.seller?.address?.trim()||!d.seller?.ico?.trim())throw Error('V Nastavení doplňte jméno firmy, adresu a IČ.');
 if(d.regime==='domestic'&&!d.seller?.dic?.trim())throw Error('Pro fakturu s DPH doplňte DIČ své firmy.');
 if(['reverse','exempt'].includes(d.regime)&&!d.taxNote?.trim())throw Error('Doplňte důvod daňového režimu.');
 if(d.regime==='reverse'&&!d.contact?.dic?.trim())throw Error('Pro přenesení daňové povinnosti doplňte DIČ partnera.');
 if(![d.issuedDate,d.taxDate,d.dueDate].every(validDate))throw Error('Doplňte platná data.');
 if(d.direction==='received'&&!d.supplierNumber?.trim())throw Error('Doplňte číslo dodavatele.');
 if(scaled(d.exchangeRate,6)===0n||(d.currency==='CZK'&&String(d.exchangeRate)!=='1'))throw Error('Zadejte kladný kurz; pro CZK musí být 1.');
 const t=totals(d.items,d.regime);if(t.gross<=0)throw Error('Celková částka musí být kladná.');return t;
}
export function toCzk(cents,rate){return Number(round(BigInt(cents)*scaled(rate,6),1000000n));}
export function balance(invoice,payments){return totals(invoice.data.items,invoice.data.regime).gross-payments.filter(p=>p.invoice_id===invoice.id).reduce((s,p)=>s+p.amount,0);}
export function status(i,p){if(i.status==='draft')return 'Koncept';if(i.status==='void')return 'Storno';const b=balance(i,p);return b<0?'Přeplatek':b===0?'Uhrazeno':i.data.dueDate<today()?'Po splatnosti':b<totals(i.data.items,i.data.regime).gross?'Částečně uhrazeno':'Neuhrazeno';}
export function csv(rows){return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^\s*[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n');}
export function vatSummary(invoices,from,to){
 const rows=invoices.filter(i=>i.status==='issued'&&i.data.taxDate>=from&&i.data.taxDate<=to).map(i=>{let t=totals(i.data.items,i.data.regime);return {number:i.number,direction:i.data.direction,date:i.data.taxDate,regime:i.data.regime,net:toCzk(t.net,i.data.exchangeRate),tax:toCzk(t.tax,i.data.exchangeRate)}});
 return {rows,output:rows.filter(r=>r.direction==='issued'&&r.regime==='domestic').reduce((s,r)=>s+r.tax,0),input:rows.filter(r=>r.direction==='received'&&r.regime==='domestic').reduce((s,r)=>s+r.tax,0)};
}

export function normalizeInvoice(d){return {...d,contactId:typeof d.contactId==='string'?d.contactId:null,contact:contactSnapshot(d.contact),exchangeRate:String(d.exchangeRate).trim().replace(',','.'),items:d.items.map(x=>({...x,price:String(x.price).trim().replace(',','.'),quantity:String(x.quantity).trim().replace(',','.'),discount:String(x.discount||'0').trim().replace(',','.')}))};}
