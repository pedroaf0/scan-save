// Extracts CEP and address from barcode text only (no OCR).
export type ParsedAddress = { cep: string; endereco: string };

const fmt = (d: string) => `${d.slice(0, 5)}-${d.slice(5, 8)}`;

export function parseAddress(text: string): ParsedAddress {
  const t = text.trim();

  // vCard / MECARD address
  const adr = t.match(/^ADR[^:]*:(.*)$/im) || t.match(/ADR:([^;]*(?:;[^;]+)*?);;/);
  if (adr) {
    const parts = (adr[1] ?? "").split(";").map((p) => p.trim()).filter(Boolean);
    const cepPart = parts.join(" ").match(/\b(\d{5})-?(\d{3})\b/);
    return {
      cep: cepPart ? fmt(`${cepPart[1]}${cepPart[2]}`) : "",
      endereco: parts.filter((p) => !/^\d{5}-?\d{3}$/.test(p)).join(", "),
    };
  }

  // Correios DataMatrix: CEP destino (8) + número (5) + CEP origem (8) + ...
  if (/^\d{26,}/.test(t)) {
    const num = String(parseInt(t.slice(8, 13), 10) || "");
    return { cep: fmt(t.slice(0, 8)), endereco: num ? `Nº ${num}` : "" };
  }

  // Free text containing a CEP (formatted or labeled)
  const m = t.match(/CEP[:\s]*(\d{5})-?(\d{3})/i) || t.match(/\b(\d{5})-(\d{3})\b/);
  if (m) {
    const street = t.match(/\b(Rua|R\.|Av\.?|Avenida|Travessa|Tv\.|Alameda|Al\.|Rodovia|Estrada|Praça|Largo)\s[^\n]*/i);
    let endereco = street ? street[0] : "";
    endereco = endereco.replace(/,?\s*CEP[:\s]*\d{5}-?\d{3}.*/i, "").replace(/\s*\d{5}-\d{3}.*/, "").trim();
    return { cep: fmt(`${m[1]}${m[2]}`), endereco };
  }

  return { cep: "", endereco: "" };
}
