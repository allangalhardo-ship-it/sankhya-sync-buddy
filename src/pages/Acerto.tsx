import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { sankhya, CabecalhoData, PedidoData } from "@/lib/sankhya";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ChecklistDevolucaoDialog, { DevolucaoInfo } from "@/components/ChecklistDevolucaoDialog";
import {
  ArrowLeft, ScanBarcode, Loader2, Truck, User, MapPin,
  CheckCircle2, XCircle, RotateCcw, Clock, Camera, Save, Send, Video
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

type StatusEntrega = "pendente" | "entregue" | "devolvido" | "reentrega";

interface Pedido {
  id?: string;
  numero_pedido: string;
  numero_unico?: string;
  cliente_nome: string;
  endereco?: string;
  status_entrega: StatusEntrega;
  observacao: string;
  foto_canhoto_url?: string;
  fotoFile?: File;
  is_reentrega?: boolean;
  vendedor?: string;
}

interface OrdemCarga {
  numero: string;
  motorista: string;
  placa: string;
  pedidos: Pedido[];
}

const statusConfig: Record<StatusEntrega, { label: string; icon: typeof CheckCircle2; className: string }> = {
  pendente: { label: "Pendente", icon: Clock, className: "bg-muted text-muted-foreground" },
  entregue: { label: "Entregue", icon: CheckCircle2, className: "bg-success text-success-foreground" },
  devolvido: { label: "Devolvido", icon: XCircle, className: "bg-destructive text-destructive-foreground" },
  reentrega: { label: "Reentrega", icon: RotateCcw, className: "bg-warning text-warning-foreground" },
};

const Acerto = () => {
  const { tipo } = useParams<{ tipo: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [codigoBarras, setCodigoBarras] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ordemCarga, setOrdemCarga] = useState<OrdemCarga | null>(null);
  const [acertoId, setAcertoId] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [showDevolucaoDialog, setShowDevolucaoDialog] = useState(false);
  const [pendingDevolucaoFinalize, setPendingDevolucaoFinalize] = useState(false);
  const tipoLabel = tipo === "entrega" ? "Entrega" : "Devolução";

  const startScanner = async () => {
    try {
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ];
      const html5Qrcode = new Html5Qrcode("barcode-reader", {
        formatsToSupport,
        verbose: false,
      });
      scannerRef.current = html5Qrcode;
      setScannerActive(true);
      await html5Qrcode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        } as any,
        (decodedText) => {
          console.log("Barcode lido:", decodedText);
          setCodigoBarras(decodedText);
          stopScanner();
          setTimeout(() => {
            document.getElementById("btn-scan-search")?.click();
          }, 300);
        },
        () => {}
      );
    } catch (err) {
      console.error("Erro ao abrir câmera:", err);
      toast({ title: "Erro", description: "Não foi possível acessar a câmera.", variant: "destructive" });
      setScannerActive(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
  };

  const handleScan = async () => {
    if (!codigoBarras.trim()) return;
    setLoading(true);

    try {
      // Fetch cabeçalho and pedidos in parallel from Sankhya
      const [cabecalhoRes, pedidosRes] = await Promise.all([
        sankhya.getCabecalho(codigoBarras.trim()),
        sankhya.getPedidos(codigoBarras.trim()),
      ]);

      if (!cabecalhoRes.success || !cabecalhoRes.data) {
        console.error("Erro ao buscar cabeçalho:", cabecalhoRes);
        toast({
          title: "Erro",
          description: cabecalhoRes.error || "Ordem de carga não encontrada no Sankhya.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const cab = cabecalhoRes.data as CabecalhoData;
      const pedidosData = (pedidosRes.data || []) as PedidoData[];

      const sankhyaStatusToEntrega = (status: unknown): StatusEntrega => {
        const n =
          typeof status === "string" ? parseInt(status, 10) : typeof status === "number" ? status : NaN;

        switch (n) {
          case 1:
            return "entregue";
          case 5:
            return "devolvido";
          case 3:
            return "reentrega";
          case 8:
          default:
            return "pendente";
        }
      };

      // Build OrdemCarga from real Sankhya data
      const ordem: OrdemCarga = {
        numero: String(cab.ORDEMCARGA),
        motorista: cab.NOMEPARC || "Motorista não encontrado",
        placa: pedidosData.length > 0 ? pedidosData[0].PLACA || "Placa não informada" : "Placa não informada",
        pedidos: pedidosData.map((p) => ({
          numero_pedido: String(p.NUNOTA || ""),
          numero_unico: String(p.NUMNOTA || ""),
          cliente_nome: p.NOME_DO_CLIENTE || "Cliente",
          endereco: p.ENDERECO || "",
          status_entrega: sankhyaStatusToEntrega(p.STATUS_ACERTO),
          observacao: [p.CARTASELO, p.AGENDAMENTO, p.PRIORIDADE].filter(Boolean).join(" | "),
          is_reentrega: p.REENT === "REENTREGA",
          vendedor: p.VENDEDOR || "",
        })),
      };

      if (ordem.pedidos.length === 0) {
        ordem.pedidos = [
          {
            numero_pedido: "Sem pedidos",
            cliente_nome: "Nenhum pedido encontrado nesta ordem de carga",
            status_entrega: "pendente",
            observacao: "",
          },
        ];
      }

      setOrdemCarga(ordem);

      // Create acerto record in database
      const { data: acertoData, error: acertoError } = await supabase
        .from("acertos")
        .insert({
          user_id: user!.id,
          tipo: tipo as "entrega" | "devolucao",
          numero_ordem_carga: ordem.numero,
          motorista_nome: ordem.motorista,
          placa: ordem.placa,
        })
        .select("id")
        .single();

      if (acertoError) {
        console.error("Erro ao criar acerto:", acertoError);
        toast({ title: "Erro", description: "Erro ao salvar acerto no banco.", variant: "destructive" });
      } else {
        setAcertoId(acertoData.id);

        // Insert pedidos
        if (ordem.pedidos.length > 0 && ordem.pedidos[0].numero_pedido !== "Sem pedidos") {
          const { error: pedidosError } = await supabase
            .from("acerto_pedidos")
            .insert(
              ordem.pedidos.map((p) => ({
                acerto_id: acertoData.id,
                numero_pedido: p.numero_pedido,
                numero_unico: p.numero_unico,
                cliente_nome: p.cliente_nome,
                endereco: p.endereco,
                status_entrega: p.status_entrega,
                observacao: p.observacao,
              }))
            );

          if (pedidosError) {
            console.error("Erro ao inserir pedidos:", pedidosError);
          }
        }
      }

      toast({
        title: "Romaneio carregado!",
        description: `OC ${ordem.numero} - ${cab.QTDPEDIDO} pedido(s), ${cab.QTDCLI} cliente(s)`,
      });
    } catch (err) {
      console.error("Erro:", err);
      toast({
        title: "Erro",
        description: "Não foi possível carregar o romaneio. Verifique o código.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePedidoStatus = (index: number, status: StatusEntrega) => {
    if (!ordemCarga) return;
    const updated = { ...ordemCarga };
    updated.pedidos[index].status_entrega = status;
    setOrdemCarga(updated);
  };

  const updatePedidoObs = (index: number, obs: string) => {
    if (!ordemCarga) return;
    const updated = { ...ordemCarga };
    updated.pedidos[index].observacao = obs;
    setOrdemCarga(updated);
  };

  const handlePhotoCapture = (index: number, file: File) => {
    if (!ordemCarga) return;
    const updated = { ...ordemCarga };
    updated.pedidos[index].fotoFile = file;
    setOrdemCarga(updated);
  };

  const devolvidos = ordemCarga?.pedidos.filter((p) => p.status_entrega === "devolvido") ?? [];

  const handleFinalize = async () => {
    if (!ordemCarga || !acertoId) return;

    // If there are devolvidos and we haven't shown the dialog yet, show it
    if (devolvidos.length > 0 && !pendingDevolucaoFinalize) {
      setShowDevolucaoDialog(true);
      return;
    }

    await doFinalize();
  };

  const handleDevolucaoConfirm = async (devolucoes: DevolucaoInfo[]) => {
    if (!acertoId) return;

    // Save devolução data to dedicated table
    const { error } = await supabase.from("acerto_devolucoes").insert(
      devolucoes.map((dev) => ({
        acerto_id: acertoId,
        numero_pedido: dev.nunota,
        cliente_nome: dev.cliente_nome,
        tipo_devolucao: dev.tipo_devolucao,
        agregado: dev.agregado,
        nf_fr: dev.nf_fr,
        nf_cliente: dev.nf_cliente,
        parceiro: dev.parceiro,
        vendedor: dev.vendedor,
        motivo: dev.motivo,
        conferencia_produtos: dev.conferencia_produtos,
        desconta_taxa_vendedor: dev.desconta_taxa_vendedor,
      }))
    );

    if (error) {
      console.error("Erro ao salvar devoluções:", error);
      toast({ title: "Erro", description: "Erro ao salvar dados de devolução.", variant: "destructive" });
      return;
    }

    setPendingDevolucaoFinalize(true);
    setShowDevolucaoDialog(false);
  };

  // Effect-like: trigger finalize after devolução confirm
  // We use a flag + useEffect pattern via the state
  if (pendingDevolucaoFinalize && !saving) {
    setPendingDevolucaoFinalize(false);
    // Use setTimeout to avoid calling setState during render
    setTimeout(() => doFinalize(), 0);
  }

  const doFinalize = async () => {
    if (!ordemCarga || !acertoId) return;
    setSaving(true);

    const statusMap: Record<StatusEntrega, number> = {
      pendente: 8,
      entregue: 1,
      devolvido: 5,
      reentrega: 3,
    };

    try {
      for (const pedido of ordemCarga.pedidos) {
        let fotoUrl = pedido.foto_canhoto_url;

        if (pedido.fotoFile) {
          const fileName = `${acertoId}/${pedido.numero_pedido}_${Date.now()}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("canhotos")
            .upload(fileName, pedido.fotoFile);

          if (uploadError) {
            console.error("Erro ao fazer upload:", uploadError);
          } else {
            fotoUrl = uploadData.path;
          }
        }

        if (pedido.id) {
          await supabase
            .from("acerto_pedidos")
            .update({
              status_entrega: pedido.status_entrega,
              observacao: pedido.observacao,
              foto_canhoto_url: fotoUrl,
            })
            .eq("id", pedido.id);
        } else {
          await supabase
            .from("acerto_pedidos")
            .update({
              status_entrega: pedido.status_entrega,
              observacao: pedido.observacao,
              foto_canhoto_url: fotoUrl,
            })
            .eq("acerto_id", acertoId)
            .eq("numero_pedido", pedido.numero_pedido);
        }
      }

      const pedidosSankhya = ordemCarga.pedidos
        .filter((p) => p.numero_pedido !== "Sem pedidos")
        .map((p) => ({
          nunota: parseInt(p.numero_pedido, 10),
          ordemCarga: parseInt(ordemCarga.numero, 10),
          status: statusMap[p.status_entrega],
        }));

      if (pedidosSankhya.length > 0) {
        const sankhyaResult = await sankhya.saveAcerto(pedidosSankhya);
        if (!sankhyaResult.success) {
          console.error("Erro ao salvar no Sankhya:", sankhyaResult);
          toast({
            title: "Atenção",
            description: "Acerto salvo localmente, mas houve erro ao gravar no Sankhya: " + (sankhyaResult.error || "Erro desconhecido"),
            variant: "destructive",
          });
        } else {
          console.log("Sankhya AD_NFACERTO atualizado com sucesso:", sankhyaResult);
        }
      }

      await supabase
        .from("acertos")
        .update({ status: "finalizado", finalizado_at: new Date().toISOString() })
        .eq("id", acertoId);

      toast({ title: "Acerto finalizado!", description: "Dados salvos no sistema e no Sankhya com sucesso." });
      navigate("/dashboard");
    } catch (err) {
      console.error("Erro ao finalizar:", err);
      toast({ title: "Erro", description: "Erro ao finalizar o acerto.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = ordemCarga?.pedidos.filter((p) => p.status_entrega === "pendente").length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header - FR branded */}
      <header className="bg-[hsl(220,35%,14%)] sticky top-0 z-10">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="text-[hsl(215,15%,75%)] hover:bg-[hsl(220,30%,20%)] hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-white">Checklist de {tipoLabel}</h1>
            <p className="text-xs text-[hsl(215,15%,65%)]">FR Distribuição · Acerto de Romaneio</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-2xl">
        {/* Scanner Section */}
        {!ordemCarga && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ScanBarcode className="h-5 w-5 text-primary" />
                Ler Código de Barras
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Escaneie o código de barras do romaneio ou digite o número da ordem de carga.
              </p>
              
              {/* Camera scanner area */}
              <div id="barcode-reader" className={scannerActive ? "w-full rounded-lg overflow-hidden" : "hidden"} />
              
              {scannerActive && (
                <Button variant="outline" onClick={stopScanner} className="w-full">
                  <XCircle className="h-4 w-4 mr-2" />
                  Fechar Câmera
                </Button>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Número da ordem de carga"
                  value={codigoBarras}
                  onChange={(e) => setCodigoBarras(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  autoFocus
                  className="text-lg font-mono"
                />
                {!scannerActive && (
                  <Button variant="outline" onClick={startScanner} title="Abrir câmera">
                    <Video className="h-4 w-4" />
                  </Button>
                )}
                <Button id="btn-scan-search" onClick={handleScan} disabled={loading || !codigoBarras.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ordem de Carga Info */}
        {ordemCarga && (
          <>
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <ScanBarcode className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Ordem de Carga</p>
                      <p className="font-bold text-foreground">{ordemCarga.numero}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Motorista</p>
                      <p className="font-semibold text-foreground">{ordemCarga.motorista}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Placa</p>
                      <p className="font-semibold text-foreground">{ordemCarga.placa}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Pedidos</p>
                      <p className="font-semibold text-foreground">{ordemCarga.pedidos.length}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progress */}
            <div className="flex items-center justify-between bg-card rounded-lg p-3 border">
              <span className="text-sm font-medium text-foreground">Progresso</span>
              <div className="flex gap-2">
                {Object.entries(statusConfig).map(([key, config]) => {
                  const count = ordemCarga.pedidos.filter((p) => p.status_entrega === key).length;
                  if (count === 0) return null;
                  return (
                    <Badge key={key} className={config.className}>
                      {config.label}: {count}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {/* Pedidos List */}
            <div className="space-y-4">
              {ordemCarga.pedidos.map((pedido, index) => {
                const status = statusConfig[pedido.status_entrega];
                const StatusIcon = status.icon;
                return (
                  <Card key={index} className="overflow-hidden">
                    <div className={`h-1 ${status.className}`} />
                    <CardContent className="py-4 space-y-4">
                      {/* Pedido Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-foreground">Pedido {pedido.numero_pedido}</p>
                            {pedido.is_reentrega && (
                              <Badge variant="outline" className="text-[10px] border-warning text-warning bg-warning/10 px-1.5 py-0">
                                <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                                Já foi reentrega
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{pedido.cliente_nome}</p>
                          {pedido.endereco && (
                            <p className="text-xs text-muted-foreground mt-1">{pedido.endereco}</p>
                          )}
                        </div>
                        <Badge className={status.className}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                      </div>

                      {/* Status Buttons */}
                      <div className="grid grid-cols-4 gap-2">
                        {(Object.entries(statusConfig) as [StatusEntrega, typeof statusConfig.pendente][]).map(
                          ([key, config]) => {
                            const Icon = config.icon;
                            const isActive = pedido.status_entrega === key;
                            return (
                              <Button
                                key={key}
                                variant={isActive ? "default" : "outline"}
                                size="sm"
                                className={`flex flex-col h-auto py-2 text-xs ${isActive ? config.className : ""}`}
                                onClick={() => updatePedidoStatus(index, key)}
                              >
                                <Icon className="h-4 w-4 mb-1" />
                                {config.label}
                              </Button>
                            );
                          }
                        )}
                      </div>

                      {/* Observação */}
                      <Textarea
                        placeholder="Observação (opcional)"
                        value={pedido.observacao}
                        onChange={(e) => updatePedidoObs(index, e.target.value)}
                        className="text-sm resize-none"
                        rows={2}
                      />

                      {/* Photo */}
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          ref={(el) => { fileInputRefs.current[index] = el; }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoCapture(index, file);
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[index]?.click()}
                          className="text-xs"
                        >
                          <Camera className="h-4 w-4 mr-1" />
                          {pedido.fotoFile ? "Foto anexada ✓" : "Anexar Canhoto"}
                        </Button>
                        {pedido.fotoFile && (
                          <span className="text-xs text-success font-medium">
                            {pedido.fotoFile.name}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Finalize Button */}
            <div className="sticky bottom-4 pt-4">
              <Button
                onClick={handleFinalize}
                disabled={saving || pendingCount === ordemCarga.pedidos.length}
                className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-lg"
                size="lg"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Send className="mr-2 h-5 w-5" />
                )}
                Finalizar Acerto
                {pendingCount > 0 && (
                  <span className="ml-2 text-sm font-normal opacity-80">({pendingCount} pendentes)</span>
                )}
              </Button>
            </div>
          </>
        )}
      </main>

      <ChecklistDevolucaoDialog
        open={showDevolucaoDialog}
        onClose={() => setShowDevolucaoDialog(false)}
        onConfirm={handleDevolucaoConfirm}
      pedidosDevolvidos={devolvidos.map((p) => ({
          numero_pedido: p.numero_pedido,
          cliente_nome: p.cliente_nome,
          nf_fr: p.numero_unico || p.numero_pedido,
          parceiro: p.cliente_nome,
          vendedor: p.vendedor || "",
        }))}
        motorista={ordemCarga?.motorista || ""}
        saving={saving}
      />
    </div>
  );
};

export default Acerto;
