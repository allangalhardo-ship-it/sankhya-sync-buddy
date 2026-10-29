export type StatusEntrega = "pendente" | "entregue" | "devolvido" | "reentrega" | "nao_carregado";

export interface TrackingRow {
  NUNOTA: number;
  SITUACAO: string | null;
  MOTIVO: string | null;
  LINKSIMAGEM: string | null;
}

/** Maps Lincros situation to the acerto status. null = no pre-fill. */
export function situacaoToStatus(
  situacao: string | null | undefined,
  motivo?: string | null
): { status: StatusEntrega; parcial: boolean } | null {
  const sit = (situacao || "").trim().toUpperCase();
  // PROBLEMA, or a reason starting with REENTREGA, means the goods go back to a route: not a return
  if (sit === "PROBLEMA" || (sit && sit !== "ENTREGUE" && sit !== "PARCIAL" && /^\s*REENTREGA/i.test(motivo || ""))) {
    return { status: "reentrega", parcial: false };
  }
  switch ((situacao || "").trim().toUpperCase()) {
    case "ENTREGUE":
      return { status: "entregue", parcial: false };
    case "PARCIAL":
      return { status: "devolvido", parcial: true };
    case "DEVOLVIDO":
      return { status: "devolvido", parcial: false };
    default:
      return null;
  }
}

/** LINKSIMAGEM may carry several links separated by "|": use the first one. */
export function primeiroLink(links: string | null | undefined): string | null {
  if (!links) return null;
  const first = links.split("|").map((s) => s.trim()).find((s) => /^https?:\/\//i.test(s));
  return first || null;
}

export interface PedidoCheck {
  numero_pedido: string;
  status_entrega: StatusEntrega;
  conferido: boolean;
  link_canhoto?: string | null;
  temFoto: boolean;
}

/** Returns the reason the acerto cannot be finalized, or null when it can. */
export function bloqueioFinalizacao(pedidos: PedidoCheck[]): string | null {
  const reais = pedidos.filter((p) => p.numero_pedido !== "Sem pedidos");
  const naoConferidos = reais.filter((p) => !p.conferido).length;
  if (naoConferidos > 0) return `${naoConferidos} nota(s) ainda não conferida(s).`;
  const semCanhoto = reais.filter((p) => p.status_entrega === "entregue" && !p.link_canhoto && !p.temFoto).length;
  if (semCanhoto > 0) return `${semCanhoto} nota(s) Entregue sem foto do canhoto no roteirizador. Tire a foto antes de finalizar.`;
  return null;
}

/** "12 - DESCRICAO" -> 12 */
export function codigoMotivo(motivo: string | null | undefined): number | null {
  const n = parseInt((motivo || "").split("-")[0].trim(), 10);
  return Number.isFinite(n) ? n : null;
}
