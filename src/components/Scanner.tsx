import { useEffect, useRef, useState, useCallback } from "react";
import { parseCode } from "@/lib/parse-address";
import { parseZPL, createOrderIndex, findOrderByCode, type ZPLOrder, type ZPLParseResult } from "@/lib/parse-zpl";

type ScanRow = { 
  code: string; 
  format: string; 
  time: string;
  // Matched order data
  matchedOrder: ZPLOrder | undefined;
  matchStatus: 'matched' | 'not_found' | 'duplicate';
};

type ImportedOrdersState = {
  orders: ZPLOrder[];
  index: Map<string, ZPLOrder>;
  parseResult: ZPLParseResult | null;
  fileName: string;
  importedAt: string;
};

const SCANS_KEY = "scans";
const ORDERS_KEY = "imported_orders";

export function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState("");
  const [importedOrders, setImportedOrders] = useState<ImportedOrdersState | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importProgress, setImportProgress] = useState<{ stage: string; progress: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persisted data on mount
  useEffect(() => {
    try {
      const savedScans = localStorage.getItem(SCANS_KEY);
      if (savedScans) setRows(JSON.parse(savedScans));
    } catch {}
    try {
      const savedOrders = localStorage.getItem(ORDERS_KEY);
      if (savedOrders) {
        const parsed = JSON.parse(savedOrders);
        // Recreate Map from plain object
        const index = new Map<string, ZPLOrder>(Object.entries(parsed.index));
        setImportedOrders({ ...parsed, index });
      }
    } catch {}
    return () => controlsRef.current?.stop();
  }, []);

  // Persist scans
  useEffect(() => { 
    localStorage.setItem(SCANS_KEY, JSON.stringify(rows)); 
  }, [rows]);

  // Persist imported orders
  useEffect(() => {
    if (importedOrders) {
      // Convert Map to object for storage
      const toStore = {
        ...importedOrders,
        index: Object.fromEntries(importedOrders.index),
      };
      localStorage.setItem(ORDERS_KEY, JSON.stringify(toStore));
    }
  }, [importedOrders]);

  async function start() {
    setMsg("");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        handleScanResult,
      );
      setScanning(true);
    } catch (e) {
      setMsg("Não foi possível acessar a câmera: " + (e as Error).message);
    }
  }

  const handleScanResult = useCallback((res: any) => {
    if (!res) return;
    const code = res.getText();
    const now = Date.now();
    
    // Debounce duplicate scans within 2.5 seconds
    if (code === lastRef.current.code && now - lastRef.current.t < 2500) return;
    lastRef.current = { code, t: now };
    
    navigator.vibrate?.(80);
    
    // Check if we have imported orders to match against
    let matchStatus: ScanRow['matchStatus'] = 'not_found';
    let matchedOrder: ZPLOrder | undefined;
    
    if (importedOrders?.index) {
      const p = parseCode(code).campos;
      const found = findOrderByCode(importedOrders.index, code)
        ?? (p["Rastreio"] ? findOrderByCode(importedOrders.index, p["Rastreio"]) : null)
        ?? (p["Nota Fiscal"] ? findOrderByCode(importedOrders.index, `NF:${p["Nota Fiscal"]}`) : null);
      if (found) {
        // Check for duplicate scan of same order
        const alreadyScanned = rows.some(r => r.matchedOrder?.barcode === found.barcode);
        if (alreadyScanned) {
          matchStatus = 'duplicate';
        } else {
          matchStatus = 'matched';
        }
        matchedOrder = found;
      }
    }
    
    const newRow: ScanRow = {
      code,
      format: String(res.getBarcodeFormat()),
      time: new Date().toLocaleString(),
      matchedOrder,
      matchStatus,
    };
    
    setRows((r) => [newRow, ...r]);
    
    // Show feedback message
    if (matchStatus === 'matched') {
      setMsg(`✓ Pedido ${matchedOrder?.pedido} encontrado - ${matchedOrder?.destinatario}`);
      setTimeout(() => setMsg(""), 3000);
    } else if (matchStatus === 'duplicate') {
      setMsg(`⚠ Pedido ${matchedOrder?.pedido} já foi lido anteriormente`);
      setTimeout(() => setMsg(""), 3000);
    } else if (importedOrders) {
      setMsg(`✗ Código não encontrado na base importada: ${code}`);
      setTimeout(() => setMsg(""), 3000);
    } else {
      setMsg(`Código lido: ${code} (importe um arquivo ZPL para associar pedidos)`);
      setTimeout(() => setMsg(""), 3000);
    }
  }, [importedOrders, rows]);

  function stop() { 
    controlsRef.current?.stop(); 
    controlsRef.current = null; 
    setScanning(false); 
  }

  // Parse ZPL file
  async function handleFileImport(file: File) {
    setShowImportDialog(false);
    setImportProgress({ stage: "Lendo arquivo...", progress: 10 });
    
    try {
      let result: ZPLParseResult;
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        setImportProgress({ stage: "Lendo etiquetas do PDF...", progress: 30 });
        const { parsePdfLabels } = await import("@/lib/parse-pdf-labels");
        const orders = await parsePdfLabels(file);
        result = { orders, errors: [], warnings: orders.length ? [] : ["Nenhuma etiqueta encontrada no PDF"] };
      } else {
        const text = await file.text();
        setImportProgress({ stage: "Interpretando etiquetas ZPL...", progress: 30 });
        result = parseZPL(text);
      }
      setImportProgress({ stage: "Criando índice de busca...", progress: 70 });
      
      // Create search index
      const index = createOrderIndex(result.orders);
      
      const newState: ImportedOrdersState = {
        orders: result.orders,
        index,
        parseResult: result,
        fileName: file.name,
        importedAt: new Date().toLocaleString(),
      };
      
      setImportedOrders(newState);
      setImportProgress({ stage: "Concluído!", progress: 100 });
      
      // Build summary message
      let summary = `Importados ${result.orders.length} pedido(s) de "${file.name}".`;
      if (result.warnings.length) {
        summary += ` Avisos: ${result.warnings.length}`;
      }
      if (result.errors.length) {
        summary += ` Erros: ${result.errors.length}`;
      }
      setMsg(summary);
      setTimeout(() => { setMsg(""); setImportProgress(null); }, 5000);
      
    } catch (e) {
      setMsg("Erro ao importar arquivo: " + (e as Error).message);
      setImportProgress(null);
    }
  }

  function triggerFileImport() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFileImport(file);
    }
    // Reset input to allow re-importing same file
    e.target.value = "";
  }

  function clearImportedOrders() {
    if (confirm("Remover pedidos importados? As leituras já feitas serão mantidas.")) {
      setImportedOrders(null);
      localStorage.removeItem(ORDERS_KEY);
      setMsg("Base de pedidos removida.");
      setTimeout(() => setMsg(""), 2000);
    }
  }

  // Enhanced row data with order info
  const full = rows.map((r) => ({
    ...r,
    ...parseCode(r.code),
    // Add matched order fields for display/export
    orderFields: r.matchedOrder ? {
      "Pedido": r.matchedOrder.pedido,
      "Loja": r.matchedOrder.loja,
      "Loja Virtual": r.matchedOrder.lojaVirtual,
      "Nota Fiscal": r.matchedOrder.notaFiscal,
      "ShipmentID": r.matchedOrder.shipmentId,
      "Volume": r.matchedOrder.volume,
      "Destinatário": r.matchedOrder.destinatario,
      "Endereço": r.matchedOrder.enderecoDestinatario,
      "Remetente": r.matchedOrder.remetente,
      "Endereço remetente": r.matchedOrder.enderecoRemetente,
      "Serviço": r.matchedOrder.dataEmissao ?? "",
      "Contrato": r.matchedOrder.protocolo ?? "",
    } : {} as Record<string, string>,
  }));

  // Collect all possible columns for CSV export
  const baseKeys = ["Pedido", "Loja", "Loja Virtual", "Nota Fiscal", "ShipmentID", "Volume", "Destinatário", "Endereço", "Remetente", "Endereço remetente", "Serviço", "Contrato"];
  const parsedKeys = [...new Set(full.flatMap((r) => Object.keys(r.campos)))];
  const allKeys = [...baseKeys, ...parsedKeys.filter(k => !baseKeys.includes(k))];
  
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  
  const toCsv = () => {
    const headers = ["codigo", "tipo", "status", ...allKeys, "data_hora"];
    const body = full.map((r) => [
      r.code,
      r.tipo,
      r.matchStatus,
      ...allKeys.map((k) => r.orderFields[k] ?? r.campos[k] ?? ""),
      r.time,
    ]);
    return [headers.map(q).join(","), ...body.map(row => row.map(q).join(","))].join("\n");
  };

  function download() {
    const url = URL.createObjectURL(new Blob(["\ufeff" + toCsv()], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "leituras.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function pdf() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    doc.text("Leituras de Códigos de Barras", 14, 15);
    if (importedOrders) {
      doc.text(`Base: ${importedOrders.fileName} (${importedOrders.orders.length} pedidos)`, 14, 22);
    }
    autoTable(doc, {
      startY: importedOrders ? 28 : 22,
      styles: { fontSize: 7 },
      head: [["#", "Código", "Status", "Pedido", "NF", "Serviço", "Destinatário", "Endereço", "Data/hora"]],
      body: full.map((r, i) => [
        String(rows.length - i),
        r.code,
        r.matchStatus === 'matched' ? '✓' : r.matchStatus === 'duplicate' ? '⚠' : '✗',
        r.orderFields['Pedido'] || r.campos['Pedido'] || "",
        r.orderFields['Nota Fiscal'] || r.campos['Nota Fiscal'] || "",
        r.orderFields['Serviço'] || "",
        r.orderFields['Destinatário'] || "",
        r.orderFields['Endereço'] || "",
        r.time,
      ]),
    });
    doc.save("leituras.pdf");
  }

  async function copy() {
    await navigator.clipboard.writeText(
      full.map((r) => [
        r.code,
        r.tipo,
        r.matchStatus,
        ...allKeys.map((k) => r.orderFields[k] || r.campos[k] || ""),
        r.time,
      ].join("\t")).join("\n")
    );
    setMsg("Leituras copiadas!");
    setTimeout(() => setMsg(""), 2000);
  }

  const btn = "rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40 transition-colors";
  const badgeStyles = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium";

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leitor de Códigos de Barras</h1>
        <div className="flex gap-2">
          <label className={`${btn} bg-primary text-primary-foreground cursor-pointer`}>
            Importar ZPL ou PDF
            <input ref={fileInputRef} type="file" accept=".zpl,.txt,.pdf,application/pdf" className="hidden" onChange={handleFileChange} />
          </label>
          {importedOrders && (
            <button onClick={clearImportedOrders} className={`${btn} border text-destructive`}>
              Remover Base ({importedOrders.orders.length})
            </button>
          )}
        </div>
      </div>

      {/* Import status banner */}
      {importedOrders && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-green-800 font-medium">
              Base carregada: <span className="font-mono">{importedOrders.fileName}</span> — 
              {importedOrders.orders.length} pedidos indexados ({importedOrders.index.size} códigos)
            </span>
            <span className="text-green-600">Importado em {importedOrders.importedAt}</span>
          </div>
          {importedOrders.parseResult && importedOrders.parseResult.warnings.length > 0 && (
            <details className="mt-2 text-xs text-green-700">
              <summary className="cursor-pointer">Ver avisos ({importedOrders.parseResult.warnings.length})</summary>
              <ul className="mt-1 ml-4 list-disc space-y-1">
                {importedOrders.parseResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {!importedOrders && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          Nenhuma base de pedidos carregada. Importe um arquivo <code className="px-1 bg-amber-100 rounded">.zpl</code> ou <code className="px-1 bg-amber-100 rounded">.txt</code> 
          com etiquetas ZPL para associar automaticamente os códigos escaneados aos pedidos.
        </div>
      )}

      {importProgress && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
          <div className="flex items-center justify-between text-blue-800">
            <span>{importProgress.stage}</span>
            <span>{importProgress.progress}%</span>
          </div>
          <div className="mt-1 h-2 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${importProgress.progress}%` }} />
          </div>
        </div>
      )}

      {/* Camera view */}
      <div className="overflow-hidden rounded-lg bg-muted">
        <video ref={videoRef} className={scanning ? "aspect-video w-full object-cover" : "hidden"} muted playsInline />
        {!scanning && (
          <div className="flex aspect-video items-center justify-center text-muted-foreground">
            {importedOrders ? "Câmera desligada — clique em 'Iniciar câmera' para escanear" : "Importe uma base de pedidos e inicie a câmera"}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {scanning
          ? <button onClick={stop} className={`${btn} bg-destructive text-destructive-foreground`}>Parar câmera</button>
          : <button onClick={start} className={`${btn} bg-primary text-primary-foreground`} disabled={!importedOrders}>
              Iniciar câmera
            </button>}
        <button onClick={download} disabled={!rows.length} className={`${btn} bg-secondary text-secondary-foreground`}>Baixar CSV</button>
        <button onClick={pdf} disabled={!rows.length} className={`${btn} bg-secondary text-secondary-foreground`}>Baixar PDF</button>
        <button onClick={copy} disabled={!rows.length} className={`${btn} bg-secondary text-secondary-foreground`}>Copiar</button>
        <button onClick={() => confirm("Apagar todas as leituras?") && setRows([])} disabled={!rows.length} className={`${btn} border text-destructive`}>Limpar leituras</button>
      </div>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {/* Results table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="py-2 px-2">#</th>
              <th className="py-2 px-2">Status</th>
              <th className="py-2 px-2">Código lido</th>
              <th className="py-2 px-2">Tipo</th>
              <th className="py-2 px-2">Pedido</th>
              <th className="py-2 px-2">Loja</th>
              <th className="py-2 px-2">Destinatário</th>
              <th className="py-2 px-2">Endereço</th>
              <th className="py-2 px-2">Nota Fiscal</th>
              <th className="py-2 px-2">ShipmentID</th>
              <th className="py-2 px-2">Volume</th>
              <th className="py-2 px-2">Data/hora</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {full.map((r, i) => (
              <tr key={i} className={`border-b align-top ${r.matchStatus === 'matched' ? 'bg-green-50' : r.matchStatus === 'duplicate' ? 'bg-amber-50' : r.matchStatus === 'not_found' && importedOrders ? 'bg-red-50' : ''}`}>
                <td className="py-2 px-2 text-muted-foreground">{rows.length - i}</td>
                <td className="py-2 px-2">
                  {r.matchStatus === 'matched' && <span className={`${badgeStyles} bg-green-100 text-green-800`}>✓ Encontrado</span>}
                  {r.matchStatus === 'duplicate' && <span className={`${badgeStyles} bg-amber-100 text-amber-800`}>⚠ Duplicado</span>}
                  {r.matchStatus === 'not_found' && <span className={`${badgeStyles} bg-red-100 text-red-800`}>✗ Não encontrado</span>}
                  {!importedOrders && <span className={`${badgeStyles} bg-gray-100 text-gray-600`}>Sem base</span>}
                </td>
                <td className="py-2 px-2 max-w-[12rem] font-mono text-xs break-all">{r.code}</td>
                <td className="py-2 px-2 whitespace-nowrap">{r.tipo}</td>
                <td className="py-2 px-2 font-medium">{r.orderFields['Pedido'] || r.campos['Pedido'] || "—"}</td>
                <td className="py-2 px-2">{r.orderFields['Loja'] || "—"}</td>
                <td className="py-2 px-2 max-w-[10rem]">{r.orderFields['Destinatário'] || "—"}</td>
                <td className="py-2 px-2 max-w-[14rem] text-xs">{r.orderFields["Endereço"] || "—"}</td>
                <td className="py-2 px-2">{r.orderFields['Nota Fiscal'] || "—"}</td>
                <td className="py-2 px-2 font-mono text-xs">{r.orderFields['ShipmentID'] || "—"}</td>
                <td className="py-2 px-2">{r.orderFields['Volume'] || "—"}</td>
                <td className="py-2 px-2 text-muted-foreground">{r.time}</td>
                <td className="py-2 px-2">
                  <button 
                    onClick={() => setRows(rows.filter((_, j) => j !== i))} 
                    className="text-destructive hover:underline text-xs"
                    title="Remover esta leitura"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={12} className="py-6 text-center text-muted-foreground">
                  {importedOrders ? "Nenhum código lido ainda. Aponte a câmera para um código de barras." : "Importe um arquivo ZPL e inicie a câmera para começar."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Order detail modal would go here - for now, click row to see details in console */}
      <details className="mt-4 border rounded-lg p-4 bg-muted/30">
        <summary className="cursor-pointer font-medium">Ajuda e detalhes</summary>
        <div className="mt-2 text-sm text-muted-foreground space-y-2">
          <p><strong>Fluxo de uso:</strong></p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Clique em "Importar ZPL ou PDF" e selecione o arquivo com as etiquetas</li>
            <li>O sistema extrai os pedidos e cria um índice pelos códigos de barras (ShipmentID)</li>
            <li>Clique em "Iniciar câmera" e aponte para o código de barras do pacote</li>
            <li>O pedido correspondente é exibido automaticamente na tabela com status ✓</li>
          </ol>
          <p><strong>Status das leituras:</strong></p>
          <ul className="list-disc ml-4 space-y-1">
            <li><span className="text-green-700">✓ Encontrado</span> — Código corresponde a um pedido importado</li>
            <li><span className="text-amber-700">⚠ Duplicado</span> — Este pedido já foi lido nesta sessão</li>
            <li><span className="text-red-700">✗ Não encontrado</span> — Código não está na base importada</li>
            <li><span className="text-gray-600">Sem base</span> — Nenhum arquivo ZPL foi importado</li>
          </ul>
          <p><strong>Campos extraídos do ZPL:</strong> Pedido, Loja Virtual, Nota Fiscal, ShipmentID, Volume, Destinatário, Endereço, Remetente (Loja), CNPJ, IE.</p>
          <p><strong>Formatos suportados:</strong> Código 128 (^BCN), DataMatrix (^BXN), QR Code. O ShipmentID do código 128 é usado como chave primária.</p>
        </div>
      </details>
    </main>
  );
}