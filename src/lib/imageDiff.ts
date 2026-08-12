import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { SCREENSHOT_DIR } from "@/lib/scraper";

export interface DiffResult {
  /** Путь к PNG с подсветкой различий. */
  diffPath: string;
  /** Доля изменившихся пикселей (0..1). */
  diffRatio: number;
}

/** Расширяет изображение до нужного размера прозрачными пикселями. */
function padTo(source: PNG, width: number, height: number): PNG {
  if (source.width === width && source.height === height) {
    return source;
  }
  const target = new PNG({ width, height });
  PNG.bitblt(
    source,
    target,
    0,
    0,
    Math.min(source.width, width),
    Math.min(source.height, height),
    0,
    0,
  );
  return target;
}

/**
 * Сравнивает два скриншота попиксельно и сохраняет изображение с подсветкой
 * различий. Изображения разного размера дополняются до общего размера.
 */
export async function createDiffImage(
  oldPath: string,
  newPath: string,
): Promise<DiffResult> {
  const [oldRaw, newRaw] = await Promise.all([
    readFile(oldPath).then((buffer) => PNG.sync.read(buffer)),
    readFile(newPath).then((buffer) => PNG.sync.read(buffer)),
  ]);

  const width = Math.max(oldRaw.width, newRaw.width);
  const height = Math.max(oldRaw.height, newRaw.height);
  const before = padTo(oldRaw, width, height);
  const after = padTo(newRaw, width, height);
  const diff = new PNG({ width, height });

  const changedPixels = pixelmatch(
    before.data,
    after.data,
    diff.data,
    width,
    height,
    { threshold: 0.1, alpha: 0.4, diffColor: [255, 0, 0] },
  );

  const diffPath = path.join(SCREENSHOT_DIR, `${randomUUID()}-diff.png`);
  await writeFile(diffPath, PNG.sync.write(diff));

  return { diffPath, diffRatio: changedPixels / (width * height) };
}
