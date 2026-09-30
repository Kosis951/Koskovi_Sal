// Prints a new VAPID key pair for push notifications. Put the lines into
// .env.local on the server and restart the app. Generate them once: new keys
// make every device subscribe again.
import webpush from "web-push";

const { privateKey, publicKey } = webpush.generateVAPIDKeys();

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:info@tkkoskovi.cz");
