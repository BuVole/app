-- Run once in a new Supabase project. All business tables use per-user RLS.
begin;
create table public.contacts(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id), data jsonb not null, created_at timestamptz not null default now());
create table public.settings(user_id uuid primary key default auth.uid() references auth.users(id), data jsonb not null);
create table public.invoices(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),number text,status text not null default 'draft' check(status in ('draft','issued','void')),data jsonb not null,created_at timestamptz not null default now(), unique(user_id,number));
create table public.number_sequences(user_id uuid not null references auth.users(id),year integer not null,direction text not null,last_number integer not null,primary key(user_id,year,direction));
create table public.bank_transactions(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),external_id text not null,date date not null,amount bigint not null,currency text not null,vs text,description text, unique(user_id,external_id));
create table public.payments(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),invoice_id uuid not null references public.invoices(id),amount bigint not null check(amount>0),currency text not null,date date not null,bank_transaction_id uuid unique references public.bank_transactions(id),note text);
create table public.audit_log(id bigint generated always as identity primary key,user_id uuid not null,entity_id uuid,action text not null,created_at timestamptz not null default now());
create table public.bank_sync(user_id uuid primary key,last_attempt timestamptz not null);

do $$ declare t text; begin
 foreach t in array array['contacts','settings','invoices','number_sequences','bank_transactions','payments','audit_log','bank_sync'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
 end loop;
 foreach t in array array['contacts','settings'] loop
 execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',t);
 execute format('create policy owner_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
 end loop;
end $$;
create policy draft_insert on public.invoices for insert to authenticated with check(user_id=auth.uid() and status='draft' and number is null);
create policy draft_update on public.invoices for update to authenticated using(user_id=auth.uid() and status='draft') with check(user_id=auth.uid() and status='draft' and number is null);
create policy bank_insert on public.bank_transactions for insert to authenticated with check(user_id=auth.uid());
-- Payments, numbering, state transitions and audit records are writable only by functions.
create function public.invoice_gross(d jsonb) returns bigint language plpgsql immutable set search_path=public as $$
declare x jsonb; a numeric; n numeric; t numeric; result bigint:=0; r integer;
begin
 if jsonb_array_length(d->'items') not between 1 and 100 then raise exception 'Invalid items';end if;
 for x in select * from jsonb_array_elements(d->'items') loop
 r:=(x->>'rate')::integer;
 if r not in (0,12,21) or (x->>'quantity')::numeric<=0 or (x->>'price')::numeric<0 or (x->>'discount')::numeric not between 0 and 100 then raise exception 'Invalid line';end if;
 if d->>'regime'<>'domestic' and r<>0 then raise exception 'Invalid tax regime';end if;
 a:=round((x->>'price')::numeric*(x->>'quantity')::numeric*(1-(x->>'discount')::numeric/100)*100);
 if x->>'priceType'='gross' then result:=result+a;else n:=a;t:=round(n*r/100);result:=result+n+t;end if;
 end loop;return result;
end $$;
create function public.issue_invoice(invoice_uuid uuid) returns text language plpgsql security definer set search_path=public as $$
declare i public.invoices; y integer; n integer; num text;
begin
 select * into i from public.invoices where id=invoice_uuid and user_id=auth.uid() for update;
 if not found or i.status<>'draft' then raise exception 'Doklad není dostupný jako koncept.';end if;
 if coalesce(i.data->'contact'->>'name','')='' or coalesce(i.data->'seller'->>'name','')='' or invoice_gross(i.data)<=0 then raise exception 'Neúplný doklad';end if;
 if i.data->>'currency' not in ('CZK','EUR') or (i.data->>'exchangeRate')::numeric<=0 or i.data->>'direction' not in ('issued','received') then raise exception 'Invalid currency or direction';end if;
 y:=extract(year from (i.data->>'issuedDate')::date);
 perform (i.data->>'taxDate')::date,(i.data->>'dueDate')::date;
 insert into number_sequences values(auth.uid(),y,i.data->>'direction',1) on conflict(user_id,year,direction) do update set last_number=number_sequences.last_number+1 returning last_number into n;
 if n>9999 then raise exception 'Číselná řada je vyčerpána';end if;
 num:=case when i.data->>'direction'='received' then 'P-' else '' end||y::text||lpad(n::text,4,'0');
 update invoices set status='issued',number=num where id=i.id;
 insert into audit_log(user_id,entity_id,action) values(auth.uid(),i.id,'invoice.issued');
 return num;
end $$;
create function public.record_payment(invoice_uuid uuid,amount_cents bigint,payment_date date,bank_uuid uuid default null,payment_note text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare i public.invoices; b public.bank_transactions; paid bigint; new_id uuid;
begin
 select * into i from invoices where id=invoice_uuid and user_id=auth.uid() for update;
 if not found or i.status<>'issued' then raise exception 'Faktura není vystavená';end if;
 select coalesce(sum(amount),0) into paid from payments where invoice_id=i.id;
 if amount_cents<=0 or amount_cents>invoice_gross(i.data)-paid then raise exception 'Úhrada překračuje zbývající částku';end if;
 if bank_uuid is not null then
 select * into b from bank_transactions where id=bank_uuid and user_id=auth.uid() for update;
 if not found or b.currency<>i.data->>'currency' or abs(b.amount)<>amount_cents or (i.data->>'direction'='issued' and b.amount<=0) or (i.data->>'direction'='received' and b.amount>=0) then raise exception 'Bankovní pohyb neodpovídá faktuře';end if;
 end if;
 insert into payments(user_id,invoice_id,amount,currency,date,bank_transaction_id,note) values(auth.uid(),i.id,amount_cents,i.data->>'currency',payment_date,bank_uuid,payment_note) returning id into new_id;
 insert into audit_log(user_id,entity_id,action) values(auth.uid(),i.id,'payment.recorded');return new_id;
end $$;
create function public.claim_bank_sync() returns boolean language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if auth.uid() is null then return false;end if;
 insert into bank_sync values(auth.uid(),now()) on conflict(user_id) do update set last_attempt=now() where bank_sync.last_attempt<now()-interval '31 seconds' returning user_id into result;
 return result is not null;
end $$;
revoke all on function public.issue_invoice(uuid), public.record_payment(uuid,bigint,date,uuid,text), public.claim_bank_sync() from public,anon;
grant execute on function public.issue_invoice(uuid), public.record_payment(uuid,bigint,date,uuid,text), public.claim_bank_sync() to authenticated;
create index invoices_owner on invoices(user_id,created_at desc);
create index payments_invoice on payments(invoice_id);

-- Database validation also protects writes made directly through the Supabase API.
create function public.check_invoice_data() returns trigger language plpgsql set search_path=public as $$
declare d jsonb:=new.data; x jsonb; k text; v text;
begin
 if coalesce(d->>'direction','') not in ('issued','received') or coalesce(d->>'currency','') not in ('CZK','EUR') or coalesce(d->>'regime','') not in ('domestic','reverse','exempt','nonvat') then raise exception 'Invalid document type';end if;
 if coalesce(jsonb_typeof(d->'items'),'')<>'array' then raise exception 'Invalid items';end if;
 if jsonb_array_length(d->'items') not between 1 and 100 then raise exception 'Invalid items';end if;
 foreach k in array array['contact','seller'] loop
 if coalesce(trim(d->k->>'name'),'')='' or coalesce(trim(d->k->>'address'),'')='' then raise exception 'Missing party details';end if;
 end loop;
 if coalesce(trim(d->'seller'->>'ico'),'')='' then raise exception 'Missing company ID';end if;
 if d->>'regime'='domestic' and coalesce(trim(d->'seller'->>'dic'),'')='' then raise exception 'Missing VAT ID';end if;
 if d->>'regime' in ('reverse','exempt') and coalesce(trim(d->>'taxNote'),'')='' then raise exception 'Missing tax note';end if;
 if d->>'regime'='reverse' and coalesce(trim(d->'contact'->>'dic'),'')='' then raise exception 'Missing partner VAT ID';end if;
 if d->>'direction'='received' and coalesce(trim(d->>'supplierNumber'),'')='' then raise exception 'Missing supplier number';end if;
 foreach k in array array['issuedDate','taxDate','dueDate'] loop
 v:=d->>k;if coalesce(v,'')!~'^\d{4}-\d{2}-\d{2}$' or to_char(v::date,'YYYY-MM-DD')<>v then raise exception 'Invalid date';end if;
 end loop;
 v:=d->>'exchangeRate';if coalesce(v,'')!~'^\d+(\.\d{1,6})?$' or v::numeric<=0 or (d->>'currency'='CZK' and v::numeric<>1) then raise exception 'Invalid exchange rate';end if;
 for x in select * from jsonb_array_elements(d->'items') loop
 if coalesce(trim(x->>'name'),'')='' or coalesce(x->>'priceType','') not in ('net','gross') or coalesce(x->>'rate','') not in ('0','12','21') then raise exception 'Invalid item';end if;
 foreach k in array array['price','quantity','discount'] loop
 v:=x->>k;if coalesce(v,'')!~'^\d+(\.\d{1,4})?$' or v::numeric>100000000 then raise exception 'Invalid numeric field';end if;
 end loop;
 if (x->>'discount')::numeric<>round((x->>'discount')::numeric,2) then raise exception 'Invalid discount precision';end if;
 end loop;
 if invoice_gross(d)<=0 then raise exception 'Invalid total';end if;
 return new;
end $$;
create trigger invoice_validation before insert or update on public.invoices for each row execute function public.check_invoice_data();

commit;
