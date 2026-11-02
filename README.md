# Faktura

Vlastní česká fakturační aplikace: React + Vite, Vercel Functions a Supabase Postgres/Auth. Samostatná implementace běžných fakturačních postupů podle průzkumu uživatelského rozhraní. Nepoužívá zdrojový kód ani značku iDoklad.

## Stav

**Verze 0.1 — funkční základ, připravený k integraci a ověření.** Produkční účetní systém ani úplná funkční shoda s iDokladem zatím nejsou hotové. Repo obsahuje výhradně kód a smyšlené demo údaje. Žádná skutečná účetní data nebo tajné klíče.

### Implementováno

- Přehled vystavených faktur, pohledávek, dokladů po splatnosti a měsíční graf.
- Adresář: vytvoření a úprava partnera, IČ, DIČ, adresa, e-maily, výchozí měna.
- Vydané a přijaté faktury: koncept, položky, množství, sleva, ceny s/bez DPH, data, poznámky, objednávka a variabilní symbol.
- CZK/EUR, ručně zadaný kurz, sazby 21/12/0 %, samostatné režimy tuzemské / reverse charge / osvobození / neplátce.
- Peněžní výpočty s celočíselnou mezivýpočtovou aritmetikou, zaokrouhlování na úrovni položky.
- Atomické přidělení čísla při vystavení. Vystavené doklady jsou neměnné; lze je kopírovat do nového konceptu. Údaje stran jsou uložené jako snapshot.
- Tisková sestava a uložení PDF přes tisk prohlížeče.
- Částečné a úplné úhrady, zamezení přeplacení, historie úhrad.
- CSV export dokladů a evidence DPH podle DUZP; zahraniční/reverse režimy nejsou automaticky zahrnuté do tuzemské daňové bilance.
- Fio serverový import za období, deduplikace pohybů, 31sekundová zarážka a ručně potvrzované přesné párování.
- Supabase přihlášení, oddělení uživatelů přes RLS, audit vystavení a úhrad.
- Oddělené demo, které ukládá pouze ukázková data v prohlížeči. Živá relace drží token jen v paměti; po obnově stránky je nutné se přihlásit.

### Co vyžaduje dokončení před ostrým přechodem

- Přiznání k DPH, kontrolní hlášení, souhrnné hlášení a jejich XML/validace. Součet evidence není daňové přiznání.
- Úplná pravidla pro nárok na odpočet, zahraniční plnění, zálohy, dobropisy, opravy a stornování úhrad.
- E-mailové odesílání PDF a upomínky, přílohy, import historických dat z iDokladu, ARES/VIES, automatické kurzy a platební QR.
- Ověření databáze a RLS dvěma skutečnými testovacími uživateli, test souběžného číslování a integrací; viz docs/ACCEPTANCE.md.
- Vizuální kontrola všech obrazovek a tiskového PDF na mobilu i desktopu.

## Lokální spuštění

Node.js 22.12+ (nebo novější podporovaná LTS), npm:

```sh
npm install
npm test
npm run dev
```

Bez proměnných se otevře vstup do ukázkové aplikace. `npm run build` vytvoří produkční `dist/`. Backend lokálně vyžaduje Vercel CLI nebo nasazení Vercel Preview; samotné Vite obsluhuje pouze frontend a demo.

## Supabase — samostatný nový projekt

1. V novém projektu spusťte celý `supabase/001_initial.sql` v SQL Editoru. Skript je určen pro prázdnou databázi a spouští se jednou, v transakci.
2. V Authentication založte/invitujte oprávněného uživatele. Aplikace nemá veřejný registrační formulář. Veřejné registrace vypněte, pokud aplikace slouží pouze interně.
3. URL projektu a veřejný **anon** klíč použijte v proměnných níže. Service-role klíč aplikace nepotřebuje.
4. RLS je zapnuté na všech obchodních tabulkách. Uživatel přistupuje pouze ke svým řádkům. Pro tuto verzi je jeden účet = jedna samostatná evidence; týmové sdílení firmy ještě není implementováno.
5. V aplikaci doplňte vlastní údaje v Nastavení.

## Vercel

Importujte repozitář `BuVole/app`, framework **Vite**, build `npm run build`, výstup `dist`, Node 22+. Serverová funkce je v `api/accounting.js`.

| Proměnná | Účel |
|---|---|
| VITE_SUPABASE_URL | Veřejná URL projektu |
| VITE_SUPABASE_ANON_KEY | Veřejný anon klíč; přístup omezuje RLS |
| SUPABASE_URL | Stejná URL pro server |
| SUPABASE_ANON_KEY | Stejný anon klíč pro server; používá JWT přihlášeného uživatele |
| FIO_TOKEN | Volitelný tajný bankovní token, jen server |
| FIO_OWNER_ID | UUID jediného uživatele oprávněného importovat tento Fio účet |

Fio token nikdy nedávejte do `VITE_*`, kódu, issue ani README. Připojení musí mít pouze potřebná oprávnění. Po nastavení proměnných proveďte nové nasazení. V Supabase nastavte Site URL na skutečnou adresu nové aplikace a povolené redirect URL pro její přihlášení. Existující doménu jiné aplikace nepřesměrovávejte.

Vercel a Supabase nebyly při vytvoření tohoto repozitáře propojené; nasazení není potvrzené. Doporučený první krok je Preview se smyšlenými daty.

## Důležité vlastnosti

- Příchozí API požadavek musí mít platné JWT, ověřované vůči Supabase Auth; server nepoužívá privilegovaný service-role klíč.
- Vydané a přijaté doklady mají samostatné roční číselné řady. Výchozí vydaná řada je RRRR0001, přijatá P-RRRR0001. Před migrací musí být počítadlo navázané na skutečnou poslední použitou hodnotu.
- Přijaté faktury vyžadují číslo dodavatele. Variabilní symbol může být samostatně vyplněn.
- Fio čte pouze endpoint `periods`, nepoužívá `last` ani import plateb. Nejisté, částečné nebo vícenásobné shody je potřeba dořešit ručně.
- Evidence DPH obsahuje uložené doklady. DPH na vstupu není automaticky uznaný odpočet. Kurz je ručně uložený, nelze ho automaticky měnit na historickém dokladu.
- Testy používají smyšlená data. Účetní, daňové a bezpečnostní ověření před ostrým provozem je součástí akceptace.

## Ověřeno při implementaci

Automatické testy domény a demo postupu + produkční build. Živá databáze, Fio, Vercel nasazení, odesílání a vykreslení v prohlížeči nebyly ověřeny. Lokální prostředí blokovalo síťové DNS a naslouchání na portu, prohlížeč hlásil technickou chybu. Žádné skutečné účetní doklady nebyly migrovány.
