import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LicitacionesTable } from "@/components/licitaciones/licitaciones-table";

export default function LicitacionesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Licitaciones</h1>
          <p className="text-muted-foreground">Todas las licitaciones de tu organización.</p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/licitaciones/nueva">Nueva licitación</Link>}
        />
      </div>
      <LicitacionesTable />
    </div>
  );
}
