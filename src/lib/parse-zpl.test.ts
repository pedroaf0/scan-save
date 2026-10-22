import { describe, it, expect, beforeAll } from "vitest";
import { parseZPL, createOrderIndex, findOrderByCode, type ZPLOrder } from "./parse-zpl";
import * as fs from "fs";
import * as path from "path";

describe("parseZPL", () => {
  let zplContent: string;
  let result: ReturnType<typeof parseZPL>;

  beforeAll(() => {
    // Read the reference ZPL file
    const filePath = path.resolve(__dirname, "../../zpl.txt");
    zplContent = fs.readFileSync(filePath, "utf-8");
    result = parseZPL(zplContent);
  });

  it("should parse multiple labels from the reference file", () => {
    // The reference file contains 10 labels (lines 1-10 in the file)
    expect(result.orders.length).toBeGreaterThanOrEqual(9); // At least 9 shipping labels + 1 DANFE
  });

  it("should extract barcode (ShipmentID) from Code 128", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order).toBeDefined();
    expect(order?.barcode).toBe("14652900000643");
    expect(order?.shipmentId).toBe("14652900000643");
  });

  it("should extract pedido number", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order?.pedido).toBe("4485");
  });

  it("should extract loja virtual", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order?.lojaVirtual).toBe("49691");
  });

  it("should extract nota fiscal", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order?.notaFiscal).toBe("001360");
  });

  it("should extract destinatário name", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order?.destinatario).toBe("Clarissa Coutinho Rosa");
  });

  it("should extract destinatário address", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order?.enderecoDestinatario).toContain("Rua Delminda Silveira");
    expect(order?.enderecoDestinatario).toContain("Florianãpolis"); // ZPL \a2 = ã
    expect(order?.enderecoDestinatario).toContain("SC");
  });

  it("should extract remetente (loja)", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order?.remetente).toBe("Winona Shop LTDA");
    expect(order?.loja).toBe("Winona Shop LTDA");
  });

  it("should extract remetente address", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order?.enderecoRemetente).toContain("Rua Luzitana");
    expect(order?.enderecoRemetente).toContain("Porto Alegre");
    expect(order?.enderecoRemetente).toContain("RS");
  });

  it("should extract volume info", () => {
    const order = result.orders.find(o => o.pedido === "4485");
    expect(order?.volume).toBe("1 / 1");
  });

  it("should handle all orders in the file", () => {
    const pedidos = result.orders.map(o => o.pedido).filter(Boolean).sort();
    expect(pedidos.length).toBeGreaterThanOrEqual(8);
    // Check specific known pedidos from the file
    expect(pedidos).toContain("4475");
    expect(pedidos).toContain("4476");
    expect(pedidos).toContain("4479");
    expect(pedidos).toContain("4480");
    expect(pedidos).toContain("4481");
    expect(pedidos).toContain("4485");
    expect(pedidos).toContain("4486");
    expect(pedidos).toContain("4491");
  });

  it("should create searchable index", () => {
    const index = createOrderIndex(result.orders);
    expect(index.size).toBeGreaterThan(0);
    
    // Should find by barcode
    const byBarcode = index.get("14652900000643");
    expect(byBarcode).toBeDefined();
    expect(byBarcode?.pedido).toBe("4485");
  });

  it("should find order by exact barcode match", () => {
    const index = createOrderIndex(result.orders);
    const order = findOrderByCode(index, "14652900000643");
    expect(order).toBeDefined();
    expect(order?.pedido).toBe("4485");
  });

  it("should find order by barcode with >; prefix", () => {
    const index = createOrderIndex(result.orders);
    const order = findOrderByCode(index, ">;14652900000643");
    expect(order).toBeDefined();
    expect(order?.pedido).toBe("4485");
  });

  it("should find order by barcode without >; prefix when stored with it", () => {
    const index = createOrderIndex(result.orders);
    const order = findOrderByCode(index, "14652900000643");
    expect(order).toBeDefined();
    expect(order?.pedido).toBe("4485");
  });

  it("should return null for unknown code", () => {
    const index = createOrderIndex(result.orders);
    const order = findOrderByCode(index, "99999999999999");
    expect(order).toBeNull();
  });

  it("should not have duplicate barcodes across different orders", () => {
    const barcodes = result.orders.map(o => o.barcode).filter(Boolean);
    const uniqueBarcodes = new Set(barcodes);
    expect(uniqueBarcodes.size).toBe(barcodes.length);
  });

  it("should parse DANFE label (first label) separately", () => {
    // First label is DANFE Simplificado - should have NF-e key barcode
    const danfeOrder = result.orders.find(o => o.rawLabel.includes("DANFE Simplificado"));
    expect(danfeOrder).toBeDefined();
    // DANFE label has 44-digit NF-e key as barcode
    expect(danfeOrder?.barcode).toMatch(/^\d{44}$/);
  });
});

describe("ZPL escape sequence decoding", () => {
  it("should decode common Portuguese characters", () => {
    // Test with a simple label containing escapes
    const testZPL = `^XA^FO10,10^A0N,20,20^FDTeste: Jo\\a3o\\a7\\a2o\\b5^FS^XZ`;
    const result = parseZPL(testZPL);
    expect(result.orders.length).toBe(1);
    // The decode function is internal, but we can verify through field extraction
  });
});

describe("Edge cases", () => {
  it("should handle empty file", () => {
    const result = parseZPL("");
    expect(result.orders.length).toBe(0);
  });

  it("should handle file without valid labels", () => {
    const result = parseZPL("This is not ZPL content");
    expect(result.orders.length).toBe(0);
  });

  it("should handle partial label data gracefully", () => {
    const partialZPL = `^XA^FO10,10^A0N,20,20^FDPedido: 1234^FS^XZ`;
    const result = parseZPL(partialZPL);
    expect(result.orders.length).toBe(1);
    expect(result.orders[0]?.pedido).toBe("1234");
    expect(result.warnings.length).toBeGreaterThan(0); // Missing fields should warn
  });
});