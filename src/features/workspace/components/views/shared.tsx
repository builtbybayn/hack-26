"use client";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type { SourceLocation } from "@/features/workspace/lib/models";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import { locationLabel } from "@/features/workspace/lib/service";

export function PageHeading({
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="mt-2 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function SectionTitle({
  title,
  href,
  link,
}: {
  title: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-[#d4d4d4]">{title}</h2>
      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-semibold text-neutral hover:text-neutral-bright"
        >
          {link || "View all"} <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}
export function SourceLink({
  location,
  children,
}: {
  location: SourceLocation;
  children?: ReactNode;
}) {
  const { data, setActiveDocumentId } = useWorkspace();
  const doc = data.documents.find((item) => item.id === location.documentId);
  return (
    <Link
      href={`/reader?${new URLSearchParams({ doc: location.documentId, ...(location.passageId || location.page ? { passage: location.passageId || `p${location.page}` } : {}) })}`}
      onClick={() => setActiveDocumentId(location.documentId)}
      className="inline-flex items-center gap-1 text-xs text-neutral underline-offset-2 hover:underline"
    >
      <ExternalLink size={12} />
      {children || locationLabel(doc, location)}
    </Link>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#363636] bg-[#1e1e1e] px-6 py-12 text-center">
      <h3 className="font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function Status({ status }: { status: string }) {
  const color =
    status === "ready" || status === "understood" || status === "confirmed"
      ? "border-neutral text-neutral"
      : status === "failed" || status === "needs-review"
        ? "border-neutral text-neutral"
        : "border-[#363636] text-neutral";
  return <span className={`tag ${color}`}>{status.replaceAll("-", " ")}</span>;
}
