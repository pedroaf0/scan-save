// Extracts shipping-label data from the PDF's embedded text layer (no OCR).
import type { ZPLOrder } from "@/lib/parse-zpl";

const after = (t: string, re: RegExp) => t.match(re)?.[1]?.trim() ?? "";

/** Parse one label page given its text lines (top-to-bottom). */
export function parseLabelPage(lines: string[], labelIndex: number): ZPLOrder | null {
  const t = lines.join("\n");
  const rastreio = (t.match(/\b([A-Z]{2})\s?(\d{3})\s?(\d{3})\s?(\d{3})\s?([A-Z]{2})\b/) ?? [])
    .slice(1).join("");
  const pedido = after(t, /Pedido:\s*(\S+)/);
  if (!rastreio && !pedido) return null;

  const servico = after(t, /\n\s*(SEDEX[^\n]*|PAC[^\n]*|MINI ENVIOS[^\n]*)/i);
  const dest = (t.split(/D\s?E\s?S\s?T\s?I\s?N\s?A\s?T\s?Á\s?R\s?I\s?O/i)[1] ?? "").split(/Remetente:/i)[0] ?? "";
  const rem = (t.split(/Remetente:/i)[1] ?? "").trim();

  // Destination block: name / street / complement / "CEP City/UF"
  let dl = dest.split("\n").map((s) => s.trim()).filter(Boolean);
  if (dl.length === 1) {
    // fallback when text items were merged: split before street words and CEP
    dl = dl[0]!
      .replace(/(\S)(Rua|R\.|Av\.?|Avenida|Travessa|Alameda|Rodovia|Estrada|Praça|Largo|Servidão|Linha)\s/g, "$1\n$2 ")
      .replace(/(\S)(\d{5}-\d{3})/g, "$1\n$2")
      .split("\n").map((s) => s.trim()).filter(Boolean);
  }
  const cepLineIdx = dl.findIndex((s) => /\d{5}-?\d{3}/.test(s));
  const cepLine = cepLineIdx >= 0 ? dl[cepLineIdx]! : "";
  const cep = after(cepLine, /(\d{5}-?\d{3})/);
  const cidadeUf = cepLine.replace(/.*\d{5}-?\d{3}\s*/, "");
  const nome = dl[0] ?? "";
  const endereco = dl.slice(1, cepLineIdx >= 0 ? cepLineIdx : undefined).join(", ");
  const remLines = rem.split("\n").map((s) => s.trim()).filter(Boolean);

  return {
    barcode: rastreio,
    qrCode: undefined,
    pedido,
    lojaVirtual: "",
    notaFiscal: after(t, /NF:\s*(\S+)/),
    shipmentId: rastreio,
    volume: after(t, /Volume:\s*(\S+)/),
    destinatario: nome,
    enderecoDestinatario: [endereco, cep, cidadeUf].filter(Boolean).join(" - "),
    remetente: remLines[0] ?? "",
    enderecoRemetente: remLines.slice(1).join(", "),
    loja: remLines[0] ?? "",
    cnpj: undefined,
    ie: undefined,
    protocolo: after(t, /Contrato:\s*(\S+)/) || undefined,
    dataEmissao: servico || undefined,
    rawLabel: t,
    labelIndex,
  };
}

/** Read a PDF file in the browser and return one order per label page. */
export async function parsePdfLabels(file: File): Promise<ZPLOrder[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: ZPLOrder[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as any[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str });
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0])
      .map(([, r]) => r.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim());
    const o = parseLabelPage(lines, i - 1);
    if (o) out.push(o);
  }
  return out;
}
