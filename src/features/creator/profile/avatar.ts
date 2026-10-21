// Photo de profil : importée comme les autres photos (format réel, orientation, métadonnées retirées), puis
// réduite en petit carré JPEG. Gardée sur l’appareil (localStorage), jamais envoyée à l’API.
import { importPhoto, releasePhoto } from "@/lib/photos";

export const AVATAR_SIDE = 192;

export async function makeAvatar(file: Blob): Promise<string> {
  const photo = await importPhoto(file, { maxSide: 1024 });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIDE;
    canvas.height = AVATAR_SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    const side = Math.min(photo.width, photo.height);
    // Carré centré, un peu remonté : le visage est plus souvent dans le haut de la photo.
    const sx = (photo.width - side) / 2;
    const sy = Math.max(0, Math.min(photo.height - side, (photo.height - side) * 0.3));
    ctx.drawImage(photo.image, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    releasePhoto(photo);
  }
}
