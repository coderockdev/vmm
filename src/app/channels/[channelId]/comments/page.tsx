import { redirect } from "next/navigation";

/** Canonical Comment Manager entry — opens workspace on the Comentarios tab. */
export default function ChannelCommentsPage({
  params,
}: {
  params: { channelId: string };
}) {
  redirect(`/channels/${params.channelId}?tab=comentarios`);
}
