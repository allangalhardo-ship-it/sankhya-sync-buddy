import { useState, useRef, useEffect, useCallback } from "react";
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
  ArrowLeft, ScanBarcode, Loader2, Truck, User, MapPin, AlertTriangle,
  CheckCircle2, XCircle, RotateCcw, Clock, Camera, Save, Send, Video
} from "lucide-react";


type StatusEntrega = "pendente" | "entregue" | "devolvido" | "reentrega" | "nao_carregado";

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
  codparc?: number;
  vlrnota?: number;
  dtneg?: string;
  codvend?: number;
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
  nao_carregado: { label: "Não Carreg.", icon: Truck, className: "bg-orange-500 text-white" },
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const [showDevolucaoDialog, setShowDevolucaoDialog] = useState(false);
  const [pendingDevolucaoFinalize, setPendingDevolucaoFinalize] = useState(false);
  const tipoLabel = tipo === "entrega" ? "Entrega" : "Devolução";

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScannerActive(false);
  }, []);

  const startScanner = async () => {
    try {
      // Check for BarcodeDetector support
      if (!('BarcodeDetector' in window)) {
        toast({ title: "Não suportado", description: "Seu navegador não suporta leitura de código de barras. Tente usar o Chrome.", variant: "destructive" });
        return;
      }

      setScannerActive(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;

      // Wait for video element to be in DOM
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'codabar', 'code_93', 'upc_a', 'upc_e']
      });

      scanningRef.current = true;

      const detectLoop = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            console.log("Barcode lido:", code);
            setCodigoBarras(code);
            stopScanner();
            setTimeout(() => {
              document.getElementById("btn-scan-search")?.click();
            }, 300);
            return;
          }
        } catch (err) {
          console.error("Erro na detecção:", err);
        }

        if (scanningRef.current) {
          requestAnimationFrame(detectLoop);
        }
      };

      detectLoop();
    } catch (err) {
      console.error("Erro ao abrir câmera:", err);
      toast({ title: "Erro", description: "Não foi possível acessar a câmera.", variant: "destructive" });
      setScannerActive(false);
    }
  };

  useEffect(() => {
    return () => {
      scanningRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
      // Deduplicate by NUNOTA — Sankhya query can return duplicates due to JOINs (e.g. multiple vehicles)
      const rawPedidos = (pedidosRes.data || []) as PedidoData[];
      const seen = new Set<number>();
      const pedidosData = rawPedidos.filter((p) => {
        if (!p.NUNOTA || seen.has(p.NUNOTA)) return false;
        seen.add(p.NUNOTA);
        return true;
      });

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
          codparc: p.CODIGO_DO_CLIENTE,
          vlrnota: p.VALOR_NOTA,
          dtneg: (p as any).DTNEG || "",
          codvend: (p as any).CODVEND || 0,
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

      // Check for existing acerto for this OC
      const { data: existingAcerto } = await supabase
        .from("acertos")
        .select("id")
        .eq("numero_ordem_carga", ordem.numero)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAcerto) {
        // Load existing pedidos with canhotos
        setAcertoId(existingAcerto.id);

        const { data: existingPedidos } = await supabase
          .from("acerto_pedidos")
          .select("*")
          .eq("acerto_id", existingAcerto.id);

        if (existingPedidos && existingPedidos.length > 0) {
          // Merge existing data (canhotos, status, obs) into ordem
          ordem.pedidos = ordem.pedidos.map((p) => {
            const existing = existingPedidos.find((ep) => ep.numero_pedido === p.numero_pedido);
            if (existing) {
              return {
                ...p,
                id: existing.id,
                status_entrega: (existing.status_entrega as StatusEntrega) || p.status_entrega,
                observacao: existing.observacao || p.observacao,
                foto_canhoto_url: existing.foto_canhoto_url || undefined,
              };
            }
            return p;
          });
        }

        setOrdemCarga(ordem);
      } else {
        setOrdemCarga(ordem);

        // Create new acerto record
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
      nao_carregado: 9,
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
            // CRITICAL: Update the pedido object so the Sankhya upload filter picks it up
            pedido.foto_canhoto_url = fotoUrl;
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

      // Upload canhotos to Sankhya BEFORE navigating (to avoid request cancellation)
      const allPedidos = ordemCarga.pedidos.filter((p) => p.numero_pedido !== "Sem pedidos");
      console.log(`[Canhotos] Total pedidos: ${allPedidos.length}, com foto: ${allPedidos.filter(p => p.foto_canhoto_url).length}`);
      allPedidos.forEach((p) => {
        console.log(`[Canhotos] Pedido ${p.numero_pedido}: foto_url=${p.foto_canhoto_url || 'NENHUMA'}, codparc=${p.codparc}, codvend=${p.codvend}, dtneg=${p.dtneg}, vlrnota=${p.vlrnota}`);
      });

      const canhotosToUpload = allPedidos
        .filter((p) => p.foto_canhoto_url)
        .map((p) => ({
          nunota: parseInt(p.numero_pedido, 10),
          numnota: parseInt(p.numero_unico || "0", 10),
          storagePath: p.foto_canhoto_url!,
          codparc: p.codparc,
          vlrnota: p.vlrnota,
          dtneg: p.dtneg,
          codvend: p.codvend,
        }));

      console.log(`[Canhotos] Upload para Sankhya: ${canhotosToUpload.length} canhotos`, JSON.stringify(canhotosToUpload));

      if (canhotosToUpload.length > 0) {
        try {
          const result = await sankhya.migrateCanhotos(canhotosToUpload);
          if (result.success) {
            console.log(`[Canhotos] Enviados ao Sankhya com sucesso: ${canhotosToUpload.length} registros`);
          } else {
            console.error("[Canhotos] Erro ao enviar:", result.error);
          }
        } catch (err) {
          console.error("[Canhotos] Exceção ao enviar:", err);
        }
      } else {
        console.warn("[Canhotos] NENHUM canhoto para enviar ao Sankhya!");
      }

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
              {scannerActive && (
                <div className="w-full rounded-lg overflow-hidden bg-black">
                  <video
                    ref={videoRef}
                    className="w-full"
                    playsInline
                    muted
                    autoPlay
                    style={{ transform: "scaleX(1)" }}
                  />
                </div>
              )}
              
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
                            <p className="font-bold text-foreground">Pedido {pedido.numero_unico || pedido.numero_pedido}</p>
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
                      <div className="grid grid-cols-5 gap-1.5">
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
                      <div className="space-y-2">
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
                        {/* Show existing canhoto preview */}
                        {(pedido.foto_canhoto_url || pedido.fotoFile) && (
                          <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 border">
                            <img
                              src={pedido.fotoFile
                                ? URL.createObjectURL(pedido.fotoFile)
                                : supabase.storage.from("canhotos").getPublicUrl(pedido.foto_canhoto_url!).data.publicUrl
                              }
                              alt="Canhoto"
                              className="h-16 w-16 rounded-md object-cover border"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-success">Canhoto anexado ✓</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {pedido.fotoFile ? pedido.fotoFile.name : "Foto salva"}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRefs.current[index]?.click()}
                              className="text-xs shrink-0"
                            >
                              <Camera className="h-4 w-4 mr-1" />
                              Trocar
                            </Button>
                          </div>
                        )}
                        {!pedido.foto_canhoto_url && !pedido.fotoFile && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRefs.current[index]?.click()}
                            className="text-xs"
                          >
                            <Camera className="h-4 w-4 mr-1" />
                            Anexar Canhoto
                          </Button>
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
