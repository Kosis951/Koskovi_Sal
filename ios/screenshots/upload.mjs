// Uploads the App Store screenshots (6.9" iPhone) to the version being
// prepared, replacing what is there. Run by .github/workflows/ios-screenshots.yml:
//   node upload.mjs <folder with PNGs, in order>
// Needs ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 and APP_ID in the environment.
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const { APP_ID, ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY_P8 } = process.env;
const folder = process.argv[2];
const displayType = "APP_IPHONE_67";
const locale = "cs";
const key = createPrivateKey(ASC_KEY_P8);

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${encode({
    aud: "appstoreconnect-v1",
    exp: now + 900,
    iat: now,
    iss: ASC_ISSUER_ID,
  })}`;
  return `${unsigned}.${sign("sha256", Buffer.from(unsigned), { dsaEncoding: "ieee-p1363", key }).toString("base64url")}`;
}

async function asc(method, url, body) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${url}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    method,
  });

  if (!response.ok) {
    throw new Error(`${method} ${url} → ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

const versions = await asc("GET", `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`);
const version = versions.data.find((item) =>
  ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"].includes(item.attributes.appStoreState),
);

if (!version) {
  throw new Error("Žádná verze, do které jde nahrát snímky.");
}

const localizations = await asc("GET", `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
const localization = localizations.data.find((item) => item.attributes.locale === locale) ?? localizations.data[0];
const sets = await asc("GET", `/v1/appStoreVersionLocalizations/${localization.id}/appScreenshotSets`);
let set = sets.data.find((item) => item.attributes.screenshotDisplayType === displayType);

if (!set) {
  set = (
    await asc("POST", "/v1/appScreenshotSets", {
      data: {
        attributes: { screenshotDisplayType: displayType },
        relationships: { appStoreVersionLocalization: { data: { id: localization.id, type: "appStoreVersionLocalizations" } } },
        type: "appScreenshotSets",
      },
    })
  ).data;
}

for (const old of (await asc("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data) {
  await asc("DELETE", `/v1/appScreenshots/${old.id}`);
}

const files = readdirSync(folder).filter((name) => name.endsWith(".png")).sort();

for (const name of files) {
  const bytes = readFileSync(path.join(folder, name));
  const screenshot = (
    await asc("POST", "/v1/appScreenshots", {
      data: {
        attributes: { fileName: name, fileSize: bytes.length },
        relationships: { appScreenshotSet: { data: { id: set.id, type: "appScreenshotSets" } } },
        type: "appScreenshots",
      },
    })
  ).data;

  for (const operation of screenshot.attributes.uploadOperations) {
    const response = await fetch(operation.url, {
      body: bytes.subarray(operation.offset, operation.offset + operation.length),
      headers: Object.fromEntries((operation.requestHeaders ?? []).map((header) => [header.name, header.value])),
      method: operation.method,
    });

    if (!response.ok) {
      throw new Error(`nahrání ${name} → ${response.status}`);
    }
  }

  await asc("PATCH", `/v1/appScreenshots/${screenshot.id}`, {
    data: {
      attributes: { sourceFileChecksum: createHash("md5").update(bytes).digest("hex"), uploaded: true },
      id: screenshot.id,
      type: "appScreenshots",
    },
  });
  console.log(`nahráno: ${name}`);
}

console.log(`${files.length} snímků ve verzi ${version.attributes.versionString} (${locale}, ${displayType}).`);
