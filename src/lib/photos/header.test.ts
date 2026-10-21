import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { neutralizeOrientation, orientedSize, readImageHeader } from "./header";

const FIXTURES = join(__dirname, "../../../tests/fixtures/photos");
const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

describe("readImageHeader", () => {
  it("lit l’orientation EXIF et les dimensions stockées des JPEG", () => {
    const six = readImageHeader(fixture("jpeg-exif6-1600x1200.jpg"), "image/jpeg");
    expect(six).toMatchObject({ orientation: 6, storedWidth: 1600, storedHeight: 1200 });
    expect(orientedSize(six)).toEqual({ width: 1200, height: 1600 });

    const three = readImageHeader(fixture("jpeg-exif3-1200x1600.jpg"), "image/jpeg");
    expect(three).toMatchObject({ orientation: 3, storedWidth: 1200, storedHeight: 1600 });
    expect(orientedSize(three)).toEqual({ width: 1200, height: 1600 });

    const eight = readImageHeader(fixture("jpeg-exif8-1600x1200.jpg"), "image/jpeg");
    expect(eight.orientation).toBe(8);

    const plain = readImageHeader(fixture("grosse-6000x8000.jpg"), "image/jpeg");
    expect(plain).toMatchObject({ orientation: 1, storedWidth: 6000, storedHeight: 8000 });
    expect(plain.orientationOffset).toBeUndefined();
  });

  it("lit les dimensions des PNG et WebP", () => {
    expect(readImageHeader(fixture("png-alpha-1080x1350.png"), "image/png")).toMatchObject({
      storedWidth: 1080,
      storedHeight: 1350,
    });
    expect(readImageHeader(fixture("webp-900x1200.webp"), "image/webp")).toMatchObject({
      storedWidth: 900,
      storedHeight: 1200,
    });
  });

  it("ne lève pas sur des octets tronqués ou corrompus", () => {
    const truncated = fixture("jpeg-exif6-1600x1200.jpg").subarray(0, 40);
    expect(() => readImageHeader(truncated, "image/jpeg")).not.toThrow();
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 1]), "image/jpeg").orientation).toBe(1);
    expect(readImageHeader(new Uint8Array(4), "image/png")).toEqual({ orientation: 1 });
  });
});

describe("neutralizeOrientation", () => {
  it("ramène le tag à 1 dans une copie, sans toucher l’original", () => {
    const bytes = fixture("jpeg-exif6-1600x1200.jpg");
    const header = readImageHeader(bytes, "image/jpeg");
    const neutral = neutralizeOrientation(bytes, header);
    expect(readImageHeader(neutral, "image/jpeg")).toMatchObject({ orientation: 1, storedWidth: 1600 });
    expect(readImageHeader(bytes, "image/jpeg").orientation).toBe(6);
    expect(neutral.length).toBe(bytes.length);
  });
});
