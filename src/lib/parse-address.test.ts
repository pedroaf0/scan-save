import { describe, it, expect } from "vitest";
import { parseCode } from "./parse-address";

describe("parseCode", () => {
  it("NF-e access key from DANFE label", () => {
    const r = parseCode("4326 1032 4426 0200 0195 5500 2000 0006 1711 3175 152".replace(/ /g, "") + "0");
    expect(r.tipo).toBe("NF-e");
  });
  it("NF-e fields", () => {
    const r = parseCode("43261032442602000195550020000006171131751520");
    expect(r.campos).toMatchObject({ UF: "RS", "CNPJ emitente": "32.442.602/0001-95", Série: "2", "Nota Fiscal": "000617" });
  });
  it("Correios tracking", () => {
    expect(parseCode("AP641282545BR").campos.Rastreio).toBe("AP641282545BR");
  });
  it("Correios CEP barcode", () => {
    expect(parseCode("04549020").campos.CEP).toBe("04549-020");
  });
  it("Shipment ID", () => {
    expect(parseCode("14652900000556").campos["Shipment ID"]).toBe("14652900000556");
  });
  it("Correios DataMatrix", () => {
    const dm = "04549020" + "00118" + "90520080" + "00273" + "0" + "51" + "AP641282545BR" + "0".repeat(10) +
      "0099123689" + "03298" + "00" + "00118" + "Casa".padEnd(20) + "00000" + "053981605995" + "0".repeat(20) + "|";
    expect(parseCode(dm).campos).toMatchObject({
      "CEP destino": "04549-020", "Nº destino": "118", "CEP origem": "90520-080", Rastreio: "AP641282545BR", Complemento: "Casa",
    });
  });
});
