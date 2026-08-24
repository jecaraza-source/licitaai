import { LayoutDashboard } from "lucide-react";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <LayoutDashboard className="size-5 text-primary" />
          Dashboard
        </h1>
        <p className="text-muted-foreground">Resumen general de tus licitaciones.</p>
      </div>
      <DashboardContent />
    </div>
  );
}
