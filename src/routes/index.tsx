import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bolão da Galera" },
      { name: "description", content: "Bolão entre amigos: poste jogos, envie palpites e veja o ranking em tempo real." },
      { property: "og:title", content: "Bolão da Galera" },
      { property: "og:description", content: "Bolão entre amigos: poste jogos, envie palpites e veja o ranking em tempo real." },
    ],
  }),
  component: Index,
});

function Index() {
  // O site do bolão é puro HTML/CSS/JS em /public/bolao/.
  // Usamos um iframe ocupando a tela inteira para servi-lo como home.
  return (
    <iframe
      src="/bolao/index.html"
      title="Bolão da Galera"
      style={{ border: "none", width: "100vw", height: "100vh", display: "block" }}
    />
  );
}
