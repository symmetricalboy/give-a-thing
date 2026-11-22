import { publishAtmosphereGameDefineOnAppPds } from "../src/lib/atproto/app-pds";

async function main() {
  const ref = await publishAtmosphereGameDefineOnAppPds();
  if (!ref) {
    console.log(
      "[atmosphere.games] APP_ATPROTO_IDENTIFIER / APP_ATPROTO_PASSWORD not set yet; skipping games.atmosphere.define publish."
    );
    return;
  }
  console.log(
    `[atmosphere.games] Published games.atmosphere.define record: ${ref.uri} (cid=${ref.cid})`
  );
}

main().catch((err) => {
  console.error("[atmosphere.games] Registration warning:", err);
  process.exit(1);
});
