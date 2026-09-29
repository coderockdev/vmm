import { VideoProject } from "../../../core/types";
import { formatUsd } from "../../../core/usage/types";

/** Compact cost line with stage breakdown for project cards / review. */
export function ProjectCostLabel({
  project,
  alwaysShow = false,
}: {
  project: VideoProject;
  /** When true, keep a cost row even if tracking is missing (older projects). */
  alwaysShow?: boolean;
}) {
  const total = project.costUsdTotal;
  const b = project.costBreakdown;
  const hasCost = total != null && total > 0;

  if (!hasCost && !alwaysShow) return null;

  const parts: string[] = [];
  if (b) {
    if (b.ideas > 0) parts.push(`ideias ${formatUsd(b.ideas)}`);
    if (b.script > 0) parts.push(`roteiro ${formatUsd(b.script)}`);
    if (b.audio > 0) parts.push(`áudio ${formatUsd(b.audio)}`);
    if (b.thumbnail > 0) parts.push(`portada ${formatUsd(b.thumbnail)}`);
    if (b.render > 0) parts.push(`render ${formatUsd(b.render)}`);
  }
  const title = hasCost
    ? parts.length > 0
      ? parts.join(" · ")
      : "Estimativa no momento da geração"
    : "Sem registro de custo (gerado antes do tracking ou falha ao gravar usage)";

  return (
    <span className={`project-cost${hasCost ? "" : " project-cost-missing"}`} title={title}>
      Custo: {hasCost ? formatUsd(total!) : "—"}
    </span>
  );
}
