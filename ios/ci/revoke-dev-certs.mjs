// Every GitHub Mac is new, so the Apple Development certificate Xcode made
// on the last one is useless (its private key went with that Mac) and blocks
// Xcode from making a new one. Revokes the development certificates Xcode
// created through the API ("Created via API"); people's own stay.
// Needs ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 in the environment.
import { createPrivateKey, sign } from "node:crypto";

const { ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY_P8 } = process.env;
const key = createPrivateKey(ASC_KEY_P8);

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${encode({
    aud: "appstoreconnect-v1",
    exp: now + 600,
    iat: now,
    iss: ASC_ISSUER_ID,
  })}`;
  return `${unsigned}.${sign("sha256", Buffer.from(unsigned), { dsaEncoding: "ieee-p1363", key }).toString("base64url")}`;
}

async function asc(method, url) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${url}`, {
    headers: { Authorization: `Bearer ${token()}` },
    method,
  });

  if (!response.ok) {
    throw new Error(`${method} ${url} → ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

const certificates = await asc(
  "GET",
  "/v1/certificates?limit=200&filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT&fields[certificates]=name,displayName,certificateType",
);
const stale = certificates.data.filter((certificate) =>
  `${certificate.attributes.displayName} ${certificate.attributes.name}`.includes("Created via API"),
);

for (const certificate of stale) {
  await asc("DELETE", `/v1/certificates/${certificate.id}`);
  console.log(`zrušen: ${certificate.attributes.name} (${certificate.id})`);
}

console.log(`Zrušeno ${stale.length} starých certifikátů z GitHubu.`);
