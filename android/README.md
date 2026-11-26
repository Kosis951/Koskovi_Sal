# TK Koškovi pro Android

Nativní aplikace (Kotlin, Jetpack Compose) se stejnými funkcemi jako iPhone:
kalendář sálu, lekce s trenéry, rozpis externího trenéra a účet.

## Sestavení

APK sestavuje GitHub (workflow **Android**) při každé změně ve složce `android/`
a zveřejní ho jako vydání `android-latest`. NAS ho nabízí na
<https://app.tkkoskovi.cz/app/koskovi-sal.apk> (relay si ho stáhne z vydání).

## Podpisový klíč

Aby šlo aplikaci aktualizovat bez přeinstalace, musí být každá verze podepsaná
stejným klíčem. Klíč patří do GitHub secrets:

| Secret | Obsah |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | soubor s klíčem (PKCS12) v base64 |
| `ANDROID_KEYSTORE_PASSWORD` | heslo k souboru |
| `ANDROID_KEY_ALIAS` | jméno klíče v souboru |
| `ANDROID_KEY_PASSWORD` | heslo ke klíči (u PKCS12 stejné jako k souboru) |

Bez nich se APK podepíše ladicím klíčem stroje, na kterém se sestavuje.

## Upozornění (Firebase Cloud Messaging)

Upozornění chodí přes Google, stejně jako na iPhonu přes Apple; nic dalšího se
do telefonu instalovat nemusí.

1. V [konzoli Firebase](https://console.firebase.google.com) vytvoř projekt
   (Google Analytics není potřeba) a přidej do něj Android aplikaci s názvem
   balíčku `cz.tkkoskovi.sal`.
2. Stáhni `google-services.json` a celý jeho obsah vlož do GitHub secretu
   `GOOGLE_SERVICES_JSON`. Bez něj se aplikace sestaví, jen bez upozornění.
3. Nastavení projektu → Servisní účty → Vygenerovat nový soukromý klíč →
   soubor patří na NAS do `/docker/koskovi-push/secrets/fcm.json` (relay posílá
   upozornění jeho jménem).
