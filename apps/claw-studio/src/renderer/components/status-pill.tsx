type StatusPillProps = {
  tone?: "neutral" | "accent" | "success" | "danger";
  children: string;
};

export function StatusPill({ tone = "neutral", children }: StatusPillProps) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
