import express from "express";
import PDFMerger from "pdf-merger-js";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "1mb" }));

  app.post("/api/merge-pdfs", async (req, res) => {
    const pdfUrls = Array.isArray(req.body?.pdfUrls)
      ? req.body.pdfUrls.filter((pdfUrl: unknown): pdfUrl is string => typeof pdfUrl === "string" && pdfUrl.trim().length > 0)
      : [];

    if (pdfUrls.length === 0) {
      return res.status(400).json({ message: "At least one PDF URL is required" });
    }

    const merger = new PDFMerger();
    let mergedPdfCount = 0;
    let skippedPdfCount = 0;

    for (const pdfUrl of pdfUrls) {
      try {
        const resolvedPdfUrl = new URL(pdfUrl, `${req.protocol}://${req.get("host")}`).toString();

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
      return res.status(502).json({ message: "Unable to fetch or merge the selected PDFs" });
    }

    await merger.setMetadata({
      producer: "pdf-merger-js",
      creator: "AHCS Patient Portal",
      title: "Merged Administrative Forms",
    });

    const mergedPdfBuffer = await merger.saveAsBuffer();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=administrative-forms.pdf");
    res.setHeader("X-Merged-Pdf-Count", String(mergedPdfCount));
    res.setHeader("X-Skipped-Pdf-Count", String(skippedPdfCount));
    return res.send(mergedPdfBuffer);
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
