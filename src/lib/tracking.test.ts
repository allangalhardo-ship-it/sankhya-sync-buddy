import { describe, it, expect } from "vitest";
import { situacaoToStatus, primeiroLink, bloqueioFinalizacao, codigoMotivo, trocarCanhoto } from "./tracking";

describe("trocarCanhoto", () => {
  const ps = [
    { link_canhoto: "L10", conferido: true },
    { link_canhoto: "L11", conferido: true },
    { link_canhoto: "L12", conferido: true },
  ];
  it("inverte os links das duas notas sem duplicar", () => {
    const r = trocarCanhoto(ps, 0, 1);
    expect(r.map((p) => p.link_canhoto)).toEqual(["L11", "L10", "L12"]);
    expect(r[0].canhoto_ajustado && r[1].canhoto_ajustado).toBe(true);
    expect(r[0].conferido || r[1].conferido).toBe(false);
    expect(r[2].conferido).toBe(true);
  });
});

describe("situacaoToStatus", () => {
  it("ENTREGUE vira entregue", () => expect(situacaoToStatus("ENTREGUE")).toEqual({ status: "entregue", parcial: false }));
  it("PARCIAL vira devolvido parcial", () => expect(situacaoToStatus("PARCIAL")).toEqual({ status: "devolvido", parcial: true }));
  it("DEVOLVIDO vira devolvido", () => expect(situacaoToStatus("DEVOLVIDO")?.status).toBe("devolvido"));
  it("PROBLEMA vira reentrega", () => expect(situacaoToStatus("PROBLEMA")?.status).toBe("reentrega"));
  it("motivo REENTREGA vira reentrega", () =>
    expect(situacaoToStatus("DEVOLVIDO", "REENTREGA-CLIENTE FECHADO")?.status).toBe("reentrega"));
  it("DEVOLVIDO com outro motivo continua devolvido", () =>
    expect(situacaoToStatus("DEVOLVIDO", "AVARIA")?.status).toBe("devolvido"));
  it("PENDENTE/EM_ROTA não preenche", () => {
    expect(situacaoToStatus("PENDENTE")).toBeNull();
    expect(situacaoToStatus("EM_ROTA")).toBeNull();
    expect(situacaoToStatus(null)).toBeNull();
  });
});

describe("primeiroLink", () => {
  it("usa o primeiro link", () => expect(primeiroLink("https://a/1.jpg | https://a/2.jpg")).toBe("https://a/1.jpg"));
  it("vazio = null", () => expect(primeiroLink("")).toBeNull());
});

describe("bloqueioFinalizacao", () => {
  const base = { numero_pedido: "1", status_entrega: "entregue" as const, conferido: true, link_canhoto: "https://x", temFoto: false };
  it("bloqueia nota não conferida", () => expect(bloqueioFinalizacao([{ ...base, conferido: false }])).not.toBeNull());
  it("bloqueia entregue sem link e sem foto", () => expect(bloqueioFinalizacao([{ ...base, link_canhoto: null }])).not.toBeNull());
  it("libera entregue com foto tirada", () => expect(bloqueioFinalizacao([{ ...base, link_canhoto: null, temFoto: true }])).toBeNull());
  it("libera tudo conferido com link", () => expect(bloqueioFinalizacao([base])).toBeNull());
});

it("codigoMotivo pega só o código", () => expect(codigoMotivo("12 - CLIENTE FECHADO")).toBe(12));
