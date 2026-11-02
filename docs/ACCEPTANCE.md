# Akceptace před ostrým provozem

## Ověření databáze a bezpečnosti

- Spustit migraci v novém testovacím projektu, potvrdit úspěšnou transakci.
- Dva uživatelé A/B: A nesmí načíst ani měnit kontakt, nastavení, fakturu, bankovní pohyb ani úhradu B (přímé REST požadavky i UI).
- Nepřihlášený uživatel nemá přístup k obchodním datům. API odmítá chybějící/neplatné/expirované JWT.
- 20 souběžných vystavení: unikátní rostoucí čísla, každé jednou. Opakované vystavení stejného dokladu nepřidělí další číslo.
- Souběžné úhrady nad zbývající částku: jedna musí selhat. Stejný bankovní pohyb nelze přiřadit dvakrát ani mezi dvěma uživateli.
- Přímý REST zápis nesmí změnit vystavený doklad, stav/číslo konceptu ani audit a počítadla.
- Fio nesmí použít token pro uživatele odlišného od FIO_OWNER_ID. Dvě rychlá volání musí vrátit 429.

## Fakturace a DPH

- Porovnat po odsouhlasení soukromé anonymizované vzorky z původního systému: CZK 21 %, více položek/sazeb, cena s DPH, sleva, EUR + tuzemské DPH, zahraniční plnění.
- Porovnat základ, daň, celkovou cenu a převod do Kč; odsouhlasit pravidla zaokrouhlování s účetní.
- Prověřit všechny zákonné náležitosti tiskového dokladu a daňové režimy. Vstupní odpočet není automaticky uznaný.
- Připravit samostatné mapování přiznání, KH a SH dle aktuálních specifikací. Nynější CSV není podání.
- Doplnit opravné doklady/dobropisy a reverzaci chybné úhrady před ostrým vystavováním.

## Migrace

- Export kontaktů, faktur, položek, úhrad, měn, kurzů a příloh do soukromého prostoru. Nikdy do veřejného GitHubu.
- Import s původními identifikátory a kontrolou duplicit, odsouhlasení počtu a částek po měnách a obdobích.
- Zachovat původní číselné řady, datumová pole, daňové režimy, úhrady a zůstatky. Nastavit další číslo transakčně.
- Úplná záloha a test obnovení. Přechod až po porovnání výsledků.

## Rozhraní

- Desktop i mobil: kontakt → koncept → editace → vystavení → PDF → částečná úhrada → doplacení.
- Tisk dlouhé vícestránkové faktury s diakritikou, texty a zahraniční měnou.
- Vyhledávání, filtry, datumové hranice a CSV v Excelu; test vzorců v uživatelských textech.
- Výpadek databáze/sítě nesmí způsobit oznámení o úspěšném uložení.
