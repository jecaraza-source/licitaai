"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChecklistOption {
  id: string;
  descripcion: string;
  categoria: string;
}

export function VincularAclaracionDialog({ licitacionId }: { licitacionId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChecklistOption[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/licitaciones/${licitacionId}/auditoria`)
      .then((res) => res.json())
      .then((json) => setItems(json.data?.checklist ?? []));
  }, [open, licitacionId]);

  function toggle(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function guardar() {
    if (seleccionados.size === 0) return;
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/junta-aclaraciones/vincular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: Array.from(seleccionados) }),
    });
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo vincular la aclaración");
      return;
    }
    toast.success(`${seleccionados.size} requisito(s) marcados para revisar en la matriz`);
    setSeleccionados(new Set());
    setOpen(false);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Link2 />
        Vincular a requisitos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>Requisitos afectados por esta aclaración</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Marca los requisitos de la matriz que esta junta modificó. Se marcarán con la fuente
          &quot;Aclaración&quot; y, si ya estaban en verde, volverán a amarillo para forzar su
          re-verificación.
        </p>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {items.map((item) => (
            <label key={item.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
              <Checkbox
                checked={seleccionados.has(item.id)}
                onCheckedChange={() => toggle(item.id)}
              />
              <span>
                {item.descripcion}
                <Label className="ml-1.5 text-xs text-muted-foreground">({item.categoria})</Label>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={guardando || seleccionados.size === 0}>
            {guardando ? "Guardando…" : `Vincular ${seleccionados.size || ""}`.trim()}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
