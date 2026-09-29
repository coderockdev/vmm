import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createChannel,
  getChannelByCreationRequestId,
  listChannels,
  slugify,
} from "../../../core/repo/channels";
import { deleteStoredFile } from "../../../core/storage";
import { getSupabase, isSupabaseEnabled } from "../../../core/supabaseClient";
import { ChannelDNA, ChannelReference, Language } from "../../../core/types";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "media";

export async function GET() {
  return NextResponse.json({ channels: await listChannels() });
}

function cleanReferences(value: unknown): ChannelReference[] {
  if (!Array.isArray(value)) return [];
  const platforms = new Set(["youtube", "tiktok", "instagram", "facebook", "website"]);
  return value
    .filter((item): item is ChannelReference => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<ChannelReference>;
      return Boolean(candidate.platform && platforms.has(candidate.platform) && candidate.url?.trim());
    })
    .map((item) => ({ platform: item.platform, url: item.url.trim() }));
}

async function storeImage(
  entry: FormDataEntryValue | null,
  channelId: string,
  kind: "channel-image" | "channel-banner" | "visual-reference",
  baseName: string
): Promise<string | null> {
  if (!entry || typeof entry === "string" || entry.size === 0) return null;
  const extension = IMAGE_TYPES[entry.type];
  if (!extension) throw new Error("Use imagens JPG, PNG ou WebP.");
  if (entry.size > MAX_IMAGE_BYTES) throw new Error("Cada imagem deve ter no máximo 12 MB.");

  const fileName = `${baseName}.${extension}`;
  const objectKey = `${channelId}/${kind}/${fileName}`;
  const { error } = await getSupabase()
    .storage.from(STORAGE_BUCKET)
    .upload(objectKey, Buffer.from(await entry.arrayBuffer()), {
      contentType: entry.type,
      upsert: true,
    });
  if (error) throw new Error(`Falha ao enviar ${baseName} ao Supabase Storage: ${error.message}`);
  return getSupabase().storage.from(STORAGE_BUCKET).getPublicUrl(objectKey).data.publicUrl;
}

export async function POST(req: NextRequest) {
  if (!isSupabaseEnabled()) {
    return NextResponse.json(
      { error: "O cadastro de canais exige DB_PROVIDER=supabase; nenhum dado foi salvo localmente." },
      { status: 503 }
    );
  }

  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  if (!isMultipart) {
    return NextResponse.json(
      { error: "Envie o cadastro completo com a imagem obrigatória do canal." },
      { status: 415 }
    );
  }
  let body: Record<string, any>;
  let form: FormData | null = null;

  try {
    form = await req.formData();
    body = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Dados de cadastro inválidos." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const language = String(body.language ?? "pt") as Language;
  const hasChannelImage = Boolean(form?.get("channelImage"));
  const creationRequestId = String(body.creationRequestId ?? "").trim();

  if (!name || !description || !["pt", "es", "en"].includes(language) || !hasChannelImage) {
    return NextResponse.json(
      { error: "Preencha nome, idioma, descrição e imagem do canal." },
      { status: 400 }
    );
  }

  if (creationRequestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(creationRequestId)) {
    return NextResponse.json({ error: "Identificador de cadastro inválido." }, { status: 400 });
  }

  if (creationRequestId) {
    const existing = await getChannelByCreationRequestId(creationRequestId);
    if (existing) return NextResponse.json({ channel: existing, idempotent: true });
  }

  const id = await slugify(name);
  const storedRefs: string[] = [];

  try {
    const channelImageRef = await storeImage(form?.get("channelImage") ?? null, id, "channel-image", "channel-image");
    if (!channelImageRef) {
      return NextResponse.json({ error: "Adicione a imagem do canal." }, { status: 400 });
    }
    if (channelImageRef) storedRefs.push(channelImageRef);

    const channelBannerRef = await storeImage(form?.get("channelBanner") ?? null, id, "channel-banner", "channel-banner");
    if (channelBannerRef) storedRefs.push(channelBannerRef);

    const visualReferenceRef = await storeImage(
      form?.get("visualReference") ?? null,
      id,
      "visual-reference",
      "visual-reference"
    );
    if (visualReferenceRef) storedRefs.push(visualReferenceRef);

    const scriptSkill = String(body.scriptSkill ?? "").trim();
    const dna: ChannelDNA = {
      description,
      purpose: "",
      audience: "",
      language,
      tone: [],
      topics: [],
      avoid: [],
      scriptRules: {
        opening: "abertura direta e envolvente",
        structure: "introdução → preparação → conteúdo principal → reflexão → encerramento",
        cta: "CTA curto e natural quando apropriado",
        defaultDurationMinutes: 8,
        defaultSceneCount: 4,
        generationPrompt: scriptSkill,
        pauses: { betweenLines: 0.5, betweenSections: 1.5 },
        wordsPerMinute: 145,
        charsPerWord: 6,
        performanceTags: { enabled: false, selected: [], tagsPerThousandWords: 35 },
      },
      visual: { template: "neon-meditation", palette: "cosmic", textPreset: "bold-scroll" },
      voice: { provider: "local", voiceId: null, speed: 1, volume: 1 },
      usesScript: true,
      usesNarration: true,
    };

    const channel = await createChannel({
      id,
      name,
      niche: "",
      coverColor: "#56647e",
      dna,
      channelImageRef,
      channelBannerRef,
      visualReferenceRef,
      referenceLinks: cleanReferences(body.referenceLinks),
      visualStyleDescription: String(body.visualStyleDescription ?? "").trim(),
      scriptSkill,
      creationRequestId: creationRequestId || null,
    });

    revalidatePath("/");

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    if (creationRequestId) {
      const existing = await getChannelByCreationRequestId(creationRequestId).catch(() => null);
      if (existing) return NextResponse.json({ channel: existing, idempotent: true });
    }
    await Promise.all(storedRefs.map((ref) => deleteStoredFile(id, ref)));
    const message = error instanceof Error ? error.message : "Não foi possível criar o canal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
