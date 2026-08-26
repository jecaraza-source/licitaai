"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { firmarDocumento, hashDocumentoHex } from "@/lib/efirma";

interface CertInfo {
  vigente: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  nombre_comun: string | null;
  rfc: string | null;
}

const BUCKET = "documentos-originales";

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
  storagePath,
  open,
  onOpenChange,
  onFirmado,
}: {
  documentoId: string;
  storagePath: string;
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
  const [rfcDistintoError, setRfcDistintoError] = useState<string | null>(null);
  const [confirmarRfcDistinto, setConfirmarRfcDistinto] = useState(false);

  async function handleCerChange(file: File | null) {
    setCerFile(file);
    setCertInfo(null);
    setRfcDistintoError(null);
    setConfirmarRfcDistinto(false);
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
    setRfcDistintoError(null);
    try {
      const [cer_base64, key_base64] = await Promise.all([
        fileToBase64(cerFile),
        fileToBase64(keyFile),
      ]);

      // El documento se descarga directamente del navegador (Storage ya
      // exige que el path empiece con el organization_id del usuario), y la
      // firma se calcula aquí mismo: la llave privada y la contraseña
      // NUNCA se envían al servidor, solo el certificado (público) y el
      // resultado de la firma.
      const supabase = createClient();
      const { data: archivo, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(storagePath);
      if (downloadError || !archivo) {
        toast.error("No se pudo descargar el documento para firmarlo");
        return;
      }
      const documentBytes = await archivo.arrayBuffer();

      let firma_base64: string;
      try {
        firma_base64 = firmarDocumento(key_base64, password, documentBytes);
      } catch (e) {
        toast.error("No se pudo firmar", {
          description: e instanceof Error ? e.message : "Contraseña incorrecta o llave inválida",
        });
        return;
      }
      const documento_hash_sha256 = hashDocumentoHex(documentBytes);

      const res = await fetch(`/api/documentos/${documentoId}/firmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cer_base64,
          firma_base64,
          documento_hash_sha256,
          confirmar_rfc_distinto: confirmarRfcDistinto,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.error === "rfc_distinto") {
          setRfcDistintoError(json.detalle ?? "El RFC del certificado no coincide con la empresa activa");
          return;
        }
        toast.error("No se pudo firmar el documento", { description: json.error });
        return;
      }

      toast.success("Documento firmado");
      onFirmado();
      onOpenChange(false);
    } finally {
      setFirmando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Firma interna de integridad</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Genera una firma digital (RSA-SHA256) para trazabilidad e integridad del documento
            dentro de LicitaAI, calculada en tu navegador. No es una firma SAT, e.firma oficial ni
            PAdES — no sustituye un sello o firma reconocida oficialmente por el SAT para trámites.
            Tu llave privada y contraseña nunca se envían a nuestros servidores.
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

          {rfcDistintoError && (
            <div className="flex flex-col gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700">
              <p>{rfcDistintoError}</p>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={confirmarRfcDistinto}
                  onCheckedChange={(checked) => setConfirmarRfcDistinto(checked === true)}
                />
                Confirmo que esta persona está autorizada a firmar en nombre de la empresa
              </label>
            </div>
          )}

          <Button
            onClick={handleFirmar}
            disabled={
              !cerFile ||
              !keyFile ||
              !password ||
              !certInfo?.vigente ||
              firmando ||
              (rfcDistintoError !== null && !confirmarRfcDistinto)
            }
          >
            <ShieldCheck />
            {firmando ? "Firmando…" : "Firmar documento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
