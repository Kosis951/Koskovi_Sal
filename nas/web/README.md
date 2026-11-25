# Web a databaze na NAS

Web (Next.js) i databaze bezi v Dockeru na Synology. VPS zustava na adrese `sal.tkkoskovi.cz`
a jen preposila provoz na NAS (`web.tkkoskovi.cz`). Pozdeji staci v DNS presmerovat
`sal.tkkoskovi.cz` primo na NAS a VPS zrusit.

```
prohlizec / aplikace ──https──▶ VPS (nginx, sal.tkkoskovi.cz) ──https──▶ NAS (web.tkkoskovi.cz)
                                                                          └─ koskovi-web + /data/koskovi.sqlite
```

Docker obraz webu sestavuje GitHub (`.github/workflows/web-image.yml`) po kazde zmene a uklada
ho jako `ghcr.io/kosis951/koskovi_sal:latest`. Na NAS: Container Manager → koskovi-web →
Akce → Sestavit stahne nejnovejsi.

## Presun (jednou)

Po dobu presunu (asi 10 minut) web nepujde.

1. **DNS**: u Endory zaznam `web` → `62.201.21.132` (A).
2. **NAS, slozka**: `/volume1/docker/koskovi-web` se souborem `compose.yaml` a prazdnou slozkou
   `data`.
3. **Tajne udaje**: z VPS zkopiruj `.env.local` a na NAS ho uloz jako
   `/volume1/docker/koskovi-web/.env` (`DATABASE_PATH`, `PORT` a `PUSH_RELAY_URL` v nem prebije
   `compose.yaml`, ostatni, vcetne `PUSH_RELAY_SECRET`, zustava).
4. **Zastaveni webu na VPS** (aby se uz nic nezapisovalo):

   ```bash
   pm2 stop koskovi-sal
   ```

5. **Databaze**: zkopiruj soubor z `DATABASE_PATH` na VPS (napr. `/var/lib/koskovi-sal/koskovi.sqlite`;
   pokud vedle lezi `-wal` a `-shm`, tak i ty) do `/volume1/docker/koskovi-web/data/` jako
   `koskovi.sqlite`.
6. **Container Manager → Projekt → Vytvorit**: nazev `koskovi-web`, cesta
   `/volume1/docker/koskovi-web`, pouzit existujici `compose.yaml`.
7. **Reverzni proxy** v DSM: `https://web.tkkoskovi.cz:443` → `http://localhost:3011`
   (WebSocket hlavicky nevadi) a certifikat Let's Encrypt pro `web.tkkoskovi.cz`.
8. **VPS nginx**: v bloku serveru `sal.tkkoskovi.cz` nahrad `proxy_pass http://localhost:3001;`
   timto a pak `sudo nginx -t && sudo systemctl reload nginx`:

   ```nginx
   location / {
       proxy_pass https://web.tkkoskovi.cz;
       proxy_ssl_server_name on;
       proxy_set_header Host web.tkkoskovi.cz;
       # Klient podle VPS, ne podle toho, co posle (ochrana limitu prihlaseni).
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_set_header X-Forwarded-Proto https;
       proxy_read_timeout 120s;
   }
   ```

9. **Kontrola**: `https://sal.tkkoskovi.cz` funguje, prihlaseni funguje, v Sprava → Historie
   jsou posledni zmeny z VPS. Pak na VPS `pm2 delete koskovi-sal && pm2 save`.

Zaloha: slozka `/volume1/docker/koskovi-web/data` (napr. Hyper Backup).
