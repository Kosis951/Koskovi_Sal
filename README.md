# Koskovi Sal

Next.js aplikace pro dostupnost a rezervace tanecniho salu.

## Lokalni vyvoj

```bash
npm install
npm run dev
```

Stranka bezi na [http://localhost:3000](http://localhost:3000).

Prikaz `npm run dev` pred startem automaticky smaze slozku `.next`, aby se nemichala vyvojova cache s produkcnim buildem.

## Produkcni build

```bash
npm run build
npm run start
```

Build si take nejprve vycisti `.next`. Prikaz `npm run start` uz `.next` nemaze, protoze ji v produkci potrebuje.

## Rucni vycisteni cache

Kdyz se Next.js zasekne na chybe typu chybejici `routes-manifest.json`, `pages-manifest.json` nebo podivne cache po buildu, spust:

```bash
npm run clean
npm run dev
```

Skript maze jen slozku `.next` v koreni projektu.

## Nasazeni na VPS s PM2

Pozadavky: Node.js 20 nebo 22 (LTS), git, PM2 (`npm install -g pm2`).

```bash
cd /cesta/k/Koskovi_Sal
git pull
npm ci                      # na serveru, nikdy nekopirovat node_modules z Windows
cp .env.example .env.local  # jen poprve, pak vyplnit (viz nize)
npm run build
pm2 delete koskovi-sal          # jen pokud uz existuje stary zaznam (spusteny pres npm start)
pm2 start ecosystem.config.cjs   # pri dalsich nasazenich staci: pm2 restart koskovi-sal
pm2 save && pm2 startup     # automaticky start po restartu serveru
```

V `.env.local` musi byt vyplneno:

- `ADMIN_PASSWORD_HASH` – vystup `npm run hash-password -- "heslo"`
- `ADMIN_SESSION_SECRET` – nahodny retezec (`openssl rand -hex 32`)
- `CRON_SECRET` – nahodny retezec
- `DATABASE_PATH` – soubor databaze mimo slozku aplikace, napr. `/var/lib/koskovi-sal/koskovi.sqlite`
  (slozku vytvor: `sudo mkdir -p /var/lib/koskovi-sal && sudo chown $USER /var/lib/koskovi-sal`)

Aplikace bezi na portu 3001 (zmena: `PORT=... pm2 start ecosystem.config.cjs`). Prihlaseni v produkci vyzaduje HTTPS (nginx + certbot
pred aplikaci). Pro docasny test pres `http://IP:3001` lze do `.env.local` pridat
`SESSION_COOKIE_SECURE=false`, po zprovozneni HTTPS ho odstran.

Denni uklid probehlych rezervaci (volitelne, crontab):

```bash
0 3 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3001/api/cron/refresh-trainings
```

Logy: `pm2 logs koskovi-sal`. Zalohuj soubor z `DATABASE_PATH`.

## Instalace jako aplikace (PWA)

Stranka jde nainstalovat na telefon/tablet jako aplikace (jen pres HTTPS). Navod pro uzivatele
je na strance `/aplikace` (zalozka „Aplikace“ v hlavicce; na pocitaci s QR kodem, adresa z `APP_URL`
nebo z pozadavku):

- Android (Chrome): nabidka „Nainstalovat“ primo na strance, nebo menu ⋮ → Instalovat aplikaci.
- iPhone/iPad (Safari): Sdilet → Pridat na plochu.

Soubory: `src/app/manifest.ts` (nazev, barvy, ikony), `public/sw.js` (service worker:
cache jen statickych souboru, stranky a API vzdy ze site, bez pripojeni `public/offline.html`).
Ikony se generuji z `public/brand/Koskovi_logo_znak.svg` prikazem `node scripts/generate-app-icons.mjs`.
Pokud je pred aplikaci nginx, nesmi `/sw.js` cachovat (aplikace posila `Cache-Control: no-cache`).

## Push notifikace

Zapinaji se na strance `/aplikace` (sekce Upozorneni, v hlavicce zvonecek). Posila se:

- rano v 7:00 souhrn, pokud je dnes v sale jina blokace nez trenink nebo odpada trenink,
- behem dne hned pri pridani/zmene/zruseni dnesni blokace nebo zruseni treninku (do 22:00),
- „Sal ceka na uklid“, jakmile skonci akce s pozadovanym uklidem (kdo si to zapne).

Na iPhonu/iPadu funguji jen v aplikaci pridane na plochu (iOS 16.4+). Nastaveni na serveru:

```bash
npm run vapid-keys          # vypise 3 radky, vlozit do .env.local (jen jednou!)
pm2 restart koskovi-sal
```

Kontrola bezi uvnitr aplikace kazdou minutu (`src/instrumentation.ts`), cron neni potreba.
Odeslane zpravy jsou videt v `pm2 logs koskovi-sal` (radky `[push]`).

## Hashovani hesel

```bash
npm run hash-password -- "tvoje-heslo"
```

Vystup vloz do odpovidajici promenne v `.env.local`.
