import { LayoutDashboard } from "lucide-react";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Operación</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            <LayoutDashboard className="size-5" />
          </span>
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Resumen general de tus licitaciones.</p>
      </div>
      <DashboardContent />
    </div>
  );
}
