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

1. **App Store Connect → Apps → + → New App**: platforma iOS, nazev „TK Koškovi“ (hotovo, SKU `tk-koskovi-sal`), jazyk cestina,
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
   Connect, bez kontroly od Applu). Na iPhonu aplikace TestFlight → TK Koškovi → Nainstalovat.

## Upozorneni

Upozorneni chodi pres relay na NAS (`nas/push-relay`, adresa `app.tkkoskovi.cz`): tam je klic
od Applu, web na VPS posila zpravy jen relayi (`PUSH_RELAY_URL`, `PUSH_RELAY_SECRET` v
`.env.local`). Navod je v `nas/push-relay/README.md`. V aplikaci pak Ucet → Upozorneni →
zapnout → „Poslat zkusebni upozorneni“.

Zarizeni se ukladaji do tabulky `native_push_devices` (API `/api/push/native`); posilaji se
stejna upozorneni jako do prohlizecu.

## Sestaveni na Macu (Xcode 27 / iOS 27 SDK)

Od dubna 2027 Apple bere jen buildy s iOS 27 SDK (Xcode 27). Na Macu s macOS 26:

```bash
brew install xcodegen
git clone https://github.com/Kosis951/Koskovi_Sal.git
cd Koskovi_Sal/ios && xcodegen generate && open KoskoviSal.xcodeproj
```

1. Xcode → Settings → Accounts → pridat Apple ID vyvojarskeho uctu.
2. Target KoskoviSal → Signing & Capabilities: Team `44HJR678JA`, Automatically manage signing.
3. Target → General → Build: cislo vetsi nez posledni na TestFlightu (napr. `1000`).
4. Nahore zvolit zarizeni „Any iOS Device (arm64)“ → Product → Archive.
5. Organizer → Distribute App → App Store Connect → Upload.

### Xcode Cloud (stavi Apple po kazdem pushi, vzdy s nejnovejsim Xcode)

Jednou na Macu: Product → Xcode Cloud → Create Workflow → pripojit GitHub repozitar
`Kosis951/Koskovi_Sal` → akce Archive (iOS) → Post-Actions: TestFlight (Internal Testing,
skupina „Interni testeri“). Projekt si Xcode Cloud vygeneruje sam (`ci_scripts/ci_post_clone.sh`),
cisla buildu jsou 1000 + cislo buildu Xcode Cloud. Zdarma je 25 hodin mesicne. Pak lze nahravani
z GitHubu vypnout (secrets `ASC_*` smazat) a GitHub bude jen kontrolovat, ze se kod prelozi.

## Vyvoj na Macu

Adresa webu je v `project.yml` (`KOSKOVI_HOST`). Pri spusteni primo z Xcode je potreba
na NAS `APNS_SANDBOX=true`, jinak upozorneni nedojdou (TestFlight a App Store pouzivaji produkcni APNs).
