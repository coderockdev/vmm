import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChannel } from "../../../core/repo/channels";

export const dynamic = "force-dynamic";

/**
 * Public channel view route.
 *
 * The visual design for this screen will be applied once the new reference
 * layout is provided. Keeping the data lookup here means the route is already
 * connected to the persisted channel and ready for that layout.
 */
export default async function ChannelViewPage({ params }: { params: { slug: string } }) {
  const channel = await getChannel(params.slug);
  if (!channel) notFound();

  return (
    <div className="channel-view-page">
      <div className="channel-view-placeholder">
        <p className="eyebrow">VISUALIZAÇÃO DO CANAL</p>
        <h1>{channel.name}</h1>
        <p>{channel.dna.description || "Este canal ainda não tem uma descrição."}</p>
        <div className="channel-view-actions">
          <Link href={`/channels/${channel.id}`}>Abrir workspace</Link>
          <Link href={`/channels/${channel.id}/edit`}>Editar canal</Link>
        </div>
      </div>
    </div>
  );
}
