import { NextRequest, NextResponse } from "next/server";

const FWAI_BACKEND_URL =
  process.env.CALL_SERVER_URL?.replace(/\/call\/conversational$/, "") ||
  "http://34.93.142.172:3005";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;

  try {
    const url = `${FWAI_BACKEND_URL}/calls/${callId}/recording`;
    console.log("[API /api/calls/recording] Proxying to:", url);

    // Forward Range header if present (enables seeking in audio player)
    const headers: Record<string, string> = {};
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    const response = await fetch(url, { headers });

    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const audioData = await response.arrayBuffer();

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(audioData.byteLength),
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    };

    // Forward range-related headers from backend
    const contentRange = response.headers.get("content-range");
    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    return new NextResponse(audioData, {
      status: response.status === 206 ? 206 : 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[API /api/calls/recording] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recording" },
      { status: 500 }
    );
  }
}
