import { Card } from "../ui/Card";

export function JobActionPanel({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-6 bg-panelSolid/80 border-t-accent/30 shadow-glow">
      <div className="flex flex-col gap-4">
        <h3 className="text-label text-slate-300">Execute Action</h3>
        {children}
      </div>
    </Card>
  );
}
