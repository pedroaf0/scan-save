// ZPL Parser for extracting order data from shipping labels
// Supports the label format found in zpl.txt reference file

export interface ZPLOrder {
  // Primary identifiers for matching scanned codes
  barcode: string;           // Main barcode (ShipmentID from ^BCN)
  qrCode: string | undefined; // DataMatrix/QR code if present (^BXN)
  
  // Order fields
  pedido: string;            // Pedido number
  lojaVirtual: string;       // Loja Virtual number
  notaFiscal: string;        // Nota Fiscal number
  shipmentId: string;        // ShipmentID
  volume: string;            // Volume (e.g., "1 / 1")
  
  // Recipient (destinatário)
  destinatario: string;      // Recipient name
  enderecoDestinatario: string; // Recipient address
  
  // Sender (remetente)
  remetente: string;         // Sender name
  enderecoRemetente: string; // Sender address
  
  // Store identification (priority field)
  loja: string;              // Store name (from remetente or separate field)
  
  // Additional fields
  cnpj: string | undefined;             // CNPJ if present
  ie: string | undefined;               // Inscrição Estadual if present
  protocolo: string | undefined;        // Authorization protocol if present
  dataEmissao: string | undefined;      // Emission date if present
  
  // Raw data for debugging
  rawLabel: string;          // Original ZPL label content
  labelIndex: number;        // Index in the imported file
}

interface ZPLFields {
  pedido?: string;
  lojaVirtual?: string;
  notaFiscal?: string;
  shipmentId?: string;
  volume?: string;
  destinatario?: string;
  enderecoDestinatario?: string;
  remetente?: string;
  enderecoRemetente?: string;
  cnpj?: string;
  ie?: string;
  contrato?: string;
  nfeKey?: string;
  protocolo?: string;
  dataEmissao?: string;
  isDestinatarioLabel?: boolean;
  expectDestinatarioName?: boolean;
  isShipmentIdLabel?: boolean;
}

export interface ZPLParseResult {
  orders: ZPLOrder[];
  errors: ZPLParseError[];
  warnings: string[];
}

export interface ZPLParseError {
  labelIndex: number;
  message: string;
  severity: 'error' | 'warning';
}

