"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Section } from "../../../components/ui/Section";

type HealthResponse = {
  ok: boolean;
  environment?: string;
  chainMode?: string;
  missing?: string[];
  invalidContracts?: string[];
  services?: Record<string, { configured: boolean }>;
  error?: string;
};

type SupabaseHealthResponse = {
  ok: boolean;
  configured?: boolean;
  tables?: Record<string, number | null>;
  warnings?: string[];
  error?: string;
};

function StatusBadge({ ok, pending }: { ok?: boolean; pending?: boolean }) {
  if (pending) return <Badge variant="outline">Checking</Badge>;
  return <Badge variant={ok ? "success" : "warning"}>{ok ? "Ready" : "Needs attention"}</Badge>;
}

function DiagnosticRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-borderDark py-3 last:border-b-0">
      <span className="text-label">{label}</span>
      <span className="mono-value break-all text-right text-[12px] leading-5 text-slate-300">{value}</span>
    </div>
  );
}

export default function EngineDiagnosticsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [supabase, setSupabase] = useState<SupabaseHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [healthResult, supabaseResult] = await Promise.allSettled([
      fetch("/api/health", { cache: "no-store" }).then((response) => response.json() as Promise<HealthResponse>),
      fetch("/api/health/supabase", { cache: "no-store" }).then((response) => response.json() as Promise<SupabaseHealthResponse>)
    ]);
    setHealth(healthResult.status === "fulfilled" ? healthResult.value : { ok: false, error: "Health endpoint is unavailable." });
    setSupabase(supabaseResult.status === "fulfilled" ? supabaseResult.value : { ok: false, error: "Supabase health endpoint is unavailable." });
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const issues = [
    ...(health?.missing ?? []).map((name) => `Missing environment variable: ${name}`),
    ...(health?.invalidContracts ?? []).map((name) => `Invalid contract address: ${name}`),
    ...(supabase?.warnings ?? [])
  ];

  return (
    <div className="flex flex-col gap-10 animate-fadeInUp">
      <div className="flex flex-col justify-between gap-5 border-b border-borderDark/60 pb-8 md:flex-row md:items-end">
        <div>
          <h1 className="lux-heading text-[36px] tracking-[-0.03em]">Engine Diagnostics</h1>
          <p className="lux-copy mt-2 max-w-2xl text-[15px] text-slate-400">Production-safe environment, persistence, and schema readiness for the Arc Testnet runtime.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/engine"><Button variant="secondary">Arc Testnet status</Button></Link>
          <Button onClick={() => void refresh()} disabled={loading}>{loading ? "Checking..." : "Refresh"}</Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
          <div className="flex items-center justify-between gap-4"><div className="text-label">Server Runtime</div><StatusBadge ok={health?.ok} pending={!health} /></div>
          <div className="mt-4 font-heading text-[24px] text-white">{health?.environment ?? "Checking..."}</div>
        </Card>
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
          <div className="flex items-center justify-between gap-4"><div className="text-label">Supabase</div><StatusBadge ok={supabase?.ok} pending={!supabase} /></div>
          <div className="mt-4 font-heading text-[24px] text-white">{supabase?.configured === false ? "Not configured" : supabase?.ok ? "Connected" : "Review setup"}</div>
        </Card>
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
          <div className="flex items-center justify-between gap-4"><div className="text-label">Open Issues</div><StatusBadge ok={issues.length === 0 && Boolean(health && supabase)} pending={!health || !supabase} /></div>
          <div className="mono-value mt-4 text-[24px] text-white">{health && supabase ? issues.length : "..."}</div>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Environment Readiness">
          <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
            <DiagnosticRow label="Chain mode" value={health?.chainMode ?? "Checking..."} />
            {Object.entries(health?.services ?? {}).map(([name, service]) => (
              <DiagnosticRow key={name} label={name} value={service.configured ? "configured" : "missing"} />
            ))}
            {health?.error ? <p className="mt-4 text-[13px] leading-6 text-warning">{health.error}</p> : null}
          </Card>
        </Section>
        <Section title="Supabase Counts">
          <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
            {supabase?.tables
              ? Object.entries(supabase.tables).map(([table, count]) => <DiagnosticRow key={table} label={table} value={count === null ? "unavailable" : count} />)
              : <p className="text-[13px] leading-6 text-slate-400">Checking persistence tables...</p>}
          </Card>
        </Section>
      </div>

      <Section title="Deployment Notes">
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
          {issues.length > 0
            ? <div className="space-y-3">{issues.map((issue) => <p key={issue} className="text-[13px] leading-6 text-warning">{issue}</p>)}</div>
            : <p className="text-[13px] leading-6 text-success">No deployment warnings reported.</p>}
        </Card>
      </Section>
    </div>
  );
}
