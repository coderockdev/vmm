import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelDna } from "../../../../../core/repo/channels";
import {
  CoverFormat,
  normalizeCoverDna,
} from "../../../../../core/providers/image/coverFormats";

/** Save an invented format into the channel DNA cover library. */
export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const invented = body.inventedFormat;
  if (!invented?.newFormatName || !invented?.visualStructure) {
    return NextResponse.json({ error: "inventedFormat incompleto" }, { status: 400 });
  }

  const cover = normalizeCoverDna(channel.dna.visual?.cover);
  const id =
    typeof body.id === "string" && body.id.trim()
      ? body.id.trim()
      : `invented-${invented.newFormatName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40)}-${Date.now().toString(36)}`;

  const format: CoverFormat = {
    id,
    name: String(invented.newFormatName),
    description: String(invented.newFormatDescription || invented.whyItFitsThisVideo || ""),
    previewHint: "invented",
    structure: String(invented.visualStructure),
    textStrategy: String(invented.textStrategy || ""),
    enabled: true,
  };

  cover.formats = [...cover.formats.filter((f) => f.id !== id), format];
  await updateChannelDna(channel.id, {
    ...channel.dna,
    visual: { ...channel.dna.visual, cover },
  });

  return NextResponse.json({ format, cover });
}
