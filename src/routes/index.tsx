import { createFileRoute } from "@tanstack/react-router";
import { Scanner } from "@/components/Scanner";

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
  component: Scanner,
});

