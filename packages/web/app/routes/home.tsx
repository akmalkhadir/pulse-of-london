import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Pulse of London — is the network worse than usual?" },
    { name: "description", content: "A live, unofficial map of how busy and disrupted London's rail network is right now versus a typical day." },
  ];
}

export default function Home(_: Route.ComponentProps) {
  return <main>Pulse of London</main>;
}
