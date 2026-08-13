import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const SCREENSHOT_DIR = path.join(tmpdir(), "imageDiff-test-out");

vi.mock("@/lib/scraper", () => ({ SCREENSHOT_DIR }));

const { createDiffImage } = await import("@/lib/imageDiff");

let workDir: string;

/** Однотонное PNG-изображение. */
async function writePng(
  name: string,
  width: number,
  height: number,
  color: [number, number, number],
): Promise<string> {
  const png = new PNG({ width, height });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = color[0];
    png.data[index + 1] = color[1];
    png.data[index + 2] = color[2];
    png.data[index + 3] = 255;
  }
  const filePath = path.join(workDir, name);
  await writeFile(filePath, PNG.sync.write(png));
  return filePath;
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "imageDiff-test-"));
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(SCREENSHOT_DIR, { recursive: true }),
  );
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
  await rm(SCREENSHOT_DIR, { recursive: true, force: true });
});

describe("createDiffImage", () => {
  it("reports a zero ratio for identical screenshots", async () => {
    const before = await writePng("same-a.png", 4, 4, [10, 20, 30]);
    const after = await writePng("same-b.png", 4, 4, [10, 20, 30]);

    const { diffPath, diffRatio } = await createDiffImage(before, after);

    expect(diffRatio).toBe(0);
    expect(diffPath.startsWith(`${SCREENSHOT_DIR}/`)).toBe(true);
    expect(diffPath.endsWith("-diff.png")).toBe(true);
    await expect(readFile(diffPath)).resolves.toBeInstanceOf(Buffer);
  });

  it("reports a full ratio when every pixel changed", async () => {
    const before = await writePng("all-a.png", 4, 4, [0, 0, 0]);
    const after = await writePng("all-b.png", 4, 4, [255, 255, 255]);

    const { diffRatio } = await createDiffImage(before, after);

    expect(diffRatio).toBe(1);
  });

  it("writes a diff image of the size of the compared screenshots", async () => {
    const before = await writePng("size-a.png", 4, 4, [0, 0, 0]);
    const after = await writePng("size-b.png", 4, 4, [255, 255, 255]);

    const { diffPath } = await createDiffImage(before, after);
    const diff = PNG.sync.read(await readFile(diffPath));

    expect([diff.width, diff.height]).toEqual([4, 4]);
  });

  it("pads screenshots of different sizes to the larger canvas", async () => {
    const before = await writePng("pad-a.png", 2, 2, [0, 0, 0]);
    const after = await writePng("pad-b.png", 4, 6, [0, 0, 0]);

    const { diffPath, diffRatio } = await createDiffImage(before, after);
    const diff = PNG.sync.read(await readFile(diffPath));

    expect([diff.width, diff.height]).toEqual([4, 6]);
    // Совпадает только перекрывающийся квадрат 2×2 из 24 пикселей.
    expect(diffRatio).toBeCloseTo((24 - 4) / 24, 5);
  });

  it("gives every diff its own file name", async () => {
    const before = await writePng("uniq-a.png", 2, 2, [0, 0, 0]);
    const after = await writePng("uniq-b.png", 2, 2, [1, 1, 1]);

    const first = await createDiffImage(before, after);
    const second = await createDiffImage(before, after);

    expect(first.diffPath).not.toBe(second.diffPath);
  });

  it("rejects when a screenshot is missing", async () => {
    const before = await writePng("missing-a.png", 2, 2, [0, 0, 0]);

    await expect(
      createDiffImage(before, path.join(workDir, "nope.png")),
    ).rejects.toThrow();
  });
});
