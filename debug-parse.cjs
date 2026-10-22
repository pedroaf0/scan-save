const fs = require('fs');
const content = fs.readFileSync('D:/scan-save/zpl.txt', 'utf-8');
const labels = content.match(/\^XA([\s\S]*?)\^XZ/g);
const label = labels[1]; // Second label (first shipping label)

// Copy the decode function
function decodeZPLEscapes(text) {
  return text
    .replace(/\\a2/g, 'ã')
    .replace(/\\a3/g, 'ó')
    .replace(/\\a7/g, 'ç')
    .replace(/\\b5/g, 'á')
    .replace(/\\82/g, 'é')
    .replace(/\\87/g, 'ç')
    .replace(/\\93/g, 'ó')
    .replace(/\\c6/g, 'ã')
    .replace(/\\a0/g, 'á')
    .replace(/\\a1/g, 'à')
    .replace(/\\a4/g, 'ê')
    .replace(/\\a5/g, 'é')
    .replace(/\\a6/g, 'í')
    .replace(/\\a8/g, 'ô')
    .replace(/\\a9/g, 'û')
    .replace(/\\b1/g, 'Á')
    .replace(/\\b2/g, 'Ã')
    .replace(/\\b3/g, 'Ç')
    .replace(/\\b4/g, 'É')
    .replace(/\\b6/g, 'Í')
    .replace(/\\b7/g, 'Ó')
    .replace(/\\b8/g, 'Ô')
    .replace(/\\b9/g, 'Ú')
    .replace(/\\c1/g, 'À')
    .replace(/\\c2/g, 'Â')
    .replace(/\\c3/g, 'Ê')
    .replace(/\\c4/g, 'Ë')
    .replace(/\\c5/g, 'Ì')
    .replace(/\\c7/g, 'Ò')
    .replace(/\\c8/g, 'Ó')
    .replace(/\\c9/g, 'Õ')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// Extract fields
const fdPattern = /\^F[OT][\s\S]*?\^FD([\s\S]*?)\^FS/g;
let match;
const fields = {};
let expectDestinatarioName = false;

while ((match = fdPattern.exec(label)) !== null) {
  const raw = match[1].trim();
  const decoded = decodeZPLEscapes(raw);
  console.log('Raw:', JSON.stringify(raw.substring(0, 80)));
  console.log('Decoded:', JSON.stringify(decoded.substring(0, 80)));
  
  if (decoded.startsWith('Pedido:')) {
    fields.pedido = decoded.replace('Pedido:', '').trim();
    console.log('  -> PEDIDO:', fields.pedido);
  } else if (decoded.includes('Loja Virtual:')) {
    const idx = decoded.indexOf('Loja Virtual:');
    if (idx >= 0) {
      fields.lojaVirtual = decoded.substring(idx + 'Loja Virtual:'.length).trim();
    }
    console.log('  -> LOJA VIRTUAL:', fields.lojaVirtual);
  } else if (decoded.startsWith('Nota Fiscal:')) {
    fields.notaFiscal = decoded.replace('Nota Fiscal:', '').trim();
    console.log('  -> NOTA FISCAL:', fields.notaFiscal);
  } else if (decoded.startsWith('ShipmentID:')) {
    fields.shipmentId = decoded.replace('ShipmentID:', '').trim();
    console.log('  -> SHIPMENTID:', fields.shipmentId);
  } else if (decoded.startsWith('Volume:')) {
    fields.volume = decoded.replace('Volume:', '').trim();
    console.log('  -> VOLUME:', fields.volume);
  } else if (/^DESTINAT[ÁA]RIO$/i.test(decoded) || /^DESTINATARIO$/i.test(decoded)) {
    fields.isDestinatarioLabel = 'true';
    expectDestinatarioName = true;
    console.log('  -> DESTINATARIO LABEL, expect name =', expectDestinatarioName);
  } else if (decoded === 'SHIPMENT ID') {
    fields.isShipmentIdLabel = 'true';
    console.log('  -> SHIPMENT ID LABEL');
  } else if (decoded.startsWith('Remetente:')) {
    fields.remetente = decoded.replace('Remetente:', '').trim();
    console.log('  -> REMETENTE:', fields.remetente);
  } else if (decoded.startsWith('CNPJ:')) {
    fields.cnpj = decoded.replace('CNPJ:', '').trim();
  } else if (decoded.startsWith('IE:')) {
    fields.ie = decoded.replace('IE:', '').trim();
  } else if (decoded.startsWith('Contrato:')) {
    fields.contrato = decoded.replace('Contrato:', '').trim();
  } else if (/^\d{44}$/.test(decoded.replace(/\s/g, ''))) {
    fields.nfeKey = decoded.replace(/\s/g, '');
  } else if (decoded.includes('Protocolo de autoriza')) {
    fields.protocolo = decoded;
  } else if (/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/.test(decoded)) {
    fields.dataEmissao = decoded;
  } else if (decoded && !decoded.match(/^(DESTINAT|SHIPMENT|Remetente|CNPJ|IE|Volume|Nota|Pedido|Loja|Shipment|Protocolo|Contrato)/i)) {
    console.log('  -> GENERIC MATCH, expectDestinatarioName =', expectDestinatarioName);
    // Potential recipient name (first substantial text after DESTINATÁRIO label)
    if (expectDestinatarioName && decoded.length > 3 && !decoded.match(/^\d+$/)) {
      fields.destinatario = decoded;
      expectDestinatarioName = false;
      console.log('    -> SET DESTINATARIO:', fields.destinatario);
    }
    // Potential address (long text with commas, numbers, state abbreviations)
    else if (!fields.enderecoDestinatario && decoded.length > 15 && decoded.includes(',') && /[A-Z]{2}[\s\-]+\d{5}-?\d{3}/.test(decoded)) {
      fields.enderecoDestinatario = decoded;
      console.log('    -> SET ENDERECO DESTINATARIO:', fields.enderecoDestinatario);
    }
    // Potential sender address (after Remetente label)
    else if (!fields.enderecoRemetente && decoded.length > 15 && (decoded.includes('Rua') || decoded.includes('Av') || decoded.includes('Avenida')) && /[A-Z]{2}[\s\-]+\d{5}-?\d{3}/.test(decoded)) {
      fields.enderecoRemetente = decoded;
      console.log('    -> SET ENDERECO REMETENTE:', fields.enderecoRemetente);
    } else {
      console.log('    -> NO MATCH');
    }
  }
  console.log('---');
}

console.log('\nFinal fields:');
console.log(JSON.stringify(fields, null, 2));