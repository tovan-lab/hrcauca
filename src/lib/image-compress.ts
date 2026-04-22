/**
 * Client-side image compression utility.
 * Resizes to max 600px width and outputs JPEG at quality 0.6.
 * Target: each file < 100KB.
 */
export async function compressImage(blob: Blob, maxWidth = 600, quality = 0.6): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;

      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (result) => {
          if (!result) return reject(new Error('Compression failed'));
          // If still > 100KB, try lower quality
          if (result.size > 100 * 1024 && quality > 0.3) {
            canvas.toBlob(
              (r2) => resolve(r2 || result),
              'image/jpeg',
              0.4
            );
          } else {
            resolve(result);
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
