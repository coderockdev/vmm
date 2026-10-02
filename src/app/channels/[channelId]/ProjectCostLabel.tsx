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
    const text = (b.ideas || 0) + (b.script || 0);
    const image = b.thumbnail || 0;
    const voice = b.audio || 0;
    const motion = (b.render || 0) + (b.music || 0) + (b.sfx || 0);
    if (text > 0) parts.push(`texto ${formatUsd(text)}`);
    if (image > 0) parts.push(`imagem ${formatUsd(image)}`);
    if (voice > 0) parts.push(`voz ${formatUsd(voice)}`);
    if (motion > 0) parts.push(`animação ${formatUsd(motion)}`);
  }
  const title = hasCost
    ? parts.length > 0
      ? parts.join(" · ")
      : "Gasto registado na geração"
    : "Sem registro de custo (gerado antes do tracking ou falha ao gravar usage)";

  return (
    <span className={`project-cost${hasCost ? "" : " project-cost-missing"}`} title={title}>
      Gasto: {hasCost ? formatUsd(total!) : "—"}
      {parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}
    </span>
  );
}
