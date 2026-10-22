// Test the decode function
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
    .replace(/\\([0-9a-fA-F]{2})/g)  // We'll just skip the CP1252 for now
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

const tests = [
  'N\\a7 Loja Virtual: 49691',
  'DESTINAT\\b5RIO',
  'Rua Delminda Silveira, 729, Apto 103 Bloco C Agron\\93mica, Florian\\a2polis/SC - 88025-500',
  'Rua Luzitana, 273 - Sala 501 - Higien\\a2polis Porto Alegre - RS   90520-080'
];

for (const t of tests) {
  console.log('Input:', JSON.stringify(t));
  console.log('Output:', JSON.stringify(decodeZPLEscapes(t)));
  console.log('---');
}