// ZPL escape sequence decoding
// ZPL uses \xNN for hex codes and \cX for special characters
// Common mappings for Portuguese (from ZPL manual)
function decodeZPLEscapes(text: string): string {
  return text
    // Special ZPL escape sequences (from Zebra ZPL manual)
    .replace(/\\a2/g, 'ã')   // ã
    .replace(/\\a3/g, 'ó')   // ó
    .replace(/\\a7/g, 'ç')   // ç
    .replace(/\\b5/g, 'á')   // á
    .replace(/\\82/g, 'é')   // é (hex 82 = é in CP1252)
    .replace(/\\87/g, 'ç')   // ç (hex 87 = ç in CP1252)
    .replace(/\\93/g, 'ó')   // ó (hex 93 = ó in CP1252) - FIXED: was õ
    .replace(/\\c6/g, 'ã')   // ã
    .replace(/\\a0/g, 'á')   // á
    .replace(/\\a1/g, 'à')   // à
    .replace(/\\a4/g, 'ê')   // ê
    .replace(/\\a5/g, 'é')   // é
    .replace(/\\a6/g, 'í')   // í
    .replace(/\\a8/g, 'ô')   // ô
    .replace(/\\a9/g, 'û')   // û
    .replace(/\\b1/g, 'Á')   // Á
    .replace(/\\b2/g, 'Ã')   // Ã
    .replace(/\\b3/g, 'Ç')   // Ç
    .replace(/\\b4/g, 'É')   // É
    .replace(/\\b6/g, 'Í')   // Í
    .replace(/\\b7/g, 'Ó')   // Ó
    .replace(/\\b8/g, 'Ô')   // Ô
    .replace(/\\b9/g, 'Ú')   // Ú
    .replace(/\\c1/g, 'À')   // À
    .replace(/\\c2/g, 'Â')   // Â
    .replace(/\\c3/g, 'Ê')   // Ê
    .replace(/\\c4/g, 'Ë')   // Ë
    .replace(/\\c5/g, 'Ì')   // Ì
    .replace(/\\c7/g, 'Ò')   // Ò
    .replace(/\\c8/g, 'Ó')   // Ó
    .replace(/\\c9/g, 'Õ')   // Õ
    // Generic hex escape \xNN or \NN
    .replace(/\\([0-9a-fA-F]{2})/g, (_, hex) => {
      const code = parseInt(hex, 16);
      // CP1252 common Portuguese characters
      const cp1252: Record<number, string> = {
        0x80: '€', 0x82: 'é', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: 'ç', 0x88: 'ˆ',
        0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: 'ó',
        0x94: '“', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›',
        0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ', 0xA0: ' ', 0xA1: '¡', 0xA2: '¢', 0xA3: '£', 0xA4: '¤',
        0xA5: '¥', 0xA6: '¦', 0xA7: '§', 0xA8: '¨', 0xA9: '©', 0xAA: 'ª', 0xAB: '«', 0xAC: '¬',
        0xAD: '-', 0xAE: '®', 0xAF: '¯', 0xB0: '°', 0xB1: '±', 0xB2: '²', 0xB3: '³', 0xB4: '´',
        0xB5: 'µ', 0xB6: '¶', 0xB7: '·', 0xB8: '¸', 0xB9: '¹', 0xBA: 'º', 0xBB: '»', 0xBC: '¼',
        0xBD: '½', 0xBE: '¾', 0xBF: '¿', 0xC0: 'À', 0xC1: 'Á', 0xC2: 'Â', 0xC3: 'Ã', 0xC4: 'Ä',
        0xC5: 'Å', 0xC6: 'Æ', 0xC7: 'Ç', 0xC8: 'È', 0xC9: 'É', 0xCA: 'Ê', 0xCB: 'Ë', 0xCC: 'Ì',
        0xCD: 'Í', 0xCE: 'Î', 0xCF: 'Ï', 0xD0: 'Ð', 0xD1: 'Ñ', 0xD2: 'Ò', 0xD3: 'Ó', 0xD4: 'Ô',
        0xD5: 'Õ', 0xD6: 'Ö', 0xD7: '×', 0xD8: 'Ø', 0xD9: 'Ù', 0xDA: 'Ú', 0xDB: 'Û', 0xDC: 'Ü',
        0xDD: 'Ý', 0xDE: 'Þ', 0xDF: 'ß', 0xE0: 'à', 0xE1: 'á', 0xE2: 'â', 0xE3: 'ã', 0xE4: 'ä',
        0xE5: 'å', 0xE6: 'æ', 0xE7: 'ç', 0xE8: 'è', 0xE9: 'é', 0xEA: 'ê', 0xEB: 'ë', 0xEC: 'ì',
        0xED: 'í', 0xEE: 'î', 0xEF: 'ï', 0xF0: 'ð', 0xF1: 'ñ', 0xF2: 'ò', 0xF3: 'ó', 0xF4: 'ô',
        0xF5: 'õ', 0xF6: 'ö', 0xF7: '÷', 0xF8: 'ø', 0xF9: 'ù', 0xFA: 'ú', 0xFB: 'û', 0xFC: 'ü',
        0xFD: 'ý', 0xFE: 'þ', 0xFF: 'ÿ',
      };
      return cp1252[code] ?? String.fromCharCode(code);
    })
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// Extract field data from ^FD...^FS sequences
function extractFieldData(zpl: string, fieldName: string): string | null {
  // Pattern: ^FD<fieldName>: <value>^FS or ^FD<value>^FS where preceding text has fieldName
  const patterns = [
    new RegExp(`\\^FD${fieldName}[:\\s]*([^\\^]*)\\^FS`, 'i'),
    new RegExp(`\\^FD([^\\^]*${fieldName}[:\\s]*[^\\^]*)\\^FS`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = zpl.match(pattern);
    if (match && match[1]) {
      return decodeZPLEscapes(match[1].trim());
    }
  }
  return null;
}

// Extract barcode data from ^BCN (Code 128) or ^BXN (DataMatrix)
function extractBarcodes(zpl: string): { code128?: string; dataMatrix?: string } {
  const result: { code128?: string; dataMatrix?: string } = {};
  
  // ^BCN - Code 128 barcode
  const bcMatch = zpl.match(/\^BCN[\s\S]*?\^FH\\?\^FD([\s\S]*?)\^FS/);
  const bcContent = bcMatch?.[1];
  if (bcContent) {
    result.code128 = decodeZPLEscapes(bcContent.trim());
    // Remove leading >; if present (common in shipment labels)
    if (result.code128.startsWith('>;')) {
      result.code128 = result.code128.slice(2);
    }
  }
  
  // ^BXN - DataMatrix
  const bxMatch = zpl.match(/\^BXN[\s\S]*?\^FH\\?\^FD([\s\S]*?)\^FS/);
  const bxContent = bxMatch?.[1];
  if (bxContent) {
    result.dataMatrix = decodeZPLEscapes(bxContent.trim());
  }
  
  return result;
}

// Extract text fields using ^A0N/^AAN with ^FD
function extractTextFields(zpl: string): ZPLFields {
  const fields: ZPLFields = {};
  
  // Find all ^FO/^FT positions with ^FD content
  // Use [\s\S]*? to match across ^FH\ sequences and newlines
  const fdPattern = /\^F[OT][\s\S]*?\^FD([\s\S]*?)\^FS/g;
  let match;
  
  while ((match = fdPattern.exec(zpl)) !== null) {
    const matchedContent = match[1];
    if (!matchedContent) continue;
    const content = decodeZPLEscapes(matchedContent.trim());
    if (!content) continue;
    
    // Try to identify field by content patterns
    if (content.startsWith('Pedido:')) {
      fields.pedido = content.replace('Pedido:', '').trim();
    } else if (content.includes('Loja Virtual:')) {
      // Handle "Nç Loja Virtual: 49691" format - extract after "Loja Virtual:"
      const idx = content.indexOf('Loja Virtual:');
      if (idx >= 0) {
        fields.lojaVirtual = content.substring(idx + 'Loja Virtual:'.length).trim();
      } else {
        fields.lojaVirtual = content.replace('Loja Virtual:', '').trim();
      }
    } else if (content.startsWith('Nota Fiscal:')) {
      fields.notaFiscal = content.replace('Nota Fiscal:', '').trim();
    } else if (content.startsWith('ShipmentID:')) {
      fields.shipmentId = content.replace('ShipmentID:', '').trim();
    } else if (content.startsWith('Volume:')) {
      fields.volume = content.replace('Volume:', '').trim();
    } else if (/^DESTINAT[ÁA]RIO$/i.test(content) || /^DESTINATARIO$/i.test(content)) {
      fields.isDestinatarioLabel = true;
      fields.expectDestinatarioName = true; // Next text field should be name
    } else if (content === 'SHIPMENT ID') {
      fields.isShipmentIdLabel = true;
    } else if (content.startsWith('Remetente:')) {
      fields.remetente = content.replace('Remetente:', '').trim();
    } else if (content.startsWith('CNPJ:')) {
      fields.cnpj = content.replace('CNPJ:', '').trim();
    } else if (content.startsWith('IE:')) {
      fields.ie = content.replace('IE:', '').trim();
    } else if (content.startsWith('Contrato:')) {
      fields.contrato = content.replace('Contrato:', '').trim();
    } else if (/^\d{44}$/.test(content.replace(/\s/g, ''))) {
      fields.nfeKey = content.replace(/\s/g, '');
    } else if (content.includes('Protocolo de autoriza')) {
      fields.protocolo = content;
    } else if (/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/.test(content)) {
      fields.dataEmissao = content;
    } else if (content && !content.match(/^(DESTINAT|SHIPMENT|Remetente|CNPJ|IE|Volume|Nota|Pedido|Loja|Shipment|Protocolo|Contrato)/i)) {
      // Helper to detect barcode-like content (human-readable text below barcode)
      const isBarcodeLike = content.startsWith('>;') || 
        /^\d{10,}$/.test(content) || 
        /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(content); // Correios tracking
      
      // Potential recipient name (first substantial text after DESTINATÁRIO label)
      if (fields.expectDestinatarioName && content.length > 3 && !content.match(/^\d+$/) && !isBarcodeLike) {
        fields.destinatario = content;
        fields.expectDestinatarioName = false;
      }
      // Potential address (long text with commas, numbers, state abbreviations)
      else if (!fields.enderecoDestinatario && content.length > 15 && content.includes(',') && /[A-Z]{2}\s*-\s*\d{5}-?\d{3}/.test(content)) {
        fields.enderecoDestinatario = content;
      }
      // Potential sender address (after Remetente label)
      else if (!fields.enderecoRemetente && content.length > 15 && (content.includes('Rua') || content.includes('Av') || content.includes('Avenida')) && /[A-Z]{2}[\s\-]+\d{5}-?\d{3}/.test(content)) {
        fields.enderecoRemetente = content;
      }
    }
  }
  
  return fields;
}

// Parse a single ZPL label (between ^XA and ^XZ)
function parseSingleLabel(label: string, index: number): { order?: ZPLOrder; errors: ZPLParseError[]; warnings: string[] } {
  const errors: ZPLParseError[] = [];
  const warnings: string[] = [];
  
  // Extract barcodes
  const barcodes = extractBarcodes(label);
  
  // Extract text fields
  const fields = extractTextFields(label);
  
  // Determine primary barcode for matching (prefer Code 128 ShipmentID)
  const primaryBarcode = barcodes.code128 || barcodes.dataMatrix || '';
  
  if (!primaryBarcode) {
    warnings.push(`Label ${index + 1}: No barcode found for matching`);
  }
  
  // Validate required fields
  if (!fields.pedido) {
    warnings.push(`Label ${index + 1}: Missing field "pedido"`);
  }
  if (!fields.shipmentId && !barcodes.code128) {
    warnings.push(`Label ${index + 1}: Missing field "shipmentId"`);
  }
  if (!fields.destinatario) {
    warnings.push(`Label ${index + 1}: Missing field "destinatario"`);
  }
  
  // Store/loja identification - use remetente as store name if available
  const loja = fields.remetente || 'Desconhecida';
  if (!fields.remetente) {
    warnings.push(`Label ${index + 1}: Store/sender name not found`);
  }
  
  // Build order object
  const order: ZPLOrder = {
    barcode: primaryBarcode,
    qrCode: barcodes.dataMatrix ?? undefined,
    pedido: fields.pedido || '',
    lojaVirtual: fields.lojaVirtual || '',
    notaFiscal: fields.notaFiscal || '',
    shipmentId: fields.shipmentId || barcodes.code128 || '',
    volume: fields.volume || '1 / 1',
    destinatario: fields.destinatario || '',
    enderecoDestinatario: fields.enderecoDestinatario || '',
    remetente: fields.remetente || '',
    enderecoRemetente: fields.enderecoRemetente || '',
    loja: loja,
    cnpj: fields.cnpj,
    ie: fields.ie,
    protocolo: fields.protocolo,
    dataEmissao: fields.dataEmissao,
    rawLabel: label,
    labelIndex: index,
  };
  
  return { order, errors, warnings };
}

// Main entry point: parse ZPL content (can contain multiple labels)
export function parseZPL(content: string): ZPLParseResult {
  const orders: ZPLOrder[] = [];
  const errors: ZPLParseError[] = [];
  const warnings: string[] = [];
  
  // Split by ^XA (start of label) - each label ends with ^XZ
  // Labels are concatenated: ^XA...^XZ^XA...^XZ
  const labelPattern = /\^XA([\s\S]*?)\^XZ/g;
  let match;
  let labelIndex = 0;
  
  while ((match = labelPattern.exec(content)) !== null) {
    const labelContent = match[1];
    if (!labelContent) continue;
    const { order, errors: labelErrors, warnings: labelWarnings } = parseSingleLabel(labelContent, labelIndex);
    
    if (order) {
      orders.push(order);
    }
    errors.push(...labelErrors);
    warnings.push(...labelWarnings);
    labelIndex++;
  }
  
  // Check for duplicate barcodes
  const barcodeMap = new Map<string, number[]>();
  orders.forEach((order, idx) => {
    if (order.barcode) {
      const existing = barcodeMap.get(order.barcode) || [];
      existing.push(idx);
      barcodeMap.set(order.barcode, existing);
    }
  });
  
  for (const [barcode, indices] of barcodeMap.entries()) {
    if (indices.length > 1) {
      warnings.push(`Duplicate barcode "${barcode}" found in labels: ${indices.map(i => i + 1).join(', ')}`);
    }
  }
  
  return { orders, errors, warnings };
}

// Generate searchable index from orders for fast lookup
export function createOrderIndex(orders: ZPLOrder[]): Map<string, ZPLOrder> {
  const index = new Map<string, ZPLOrder>();
  
  for (const order of orders) {
    // Index by primary barcode (shipment ID)
    if (order.barcode) {
      index.set(order.barcode, order);
    }
    // Also index by DataMatrix if different
    if (order.qrCode && order.qrCode !== order.barcode) {
      index.set(order.qrCode, order);
    }
    // Index by pedido number as fallback
    if (order.pedido) {
      index.set(`PEDIDO:${order.pedido}`, order);
    }
    // Index by nota fiscal
    if (order.notaFiscal) {
      index.set(`NF:${order.notaFiscal}`, order);
    }
  }
  
  return index;
}

// Look up order by scanned code
export function findOrderByCode(index: Map<string, ZPLOrder>, code: string): ZPLOrder | null {
  // Try exact match first
  const exact = index.get(code);
  if (exact) return exact;
  
  // Try without >; prefix if present
  if (code.startsWith('>;')) {
    const withoutPrefix = index.get(code.slice(2));
    if (withoutPrefix) return withoutPrefix;
  }
  
  // Try with >; prefix if not present
  const withPrefix = index.get(`>;${code}`);
  if (withPrefix) return withPrefix;
  
  return null;
}