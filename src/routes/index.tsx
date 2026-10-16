import { createFileRoute } from "@tanstack/react-router";
import { WookiRush } from "@/components/wooki-rush";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <WookiRush />;
}
