# Relay aplikaci na Synology (app.tkkoskovi.cz)

Vsechna upozorneni nativnich aplikaci jdou pres NAS: web na VPS posle zpravu relayi a ten ji
doruci – iPhonum pres Apple (APNs, klic `.p8` je jen tady), Androidum pres Google (Firebase
Cloud Messaging, servisni ucet je jen tady). Na stejne adrese jsou stranky aplikaci a ke stazeni
Android aplikace (`https://app.tkkoskovi.cz/app/koskovi-sal.apk`, vzdy posledni verze z GitHubu).

```
VPS (sal.tkkoskovi.cz) ──POST /relay/send──▶ relay ──▶ Apple → iPhone
                                               └──▶ Google (FCM) → Android
```

Relay (`relay/server.mjs`, Node bez zavislosti) obsluhuje `/relay/…`, `/app/….apk` a stranky
(`/`, `/privacy`, `/support`).

Stranky vypadaji jako web (stejna hlavicka, CSS i pismo) a jsou jeho zalozka „Aplikace“. Generuje je
`npx tsx scripts/build-app-site.mts` z `site-src/` do `site/`; pak commit a novy commit v `compose.yaml`.

## Instalace (DSM 7, Container Manager)

1. **DNS**: u spravce domeny tkkoskovi.cz zaznam `app` → verejna IP NAS (A zaznam). Router musi
   preposilat port 443 na NAS.
2. **Soubory** (File Station): vytvor `/volume1/docker/koskovi-push` a do ni nahraj `compose.yaml`.
   Vytvor prazdne slozky `secrets` a `downloads`. Kod relaye a stranky (`relay/`, `site/`) si
   kontejner pri startu stahne z GitHubu z commitu uvedeneho v `compose.yaml`; aktualizace = novy
   commit v `compose.yaml` a Sestavit.
3. **Tajne soubory** do `secrets`:
   - `AuthKey.p8` – push klic od Applu (Key ID, Team ID a bundle ID jsou v `compose.yaml`),
   - `relay-secret.txt` – nahodny retezec aspon 32 znaku (napr. `openssl rand -hex 32`), stejny
     pujde na VPS,
   - `fcm.json` – servisni ucet Firebase (projekt `tk-koskovi`): Nastaveni projektu → Servisni
     ucty → Vygenerovat novy soukromy klic. Bez nej nechodi upozorneni na Android.
4. **Container Manager → Projekt → Vytvorit**: nazev `koskovi-push`, cesta
   `/volume1/docker/koskovi-push`, „Pouzit existujici compose.yaml“ → Dalsi → Hotovo.
5. **Reverzni proxy**: Ovladaci panel → Prihlasovaci portal → Upresnit → Reverzni proxy →
   Vytvorit: zdroj HTTPS `app.tkkoskovi.cz` port 443 (HSTS), cil HTTP `localhost` port `2587`.
6. **Certifikat**: Ovladaci panel → Zabezpeceni → Certifikat → Let's Encrypt pro
   `app.tkkoskovi.cz`, v „Nastaveni“ priradit k teto reverzni proxy.

## Napojeni webu (VPS)

Do `.env.local` na VPS:

```
PUSH_RELAY_URL=https://app.tkkoskovi.cz
PUSH_RELAY_SECRET=<obsah secrets/relay-secret.txt z NAS>
```

a `pm2 restart koskovi-sal --update-env`. Klice od Applu a Googlu na VPS nepatri.

## Kontrola

```bash
curl -s https://app.tkkoskovi.cz/relay/health
```

Ma vratit `{"apns":true,"fcm":true,"ok":true}`. Pak v aplikaci: Ucet → Upozorneni → zapnout →
„Poslat zkusebni upozorneni“.
