import { toast } from "sonner";

export async function descargarBlob(url: string, nombreArchivo: string, opciones?: RequestInit) {
  const res = await fetch(url, opciones);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const faltantes = json.error?.details?.faltantes ?? json.faltantes;
    toast.error("No se pudo generar el documento", { description: faltantes?.join(", ") });
    return;
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(blobUrl);
}
