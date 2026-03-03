import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getScreenpipeAppSettings } from "@/lib/actions/get-screenpipe-app-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Tauri webview (localhost:3000) calls this pipe on a different port,
// so the browser sends a CORS preflight OPTIONS request before PUT.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function GET() {
  try {
    const settings = await getScreenpipeAppSettings();
    return NextResponse.json(settings, { headers: corsHeaders });
  } catch (error) {
    console.error("failed to get settings:", error);
    return NextResponse.json(
      { error: "failed to get settings" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { key, value, isPartialUpdate, reset, namespace } = body;

    // Require namespace and restrict to "obsidian" only
    if (!namespace) {
      return NextResponse.json(
        { error: "namespace is required for pipe settings endpoint" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (namespace !== "obsidian") {
      return NextResponse.json(
        { error: `this endpoint only accepts namespace "obsidian", got "${namespace}"` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Write to pipe-local settings.json instead of SDK's store.bin.
    // The SDK's save() uses flattenObject() which corrupts the Tauri
    // plugin-store binary format, breaking the desktop app's settings.
    const screenpipeDir =
      process.env.THADM_DIR || process.env.SCREENPIPE_DIR || process.cwd();
    const settingsPath = path.join(
      screenpipeDir,
      "pipes",
      "obsidian",
      "settings.json"
    );

    let current: Record<string, any> = {};
    try {
      const raw = await fs.readFile(settingsPath, "utf8");
      current = JSON.parse(raw);
    } catch {
      // No existing file — start fresh
    }

    if (reset) {
      if (key) {
        delete current[key];
      } else {
        current = {};
      }
    } else if (isPartialUpdate) {
      current = { ...current, ...value };
    } else if (key) {
      current[key] = value;
    }

    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(current, null, 2));

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("failed to update settings:", error);
    return NextResponse.json(
      { error: "failed to update settings" },
      { status: 500, headers: corsHeaders }
    );
  }
}
