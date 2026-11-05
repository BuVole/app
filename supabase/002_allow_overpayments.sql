-- Run after 001_initial.sql for existing installations.
-- Payments remain append-only; a positive payment may exceed the invoice balance
-- and is surfaced in the application as a separately visible overpayment.
create or replace function public.record_payment(invoice_uuid uuid,amount_cents bigint,payment_date date,bank_uuid uuid default null,payment_note text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare i public.invoices; b public.bank_transactions; new_id uuid;
begin
 select * into i from invoices where id=invoice_uuid and user_id=auth.uid() for update;
 if not found or i.status<>'issued' then raise exception 'Faktura není vystavená';end if;
 if amount_cents<=0 then raise exception 'Úhrada musí být kladná';end if;
 if bank_uuid is not null then
  select * into b from bank_transactions where id=bank_uuid and user_id=auth.uid() for update;
  if not found or b.currency<>i.data->>'currency' or abs(b.amount)<>amount_cents or (i.data->>'direction'='issued' and b.amount<=0) or (i.data->>'direction'='received' and b.amount>=0) then raise exception 'Bankovní pohyb neodpovídá faktuře';end if;
 end if;
 insert into payments(user_id,invoice_id,amount,currency,date,bank_transaction_id,note) values(auth.uid(),i.id,amount_cents,i.data->>'currency',payment_date,bank_uuid,payment_note) returning id into new_id;
 insert into audit_log(user_id,entity_id,action) values(auth.uid(),i.id,'payment.recorded');return new_id;
end $$;
