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
pm2 start ecosystem.config.cjs   # poprve; pri dalsich nasazenich: pm2 restart koskovi-sal
pm2 save && pm2 startup     # automaticky start po restartu serveru
```

V `.env.local` musi byt vyplneno:

- `ADMIN_PASSWORD_HASH` – vystup `npm run hash-password -- "heslo"`
- `ADMIN_SESSION_SECRET` – nahodny retezec (`openssl rand -hex 32`)
- `CRON_SECRET` – nahodny retezec
- `DATABASE_PATH` – soubor databaze mimo slozku aplikace, napr. `/var/lib/koskovi-sal/koskovi.sqlite`
  (slozku vytvor: `sudo mkdir -p /var/lib/koskovi-sal && sudo chown $USER /var/lib/koskovi-sal`)

Aplikace bezi na portu 3000. Prihlaseni v produkci vyzaduje HTTPS (nginx + certbot
pred aplikaci). Pro docasny test pres `http://IP:3000` lze do `.env.local` pridat
`SESSION_COOKIE_SECURE=false`, po zprovozneni HTTPS ho odstran.

Denni uklid probehlych rezervaci (volitelne, crontab):

```bash
0 3 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/refresh-trainings
```

Logy: `pm2 logs koskovi-sal`. Zalohuj soubor z `DATABASE_PATH`.

## Hashovani hesel

```bash
npm run hash-password -- "tvoje-heslo"
```

Vystup vloz do odpovidajici promenne v `.env.local`.
