import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Leitor de Códigos de Barras" },
      { name: "description", content: "Leia códigos de barras com a câmera e exporte em CSV." },
      { property: "og:title", content: "Leitor de Códigos de Barras" },
      { property: "og:description", content: "Leia códigos de barras com a câmera e exporte em CSV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Row = { code: string; format: string; time: string };
const KEY = "barcodes";

function Index() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try { setRows(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {}
    return () => controlsRef.current?.stop();
  }, []);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(rows)); }, [rows]);

  async function start() {
    setMsg("");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (res) => {
          if (!res) return;
          const code = res.getText();
          const now = Date.now();
          if (code === lastRef.current.code && now - lastRef.current.t < 2500) return;
          lastRef.current = { code, t: now };
          navigator.vibrate?.(80);
          setRows((r) => [{ code, format: String(res.getBarcodeFormat()), time: new Date().toLocaleString() }, ...r]);
        },
      );
      setScanning(true);
    } catch (e) {
      setMsg("Não foi possível acessar a câmera: " + (e as Error).message);
    }
  }
  function stop() { controlsRef.current?.stop(); controlsRef.current = null; setScanning(false); }

  const toCsv = () =>
    ["codigo,data_hora", ...rows.map((r) => `"${r.code.replace(/"/g, '""')}","${r.time}"`)].join("\n");
  function download() {
    const url = URL.createObjectURL(new Blob(["\ufeff" + toCsv()], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "codigos.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  async function copy() {
    await navigator.clipboard.writeText(rows.map((r) => r.code).join("\n"));
    setMsg("Códigos copiados!");
  }

  const btn = "rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40";
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Leitor de Códigos de Barras</h1>
      <div className="overflow-hidden rounded-lg bg-muted">
        <video ref={videoRef} className={scanning ? "aspect-video w-full object-cover" : "hidden"} muted playsInline />
        {!scanning && <div className="flex aspect-video items-center justify-center text-muted-foreground">Câmera desligada</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        {scanning
          ? <button onClick={stop} className={`${btn} bg-destructive text-destructive-foreground`}>Parar</button>
          : <button onClick={start} className={`${btn} bg-primary text-primary-foreground`}>Iniciar câmera</button>}
        <button onClick={download} disabled={!rows.length} className={`${btn} bg-secondary text-secondary-foreground`}>Baixar CSV</button>
        <button onClick={copy} disabled={!rows.length} className={`${btn} bg-secondary text-secondary-foreground`}>Copiar</button>
        <button onClick={() => confirm("Apagar todos?") && setRows([])} disabled={!rows.length} className={`${btn} border`}>Limpar</button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="py-2">#</th><th>Código</th><th>Data/hora</th><th></th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="py-2">{rows.length - i}</td>
              <td className="font-mono break-all">{r.code}</td>
              <td className="text-muted-foreground">{r.time}</td>
              <td><button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-destructive">✕</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Nenhum código lido ainda.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
