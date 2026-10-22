// Parses barcode / QR / DataMatrix text into labeled fields (no OCR).
export type Parsed = { tipo: string; campos: Record<string, string> };

const cep = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
const cnpj = (d: string) =>
  `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
const num = (s: string) => String(parseInt(s, 10) || "");
const clean = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()]));

const UF: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI",
  "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES",
  "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};
const MODELO: Record<string, string> = { "55": "NF-e", "65": "NFC-e", "57": "CT-e", "58": "MDF-e" };

function nfeKey(k: string): Parsed {
  return {
    tipo: MODELO[k.slice(20, 22)] ?? "Chave de acesso",
    campos: clean({
      "Chave de acesso": k,
      UF: UF[k.slice(0, 2)] ?? k.slice(0, 2),
      Emissão: `${k.slice(4, 6)}/20${k.slice(2, 4)}`,
      "CNPJ emitente": cnpj(k.slice(6, 20)),
      Série: num(k.slice(22, 25)),
      "Nota Fiscal": k.slice(25, 34).replace(/^0+(?=\d{6})/, ""),
    }),
  };
}

// Correios 2D DataMatrix (SIGEP layout)
function correiosDM(t: string): Parsed | null {
  const L: [string, number][] = [
    ["CEP destino", 8], ["Nº destino", 5], ["CEP origem", 8], ["Nº origem", 5], ["_val", 1], ["_idv", 2],
    ["Rastreio", 13], ["Serviços adicionais", 10], ["Cartão postagem", 10], ["Código serviço", 5],
    ["_agrup", 2], ["Nº logradouro", 5], ["Complemento", 20], ["Valor declarado", 5], ["Telefone", 12],
    ["Latitude", 10], ["Longitude", 10],
  ];
  const f: Record<string, string> = {};
  let p = 0;
  for (const [k, n] of L) { f[k] = t.slice(p, p + n); p += n; }
  if (!/^\d{8}/.test(t) || !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(f["Rastreio"] ?? "")) return null;
  const out: Record<string, string> = {
    "CEP destino": cep(f["CEP destino"]!), "Nº destino": num(f["Nº destino"]!),
    "CEP origem": cep(f["CEP origem"]!), "Nº origem": num(f["Nº origem"]!),
    Rastreio: f["Rastreio"]!, "Código serviço": f["Código serviço"]!,
    "Cartão postagem": num(f["Cartão postagem"] ?? ""), Complemento: f["Complemento"] ?? "",
    Telefone: /^0+$/.test(f["Telefone"] ?? "") ? "" : num(f["Telefone"] ?? ""),
  };
  const v = parseInt(f["Valor declarado"] ?? "", 10);
  if (v) out["Valor declarado"] = (v / 100).toFixed(2).replace(".", ",");
  return { tipo: "Correios DataMatrix", campos: clean(out) };
}

export function parseCode(text: string): Parsed {
  const t = text.trim();
  const digits = t.replace(/\s/g, "");

  if (/^\d{44}$/.test(digits)) return nfeKey(digits);
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(t))
    return { tipo: "Rastreio Correios", campos: { Rastreio: t, Serviço: t.slice(0, 2) } };
  const dm = correiosDM(t);
  if (dm) return dm;
  if (/^\d{8}$/.test(t)) return { tipo: "CEP", campos: { CEP: cep(t) } };
  if (/^https?:\/\//i.test(t)) {
    const ch = t.match(/(?:chNFe|p)=(\d{44})/);
    if (ch) return { ...nfeKey(ch[1]!), campos: { ...nfeKey(ch[1]!).campos, URL: t } };
    return { tipo: "URL", campos: { URL: t } };
  }
  if (/^\d{8,14}$/.test(t) && [8, 12, 13, 14].includes(t.length) && /^(78|79)/.test(t))
    return { tipo: "EAN/GTIN", campos: { GTIN: t } };
  if (/^\d{10,20}$/.test(t)) return { tipo: "Shipment ID", campos: { "Shipment ID": t } };

  // vCard address
  const adr = t.match(/^ADR[^:]*:(.*)$/im);
  if (adr) {
    const parts = (adr[1] ?? "").split(";").map((s) => s.trim()).filter(Boolean);
    const c = parts.join(" ").match(/\b(\d{5})-?(\d{3})\b/);
    return {
      tipo: "vCard",
      campos: clean({ CEP: c ? `${c[1]}-${c[2]}` : "", Endereço: parts.filter((s) => !/^\d{5}-?\d{3}$/.test(s)).join(", ") }),
    };
  }
  const m = t.match(/CEP[:\s]*(\d{5})-?(\d{3})/i) || t.match(/\b(\d{5})-(\d{3})\b/);
  if (m) {
    const st = t.match(/\b(Rua|R\.|Av\.?|Avenida|Travessa|Alameda|Rodovia|Estrada|Praça|Largo)\s[^\n]*/i);
    const end = (st?.[0] ?? "").replace(/,?\s*CEP[:\s]*\d{5}-?\d{3}.*/i, "").replace(/\s*\d{5}-\d{3}.*/, "");
    return { tipo: "Texto", campos: clean({ CEP: `${m[1]}-${m[2]}`, Endereço: end }) };
  }
  return { tipo: "Outro", campos: {} };
}
