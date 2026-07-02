import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "path";
import PDFMerger from "pdf-merger-js";
import { defineConfig, type Plugin } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
};

const sendJson = (res: ServerResponse, statusCode: number, payload: Record<string, unknown>) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const handleMergePdfsRequest = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { message: "Method not allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const pdfUrls = Array.isArray(body.pdfUrls)
      ? body.pdfUrls.filter((pdfUrl: unknown): pdfUrl is string => typeof pdfUrl === "string" && pdfUrl.trim().length > 0)
      : [];

    if (pdfUrls.length === 0) {
      return sendJson(res, 400, { message: "At least one PDF URL is required" });
    }

    const merger = new PDFMerger();
    let mergedPdfCount = 0;
    let skippedPdfCount = 0;
    const requestHost = req.headers.host || "localhost:3000";

    for (const pdfUrl of pdfUrls) {
      try {
        const resolvedPdfUrl = new URL(pdfUrl, `http://${requestHost}`).toString();

        if (!resolvedPdfUrl.startsWith("http://") && !resolvedPdfUrl.startsWith("https://")) {
          throw new Error("Only HTTP(S) PDF URLs are supported");
        }

        const pdfResponse = await fetch(resolvedPdfUrl);

        if (!pdfResponse.ok) {
          throw new Error(`PDF request failed with status ${pdfResponse.status}`);
        }

        const pdfArrayBuffer = await pdfResponse.arrayBuffer();
        await merger.add(Buffer.from(pdfArrayBuffer));
        mergedPdfCount += 1;
      } catch (error) {
        skippedPdfCount += 1;
        console.error(`Failed to merge PDF from ${pdfUrl}:`, error);
      }
    }

    if (mergedPdfCount === 0) {
      return sendJson(res, 502, { message: "Unable to fetch or merge the selected PDFs" });
    }

    await merger.setMetadata({
      producer: "pdf-merger-js",
      creator: "AHCS Patient Portal",
      title: "Merged Administrative Forms",
    });

    const mergedPdfBuffer = await merger.saveAsBuffer();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=administrative-forms.pdf");
    res.setHeader("X-Merged-Pdf-Count", String(mergedPdfCount));
    res.setHeader("X-Skipped-Pdf-Count", String(skippedPdfCount));
    res.end(mergedPdfBuffer);
  } catch (error) {
    console.error("Failed to merge selected PDFs:", error);
    return sendJson(res, 500, { message: "Failed to merge selected PDFs" });
  }
};

const mergePdfsDevPlugin = (): Plugin => ({
  name: "merge-pdfs-dev-middleware",
  configureServer(server) {
    server.middlewares.use("/api/merge-pdfs", handleMergePdfsRequest);
  },
});

const plugins = [react(), tailwindcss(), jsxLocPlugin(), mergePdfsDevPlugin(), vitePluginManusRuntime()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
