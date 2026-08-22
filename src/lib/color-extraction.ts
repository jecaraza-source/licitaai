function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

/**
 * Extrae los 2 colores dominantes "de marca" de una imagen: agrupa píxeles en
 * cubos de color, descarta blancos/negros/grises casi neutros (típicamente
 * fondo o transparencia) y devuelve los dos cubos más frecuentes que sean
 * visualmente distintos entre sí.
 */
export async function extraerColoresDominantes(
  file: File,
): Promise<{ primario: string; secundario: string | null } | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;

  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const BUCKET = 24;

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isNeutral = max - min < 18; // gris/blanco/negro casi puros
    if (isNeutral) continue;

    const key = `${Math.round(r / BUCKET)}-${Math.round(g / BUCKET)}-${Math.round(b / BUCKET)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const ordenados = [...buckets.values()]
    .map((b) => ({ r: b.r / b.count, g: b.g / b.count, b: b.b / b.count, count: b.count }))
    .sort((a, b) => b.count - a.count);

  if (ordenados.length === 0) return null;

  const primario = ordenados[0];
  const distancia = (a: typeof primario, c: typeof primario) =>
    Math.hypot(a.r - c.r, a.g - c.g, a.b - c.b);

  const secundario = ordenados.slice(1).find((c) => distancia(primario, c) > 60) ?? null;

  return {
    primario: rgbToHex(Math.round(primario.r), Math.round(primario.g), Math.round(primario.b)),
    secundario: secundario
      ? rgbToHex(Math.round(secundario.r), Math.round(secundario.g), Math.round(secundario.b))
      : null,
  };
}
