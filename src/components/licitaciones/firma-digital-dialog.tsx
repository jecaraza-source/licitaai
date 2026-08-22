"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CertInfo {
  vigente: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  nombre_comun: string | null;
  rfc: string | null;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function FirmaDigitalDialog({
  documentoId,
  open,
  onOpenChange,
  onFirmado,
}: {
  documentoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFirmado: () => void;
}) {
  const [cerFile, setCerFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [validando, setValidando] = useState(false);
  const [firmando, setFirmando] = useState(false);

  async function handleCerChange(file: File | null) {
    setCerFile(file);
    setCertInfo(null);
    if (!file) return;
    setValidando(true);
    const base64 = await fileToBase64(file);
    const res = await fetch("/api/efirma/validar-certificado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cer_base64: base64 }),
    });
    const json = await res.json();
    setValidando(false);
    if (!res.ok) {
      toast.error("Certificado inválido", { description: json.error });
      return;
    }
    setCertInfo(json.data);
  }

  async function handleFirmar() {
    if (!cerFile || !keyFile || !password) return;
    setFirmando(true);
    const [cer_base64, key_base64] = await Promise.all([
      fileToBase64(cerFile),
      fileToBase64(keyFile),
    ]);

    const res = await fetch(`/api/documentos/${documentoId}/firmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cer_base64, key_base64, password }),
    });
    const json = await res.json();
    setFirmando(false);

    if (!res.ok) {
      toast.error("No se pudo firmar el documento", { description: json.error });
      return;
    }

    toast.success("Documento firmado digitalmente");
    onFirmado();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Firmar con e.firma (SAT)</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Esto genera una firma digital interna (RSA-SHA256) para trazabilidad del documento
            dentro de LicitaAI. No sustituye un sello o firma oficial reconocida por el SAT para
            trámites específicos.
          </p>

          <div className="flex flex-col gap-2">
            <Label>Certificado (.cer)</Label>
            <Input
              type="file"
              accept=".cer"
              onChange={(e) => handleCerChange(e.target.files?.[0] ?? null)}
            />
            {validando && <p className="text-xs text-muted-foreground">Validando…</p>}
            {certInfo && (
              <div
                className={`rounded-md p-2 text-xs ${certInfo.vigente ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}
              >
                <p>{certInfo.nombre_comun}</p>
                {certInfo.rfc && <p>RFC: {certInfo.rfc}</p>}
                <p>{certInfo.vigente ? "Vigente" : "No vigente"} hasta {new Date(certInfo.fecha_fin).toLocaleDateString("es-MX")}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Llave privada (.key)</Label>
            <Input type="file" accept=".key" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Contraseña de la llave</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <Button
            onClick={handleFirmar}
            disabled={!cerFile || !keyFile || !password || !certInfo?.vigente || firmando}
          >
            <ShieldCheck />
            {firmando ? "Firmando…" : "Firmar documento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
