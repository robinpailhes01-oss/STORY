import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sniffImageBytes, sniffImageType } from "./sniff";

const FIXTURES = join(__dirname, "../../../tests/fixtures/photos");
const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

/** Boîte « ftyp » construite : taille, « ftyp », marque majeure, version 0, marques compatibles. */
function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + compatible.length * 4;
  const bytes = new Uint8Array(size + 8);
  new DataView(bytes.buffer).setUint32(0, size);
  const text = "ftyp" + major + "\0\0\0\0" + compatible.join("");
  for (let i = 0; i < text.length; i++) bytes[4 + i] = text.charCodeAt(i);
  return bytes;
}

describe("sniffImageBytes", () => {
  it("reconnaît les fixtures par leurs octets", () => {
    expect(sniffImageBytes(fixture("jpeg-exif6-1600x1200.jpg"))).toBe("image/jpeg");
    expect(sniffImageBytes(fixture("png-alpha-1080x1350.png"))).toBe("image/png");
    expect(sniffImageBytes(fixture("webp-900x1200.webp"))).toBe("image/webp");
    expect(sniffImageBytes(fixture("heic-1200x1600.heic"))).toBe("image/heic");
    expect(sniffImageBytes(fixture("heic-irot-1600x1200.heic"))).toBe("image/heic");
  });

  it("refuse un texte renommé en .jpg", () => {
    expect(sniffImageBytes(fixture("faux.jpg"))).toBeNull();
  });

  it("reconnaît toutes les marques HEIF/HEVC", () => {
    for (const brand of ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]) {
      expect(sniffImageBytes(ftyp(brand)), brand).toBe("image/heic");
    }
    expect(sniffImageBytes(ftyp("mif1", ["mif1", "heic", "miaf"]))).toBe("image/heic");
  });

  it("ne confond pas AVIF, MP4 ou un en-tête tronqué avec du HEIC", () => {
    expect(sniffImageBytes(ftyp("avif", ["avif", "mif1", "miaf"]))).toBeNull();
    expect(sniffImageBytes(ftyp("mif1", ["mif1", "avif"]))).toBeNull();
    expect(sniffImageBytes(ftyp("isom", ["isom", "mp41"]))).toBeNull();
    expect(sniffImageBytes(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageBytes(new Uint8Array([]))).toBeNull();
  });

  it("ne se fie qu’aux octets RIFF….WEBP", () => {
    const wav = new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt ");
    expect(sniffImageBytes(wav)).toBeNull();
  });
});

describe("sniffImageType", () => {
  it("lit la tête d’un Blob", async () => {
    expect(await sniffImageType(new Blob([fixture("webp-900x1200.webp")]))).toBe("image/webp");
    expect(await sniffImageType(new Blob(["bonjour"]))).toBeNull();
  });
});
