import { describe, it, expect } from "vitest";
import { parseLabelPage } from "./parse-pdf-labels";

const lines = ["Contrato: 9912668558", "Volume: 1/1", "NF: 001106", "Pedido: 49305", "SEDEX", "AE 045 105 023 BR",
  "D E S T I N A T Á R I O", "Laisa Marins da SilvaRua Jerônimo Ferreira, 481Casa Quininho96700-000 São Jerônimo/RS",
  "Remetente:", "Winona Shop LTDA", "Rua Luzitana, 273", "Sala 501 - Higienópolis", "90520-080", "Porto Alegre-RS"];

describe("parseLabelPage", () => {
  it("extracts label fields", () => {
    const o = parseLabelPage(lines, 0)!;
    expect(o.barcode).toBe("AE045105023BR");
    expect(o.pedido).toBe("49305");
    expect(o.notaFiscal).toBe("001106");
    expect(o.destinatario).toBe("Laisa Marins da Silva");
    expect(o.enderecoDestinatario).toContain("96700-000 - São Jerônimo/RS");
    expect(o.remetente).toBe("Winona Shop LTDA");
  });
});
