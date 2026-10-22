import { describe, it, expect } from "vitest";
import { parseAddress } from "./parse-address";

describe("parseAddress", () => {
  it("plain product barcode has no address", () => {
    expect(parseAddress("7891234567895")).toEqual({ cep: "", endereco: "" });
  });
  it("Correios DataMatrix gives destination CEP and number", () => {
    expect(parseAddress("01310100001230405000000450000000")).toEqual({ cep: "01310-100", endereco: "Nº 123" });
  });
  it("free text with street and CEP", () => {
    expect(parseAddress("Rua das Flores, 10 - Centro, CEP 01001-000")).toEqual({
      cep: "01001-000",
      endereco: "Rua das Flores, 10 - Centro",
    });
  });
});
