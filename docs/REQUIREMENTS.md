# Funkční mapa

Zdroj: průzkum dostupných obrazovek iDokladu v přihlášeném uživatelském rozhraní. Kód, grafické podklady, logo ani neveřejná API původního systému nebyly kopírovány. Tato mapa popisuje pracovní postupy, ne úplnou shodu produktu.

| Oblast | Základ | Navazující práce |
|---|---|---|
| Přehled | Prodej, pohledávky, stáří/splatnost, trend | Nastavitelné období a pokročilé reporty |
| Fakturace | Koncept, číslo, partner, data, položky, CZK/EUR, tisk | Dobropisy, zálohy, šablony, opakování |
| Adresář | Jméno, adresa, IČ, DIČ, kontakty, měna | ARES/VIES, import, více adres |
| Úhrady | Částečné a úplné, historie, ochrana proti přeplacení | Opravy/reverzace, hromadné a víceměnové úhrady |
| Banka | Fio import a potvrzení přesné shody | Ruční výběr neshody, více účtů, plánované načítání |
| DPH | Výpočet, DUZP, režim, přepočet, CSV | Přiznání, KH, SH, odpočty a kontrola legislativy |
| Odesílání | Dosud neimplementováno | PDF příloha, SMTP/poskytovatel, více adresátů, historie, upomínky |
| Nákup | Přijaté faktury | Přílohy, účtenky, OCR |
| Provoz | GitHub, Vercel konfigurace, Supabase SQL/Auth/RLS | Nasazení, zálohy, monitoring, týmové role |

## Zdroje implementačních pravidel

- https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf — autentizace v cestě, periods, limity a formát transakcí.
- https://supabase.com/docs/guides/database/postgres/row-level-security — izolace dat.
- https://supabase.com/docs/guides/auth — identita uživatele.
- https://vercel.com/docs/frameworks/frontend/vite — hosting a proměnné.
- https://financnisprava.gov.cz/cs/dane/danovy-system-cr/popis-systemu — sazby DPH.

Před produkčním daňovým použitím ověřit aktuální zákonné náležitosti a specifikace podání. Finální daňová logika a zahraniční režimy jsou dosud otevřené.
