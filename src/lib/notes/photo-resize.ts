import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE_PX } from "./ai-notes";

/** Longest side at most `maxEdge`, keeping the shape. */
export function fitWithin(width: number, height: number, maxEdge = PHOTO_MAX_EDGE_PX): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Shrinks a phone photo to a JPEG of at most 1600 px, so it uploads fast on mobile data and
 * stays well under the server's size limit. Nothing is kept: the picture goes to the AI once.
 */
export async function shrinkPhoto(file: File): Promise<{ data: string; mimeType: "image/jpeg"; previewUrl: string }> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    // Let the browser shrink while decoding, so a huge camera photo doesn't run out of memory.
    bitmap = await createImageBitmap(file, { resizeWidth: PHOTO_MAX_EDGE_PX, resizeQuality: "high" }).then(async (small) => {
      if (small.height <= PHOTO_MAX_EDGE_PX * 2) return small;
      // A very tall picture: decode at full size and shrink on the canvas instead.
      small.close();
      return createImageBitmap(file);
    });
  } catch {
    // Older Safari: fall back to an <img>.
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("unreadable"));
      };
      img.src = url;
    });
  }
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  // White first, so a see-through PNG doesn't turn black as a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length * 0.75 > PHOTO_MAX_BYTES && quality > 0.4) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (data.length * 0.75 > PHOTO_MAX_BYTES) throw new Error("too_big");
  return { data, mimeType: "image/jpeg", previewUrl: dataUrl };
}
