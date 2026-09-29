import { NextResponse } from "next/server";
import { listImageProviderOptions, resolveBestImageProvider } from "../../../core/providers/image";

/** Which image engines are usable right now (free + keyed). */
export async function GET() {
  const options = listImageProviderOptions();
  return NextResponse.json({
    default: resolveBestImageProvider(),
    options,
  });
}
