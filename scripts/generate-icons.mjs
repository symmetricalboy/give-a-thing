import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function main() {
  const svgPath = path.join(process.cwd(), "public", "icon.svg");
  const svgBuf = fs.readFileSync(svgPath);

  // Rasterize at native 32x32 first, then nearest-neighbor upscale so every pixel edge is 100% razor-sharp!
  const base32 = await sharp(svgBuf, { density: 72 })
    .resize(32, 32, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  const avatar1024 = await sharp(base32)
    .resize(1024, 1024, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const icon512 = await sharp(base32)
    .resize(512, 512, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const icon256 = await sharp(base32)
    .resize(256, 256, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(path.join(process.cwd(), "public", "avatar.png"), avatar1024);
  fs.writeFileSync(path.join(process.cwd(), "public", "icon.png"), icon512);
  fs.writeFileSync(path.join(process.cwd(), "public", "icon-256.png"), icon256);

  console.log("Generated circle-safe PNG icons: public/avatar.png (1024x1024), public/icon.png (512x512), public/icon-256.png (256x256)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
