import sharp from "sharp";

export interface ProcessedPixelSprite {
  /** Canonical 64x64 transparent 16-bit RGBA5551 sprite PNG (~3-10 KB) */
  sprite64Png: Buffer;
  /** Crisp nearest-neighbor upscaled 512x512 PNG for PDS upload, social previews & zoom */
  sprite512Png: Buffer;
}

function colorDistSq(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

/**
 * Converts a raw generated 1:1 sprite image into an authentic, razor-sharp
 * 16-bit RPG inventory icon:
 * 1. Samples corners and performs a border-connected flood-fill alpha cutout
 *    (so interior object highlights of similar colors are never hollowed out).
 * 2. Auto-crops & centers the object with breathing room inside a 64x64 grid.
 * 3. Snaps alpha to crisp 1-bit pixel edges and quantizes RGB to 15-bit SNES RGB555
 *    (32 levels per channel) + crisp dark pixel outline reinforcement.
 * 4. Produces both a canonical 64x64 PNG and a nearest-neighbor 512x512 PNG with EXIF stripped.
 */
export async function processInto16BitSprite(
  rawImageBuffer: Buffer
): Promise<ProcessedPixelSprite> {
  // Step 1: Normalize to 256x256 RGBA work canvas for clean border flood-fill
  const workSize = 256;
  const { data: workBuf } = await sharp(rawImageBuffer)
    .ensureAlpha()
    .resize(workSize, workSize, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(workBuf);

  // Average the 4 corner pixels to determine background key color
  const cornerCoords = [
    [1, 1],
    [workSize - 2, 1],
    [1, workSize - 2],
    [workSize - 2, workSize - 2],
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let opaqueCorners = 0;
  for (const [cx, cy] of cornerCoords) {
    const idx = (cy! * workSize + cx!) * 4;
    if (pixels[idx + 3]! > 20) {
      bgR += pixels[idx]!;
      bgG += pixels[idx + 1]!;
      bgB += pixels[idx + 2]!;
      opaqueCorners++;
    }
  }

  if (opaqueCorners > 0) {
    bgR = Math.round(bgR / opaqueCorners);
    bgG = Math.round(bgG / opaqueCorners);
    bgB = Math.round(bgB / opaqueCorners);

    // Border-connected BFS flood fill to strip flat background cleanly
    const toleranceSq = 58 * 58;
    const visited = new Uint8Array(workSize * workSize);
    const queue = new Int32Array(workSize * workSize);
    let head = 0;
    let tail = 0;

    const tryEnqueue = (x: number, y: number) => {
      if (x < 0 || x >= workSize || y < 0 || y >= workSize) return;
      const pIdx = y * workSize + x;
      if (visited[pIdx]) return;
      const rgbaIdx = pIdx * 4;
      const r = pixels[rgbaIdx]!;
      const g = pixels[rgbaIdx + 1]!;
      const b = pixels[rgbaIdx + 2]!;
      const a = pixels[rgbaIdx + 3]!;
      if (a < 25 || colorDistSq(r, g, b, bgR, bgG, bgB) <= toleranceSq) {
        visited[pIdx] = 1;
        queue[tail++] = pIdx;
      }
    };

    for (let i = 0; i < workSize; i++) {
      tryEnqueue(i, 0);
      tryEnqueue(i, workSize - 1);
      tryEnqueue(0, i);
      tryEnqueue(workSize - 1, i);
    }

    while (head < tail) {
      const pIdx = queue[head++]!;
      pixels[pIdx * 4 + 3] = 0;
      const x = pIdx % workSize;
      const y = (pIdx - x) / workSize;
      tryEnqueue(x + 1, y);
      tryEnqueue(x - 1, y);
      tryEnqueue(x, y + 1);
      tryEnqueue(x, y - 1);
    }
  }

  // Find bounding box of foreground object so every icon fills the inventory slot nicely
  let minX = workSize;
  let minY = workSize;
  let maxX = 0;
  let maxY = 0;
  let foundForeground = false;

  for (let y = 0; y < workSize; y++) {
    for (let x = 0; x < workSize; x++) {
      const a = pixels[(y * workSize + x) * 4 + 3]!;
      if (a > 40) {
        foundForeground = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  let croppedSharp = sharp(Buffer.from(pixels), {
    raw: { width: workSize, height: workSize, channels: 4 },
  });

  if (foundForeground && maxX > minX + 8 && maxY > minY + 8) {
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const side = Math.max(bw, bh);
    const pad = Math.max(8, Math.round(side * 0.08));
    const cx = Math.round((minX + maxX) / 2);
    const cy = Math.round((minY + maxY) / 2);
    const half = Math.ceil(side / 2) + pad;

    const left = Math.max(0, cx - half);
    const top = Math.max(0, cy - half);
    const extractW = Math.min(workSize - left, half * 2);
    const extractH = Math.min(workSize - top, half * 2);

    croppedSharp = croppedSharp.extract({
      left,
      top,
      width: extractW,
      height: extractH,
    });
  }

  // Step 2: Snap onto a 56x56 inner sprite centered inside a 64x64 inventory cell
  const gridSize = 64;
  const innerSize = 56;
  const { data: innerRaw } = await croppedSharp
    .resize(innerSize, innerSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const gridPixels = new Uint8Array(gridSize * gridSize * 4);
  const offset = Math.floor((gridSize - innerSize) / 2);

  // Quantize to authentic 16-bit SNES RGB555 (32 levels/channel) + binary sprite alpha
  const quant5Bit = (v: number) => Math.round((Math.round((v / 255) * 31) / 31) * 255);

  for (let y = 0; y < innerSize; y++) {
    for (let x = 0; x < innerSize; x++) {
      const srcIdx = (y * innerSize + x) * 4;
      const dstIdx = ((y + offset) * gridSize + (x + offset)) * 4;
      const a = innerRaw[srcIdx + 3]!;
      if (a >= 115) {
        gridPixels[dstIdx] = quant5Bit(innerRaw[srcIdx]!);
        gridPixels[dstIdx + 1] = quant5Bit(innerRaw[srcIdx + 1]!);
        gridPixels[dstIdx + 2] = quant5Bit(innerRaw[srcIdx + 2]!);
        gridPixels[dstIdx + 3] = 255;
      }
    }
  }

  // Reinforce a subtle dark 16-bit RPG 1px outline around transparent boundaries
  const outlined = new Uint8Array(gridPixels);
  for (let y = 1; y < gridSize - 1; y++) {
    for (let x = 1; x < gridSize - 1; x++) {
      const idx = (y * gridSize + x) * 4;
      if (gridPixels[idx + 3] === 0) {
        const hasOpaqueNeighbor =
          gridPixels[((y - 1) * gridSize + x) * 4 + 3] === 255 ||
          gridPixels[((y + 1) * gridSize + x) * 4 + 3] === 255 ||
          gridPixels[(y * gridSize + (x - 1)) * 4 + 3] === 255 ||
          gridPixels[(y * gridSize + (x + 1)) * 4 + 3] === 255;
        if (hasOpaqueNeighbor) {
          outlined[idx] = 24;
          outlined[idx + 1] = 18;
          outlined[idx + 2] = 32;
          outlined[idx + 3] = 255;
        }
      }
    }
  }

  const sprite64Png = await sharp(Buffer.from(outlined), {
    raw: { width: gridSize, height: gridSize, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: true, colors: 48 })
    .toBuffer();

  const sprite512Png = await sharp(Buffer.from(outlined), {
    raw: { width: gridSize, height: gridSize, channels: 4 },
  })
    .resize(512, 512, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, palette: true, colors: 48 })
    .toBuffer();

  return { sprite64Png, sprite512Png };
}
