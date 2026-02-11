import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  PackageX,
  Loader2,
  Truck,
  User,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface Devolucao {
  id: string;
  acerto_id: string;
  numero_pedido: string;
  cliente_nome: string | null;
  tipo_devolucao: string;
  agregado: string | null;
  nf_fr: string | null;
  nf_cliente: string | null;
  parceiro: string | null;
  vendedor: string | null;
  motivo: string | null;
  conferencia_produtos: string;
  desconta_taxa_vendedor: string;
  created_at: string;
}

interface AcertoComDevolucoes {
  id: string;
  numero_ordem_carga: string;
  motorista_nome: string | null;
  placa: string | null;
  finalizado_at: string | null;
  created_at: string;
  devolucoes: Devolucao[];
}

const HistoricoDevolucoes = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [acertos, setAcertos] = useState<AcertoComDevolucoes[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);

      // Fetch acertos that have devolucoes
      const { data: devolucoesData, error } = await supabase
        .from("acerto_devolucoes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao buscar devoluções:", error);
        setLoading(false);
        return;
      }

      if (!devolucoesData || devolucoesData.length === 0) {
        setAcertos([]);
        setLoading(false);
        return;
      }

      // Get unique acerto_ids
      const acertoIds = [...new Set(devolucoesData.map((d) => d.acerto_id))];

      const { data: acertosData, error: acertosError } = await supabase
        .from("acertos")
        .select("id, numero_ordem_carga, motorista_nome, placa, finalizado_at, created_at")
        .in("id", acertoIds)
        .order("created_at", { ascending: false });

      if (acertosError) {
        console.error("Erro ao buscar acertos:", acertosError);
        setLoading(false);
        return;
      }

      // Group devolucoes by acerto
      const grouped: AcertoComDevolucoes[] = (acertosData || []).map((acerto) => ({
        ...acerto,
        devolucoes: devolucoesData.filter((d) => d.acerto_id === acerto.id),
      }));

      setAcertos(grouped);
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
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
            <h1 className="text-lg font-bold text-white">Histórico de Devoluções</h1>
            <p className="text-xs text-[hsl(215,15%,65%)]">FR Distribuição</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : acertos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <PackageX className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground">Nenhuma devolução registrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                As devoluções aparecerão aqui após a finalização dos acertos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" className="space-y-3">
            {acertos.map((acerto) => (
              <AccordionItem key={acerto.id} value={acerto.id} className="border rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                  <div className="flex items-center gap-3 text-left flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                      <PackageX className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground">OC {acerto.numero_ordem_carga}</span>
                        <Badge variant="secondary" className="text-xs">
                          {acerto.devolucoes.length} devolução(ões)
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {acerto.motorista_nome && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {acerto.motorista_nome}
                          </span>
                        )}
                        {acerto.placa && (
                          <span className="flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            {acerto.placa}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(acerto.finalizado_at || acerto.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {acerto.devolucoes.map((dev) => (
                      <Card key={dev.id} className="border-destructive/20">
                        <CardHeader className="pb-2 pt-3 px-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">
                              <span className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                Pedido {dev.numero_pedido}
                              </span>
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className={
                                dev.tipo_devolucao === "total"
                                  ? "border-destructive text-destructive"
                                  : "border-warning text-warning"
                              }
                            >
                              {dev.tipo_devolucao === "total" ? "Total" : "Parcial"}
                            </Badge>
                          </div>
                          {dev.cliente_nome && (
                            <p className="text-xs text-muted-foreground">{dev.cliente_nome}</p>
                          )}
                        </CardHeader>
                        <CardContent className="px-4 pb-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            {dev.nf_fr && (
                              <div>
                                <span className="text-xs text-muted-foreground">NF FR</span>
                                <p className="font-medium text-foreground">{dev.nf_fr}</p>
                              </div>
                            )}
                            {dev.nf_cliente && (
                              <div>
                                <span className="text-xs text-muted-foreground">NF Cliente</span>
                                <p className="font-medium text-foreground">{dev.nf_cliente}</p>
                              </div>
                            )}
                            {dev.parceiro && (
                              <div>
                                <span className="text-xs text-muted-foreground">Parceiro</span>
                                <p className="font-medium text-foreground">{dev.parceiro}</p>
                              </div>
                            )}
                            {dev.vendedor && (
                              <div>
                                <span className="text-xs text-muted-foreground">Vendedor</span>
                                <p className="font-medium text-foreground">{dev.vendedor}</p>
                              </div>
                            )}
                            {dev.agregado && (
                              <div>
                                <span className="text-xs text-muted-foreground">Agregado</span>
                                <p className="font-medium text-foreground">{dev.agregado}</p>
                              </div>
                            )}
                            {dev.motivo && (
                              <div className="col-span-2">
                                <span className="text-xs text-muted-foreground">Motivo</span>
                                <p className="font-medium text-foreground">{dev.motivo}</p>
                              </div>
                            )}
                          </div>
                          <Separator className="my-2" />
                          <div className="flex gap-4 text-xs">
                            <span className="flex items-center gap-1">
                              {dev.conferencia_produtos === "sim" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                              )}
                              Conferência: {dev.conferencia_produtos === "sim" ? "Sim" : "Não"}
                            </span>
                            <span className="flex items-center gap-1">
                              {dev.desconta_taxa_vendedor === "sim" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                              )}
                              Desconta Taxa: {dev.desconta_taxa_vendedor === "sim" ? "Sim" : "Não"}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </main>
    </div>
  );
};

export default HistoricoDevolucoes;
