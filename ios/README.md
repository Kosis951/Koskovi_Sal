# Koskovi sal – aplikace pro iPhone

Nativni aplikace ve SwiftUI (iOS 17+). Data bere z API webu (stejne prihlaseni jako na webu),
upozorneni chodi pres Apple (APNs) z relaye na NAS. Projekt Xcode se generuje z `project.yml` (XcodeGen), takze se
da sestavit i bez Macu: GitHub Actions (`.github/workflows/ios.yml`) ho po kazdem pushi do
`ios/` sestavi na Macu v GitHubu a nahraje na TestFlight.

Co aplikace umi (verze 1):

- Kalendar salu: tyden, den s akcemi, treninky, zrusenymi treninky a volnym casem; pridani akce
  (sprava salu a treneri), smazani akce / zruseni treninku (kdo smi, jako na webu).
- Lekce u treneru: volne terminy a objednani, moje lekce a zruseni; trener potvrzuje a odmita
  zadosti, vidi potvrzene lekce s tlacitkem WhatsApp.
- Rozpis externiho trenera (zalozka se ukaze, jen kdyz je zverejneny), zadost o zruseni/presun.
- Ucet: prihlaseni, upozorneni (obsazeny sal, uklid), odkazy na spravu a profil na webu.

Zbytek (sprava uzivatelu, pravidelne treninky, casy vyuky treneru, rozpis…) je zatim na webu.

## Jednorazove nastaveni

1. **App Store Connect → Apps → + → New App**: platforma iOS, nazev „Koškovi sál“, jazyk cestina,
   Bundle ID `cz.tkkoskovi.sal` (kdyz v nabidce neni, nejdriv ho zaregistruj v
   developer.apple.com → Certificates, IDs & Profiles → Identifiers → + → App IDs, zaskrtni
   Push Notifications), SKU treba `koskovi-sal`.
2. **API klic pro nahravani**: App Store Connect → Users and Access → Integrations →
   App Store Connect API → Team Keys → +, role **Admin** (kvuli automatickemu podepisovani).
   Stahni `.p8` (jde jen jednou), opis Key ID a Issuer ID.
3. **Team ID**: developer.apple.com → Account → Membership details.
4. **GitHub** → repozitar → Settings → Secrets and variables → Actions:
   - Secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (cely obsah souboru .p8 vcetne
     radku BEGIN/END), `APPLE_TEAM_ID`.
   - Adresa webu je `sal.tkkoskovi.cz` (v `project.yml`); jinou jde nastavit promennou
     `KOSKOVI_HOST` (Variables) bez https://.
5. Actions → iOS → Run workflow (nebo push do `ios/`). Po ~15 minutach je build v App Store
   Connect → TestFlight; prvni build muze cekat na „Missing Compliance“ (aplikace sifrovani
   nepouziva, je to v Info.plist, takze by se nemelo ptat).
6. **Testeri**: TestFlight → Internal Testing → + skupina, pridat sebe (ucty z App Store
   Connect, bez kontroly od Applu). Na iPhonu aplikace TestFlight → Koškovi sál → Nainstalovat.

## Upozorneni

Upozorneni chodi pres relay na NAS (`nas/push-relay`, adresa `push.tkkoskovi.cz`): tam je klic
od Applu, web na VPS posila zpravy jen relayi (`PUSH_RELAY_URL`, `PUSH_RELAY_SECRET` v
`.env.local`). Navod je v `nas/push-relay/README.md`. V aplikaci pak Ucet → Upozorneni →
zapnout → „Poslat zkusebni upozorneni“.

Zarizeni se ukladaji do tabulky `native_push_devices` (API `/api/push/native`); posilaji se
stejna upozorneni jako do prohlizecu.

## Vyvoj na Macu

```bash
brew install xcodegen
cd ios && xcodegen generate && open KoskoviSal.xcodeproj
```

Adresa webu je v `project.yml` (`KOSKOVI_HOST`). Pri spusteni primo z Xcode je potreba
na NAS `APNS_SANDBOX=true`, jinak upozorneni nedojdou (TestFlight a App Store pouzivaji produkcni APNs).
