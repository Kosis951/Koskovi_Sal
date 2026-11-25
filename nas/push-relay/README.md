# Push relay na Synology (push.tkkoskovi.cz)

Vsechna upozorneni nativnich aplikaci jdou pres NAS: web na VPS posle zpravu relayi a ten ji
doruci – iPhonum pres Apple (APNs, klic `.p8` je jen tady), Androidum pres ntfy (UnifiedPush).
Na stejne adrese je ke stazeni Android aplikace (`https://push.tkkoskovi.cz/app/koskovi-sal.apk`).

```
VPS (sal.tkkoskovi.cz) ──POST /relay/send──▶ relay ──▶ Apple → iPhone
                                               └──▶ ntfy → aplikace ntfy → Android
```

Relay (`relay/server.mjs`, Node bez zavislosti) obsluhuje `/relay/…` a `/app/….apk`, vse ostatni
predava ntfy (tam se pripojuje aplikace ntfy na telefonech). ntfy neni zvenku primo dostupne.

## Instalace (DSM 7, Container Manager)

1. **DNS**: u spravce domeny tkkoskovi.cz pridej zaznam `push` → verejna IP NAS (A zaznam),
   nebo CNAME na DDNS adresu NAS. Router musi preposilat port 443 na NAS (pokud uz to
   funguje pro jinou domenu NAS, staci DNS).
2. **Soubory** (File Station): vytvor `/volume1/docker/koskovi-push` a do ni nahraj
   `compose.yaml` a `ntfy/server.yml`. Vytvor prazdne slozky `secrets`, `downloads`, `ntfy-data`.
   Kod relaye a stranky (`relay/`, `site/`) si kontejner pri startu stahne z GitHubu z commitu
   uvedeneho v `compose.yaml`; aktualizace = novy commit v `compose.yaml` a Sestavit.
3. **Tajne soubory** do `secrets`: `AuthKey.p8` (push klic od Applu, prejmenovany
   `AuthKey_F8QS7XUX7B.p8`) a `relay-secret.txt` (nahodny retezec aspon 32 znaku, napr.
   `openssl rand -hex 32`; stejny pak pujde na VPS). Key ID, Team ID a bundle ID jsou primo
   v `compose.yaml`.
4. (Pravidlo pro temata telefonu `up*` si ntfy nastavi samo pri kazdem startu.)
5. **Container Manager → Projekt → Vytvorit**: nazev `koskovi-push`, cesta
   `/volume1/docker/koskovi-push`, „Pouzit existujici compose.yaml“ → Dalsi → Hotovo.
6. **Reverzni proxy**: Ovladaci panel → Prihlasovaci portal → Upresnit → Reverzni proxy →
   Vytvorit:
   - Zdroj: HTTPS, `push.tkkoskovi.cz`, port 443, zapnout HSTS.
   - Cil: HTTP, `localhost`, port `2587`.
   - Vlastni zahlavi → Vytvorit → WebSocket.
   - Upresnit nastaveni: casovy limit spojeni/odeslani/cteni proxy na 3600 s (aplikace ntfy
     drzi spojeni dlouho).
7. **Certifikat**: Ovladaci panel → Zabezpeceni → Certifikat → Pridat → Let's Encrypt pro
   `push.tkkoskovi.cz`, pak v „Nastaveni“ priradit k teto reverzni proxy.

## Napojeni webu (VPS)

Do `.env.local` na VPS:

```
PUSH_RELAY_URL=https://push.tkkoskovi.cz
PUSH_RELAY_SECRET=<obsah secrets/relay-secret.txt z NAS>
```

a `pm2 restart koskovi-sal`. Klic od Applu na VPS nepatri.

## Kontrola

```bash
curl -s https://push.tkkoskovi.cz/relay/health
```

Ma vratit `{"apns":true,"ntfy":true,"ok":true}`. Pak v aplikaci na iPhonu: Ucet → Upozorneni →
zapnout → „Poslat zkusebni upozorneni“.

APK: novou verzi nahraj do `downloads` jako `koskovi-sal.apk`, odkaz zustava stejny.
