import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { DATA_ROOT } from "../../../../core/paths";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

// Serves files under data/channels/** (renders + audio), which live outside
// Next's public/ folder on purpose (they're per-channel and can get large).
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const relative = params.path.join("/");
  const absolutePath = path.join(DATA_ROOT, "channels", relative);

  if (!absolutePath.startsWith(path.join(DATA_ROOT, "channels"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  if (!fs.existsSync(absolutePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = fs.statSync(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  const range = req.headers.get("range");
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(absolutePath, { start, end });
    const body = await streamToWebStream(stream);

    return new NextResponse(body, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
      },
    });
  }

  const stream = fs.createReadStream(absolutePath);
  const body = await streamToWebStream(stream);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    },
  });
}

function streamToWebStream(nodeStream: fs.ReadStream): Promise<ReadableStream> {
  return Promise.resolve(
    new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    })
  );
}
