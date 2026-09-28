import { VideoProject } from "../../../core/types";
import { formatUsd } from "../../../core/usage/types";

/** Compact cost line with stage breakdown for project cards / review. */
export function ProjectCostLabel({ project }: { project: VideoProject }) {
  const total = project.costUsdTotal;
  const b = project.costBreakdown;
  if (total == null || total <= 0) return null;

  const parts: string[] = [];
  if (b) {
    if (b.ideas > 0) parts.push(`ideias ${formatUsd(b.ideas)}`);
    if (b.script > 0) parts.push(`roteiro ${formatUsd(b.script)}`);
    if (b.audio > 0) parts.push(`áudio ${formatUsd(b.audio)}`);
    if (b.render > 0) parts.push(`render ${formatUsd(b.render)}`);
  }
  const title = parts.length > 0 ? parts.join(" · ") : "Estimativa no momento da geração";

  return (
    <span className="project-cost" title={title}>
      Custo: {formatUsd(total)}
    </span>
  );
}
