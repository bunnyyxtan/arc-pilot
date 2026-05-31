"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";

function extractDeliverableHash(uri: string) {
  if (!uri.startsWith("local-deliverable://")) return null;
  const hash = uri.slice("local-deliverable://".length).trim();
  return /^0x[a-fA-F0-9]{64}$/.test(hash) ? hash : null;
}

export function DeliverableViewer({ deliverableURI, label = "View Full Report" }: { deliverableURI: string; label?: string }) {
  const router = useRouter();
  const hash = useMemo(() => extractDeliverableHash(deliverableURI), [deliverableURI]);

  return (
    <Button
      variant="primary"
      onClick={() => hash && router.push(`/deliverables/${hash}`)}
      disabled={!hash}
      title={hash ? label : "Unsupported deliverable URI"}
    >
      {label}
    </Button>
  );
}
