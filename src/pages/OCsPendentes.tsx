import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { sankhya } from "@/lib/sankhya";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Truck, Package, Users, MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface OCData {
  ORDEMCARGA: number;
  MOTORISTA: string;
  CODPARC: number;
  AD_DATAHORASADA: string;
  DATAAT: string;
  NOMEREG: string;
  VALOR: number;
  QTDPEDIDO: number;
  QTDCLI: number;
  TIPVEI: string;
  AD_NROTA: string;
}

const OCsPendentes = () => {
  const navigate = useNavigate();
  const [ocs, setOcs] = useState<OCData[]>([]);
  const [acertosFinalizados, setAcertosFinalizados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sankhyaResult, acertosResult] = await Promise.all([
        sankhya.getOCsPendentes(),
        supabase
          .from("acertos")
          .select("numero_ordem_carga")
          .eq("status", "finalizado"),
      ]);

      if (!sankhyaResult.success) {
        toast({ title: "Erro ao buscar OCs do Sankhya", description: sankhyaResult.error, variant: "destructive" });
        return;
      }

      const finalizados = new Set((acertosResult.data ?? []).map((a) => a.numero_ordem_carga));
      setAcertosFinalizados(finalizados);

      const pendentes = (sankhyaResult.data ?? []).filter(
        (oc) => !finalizados.has(String(oc.ORDEMCARGA))
      );
      setOcs(pendentes);
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao carregar dados", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);

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
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">OCs Pendentes de Acerto</h1>
            <p className="text-xs text-[hsl(215,15%,65%)]">Ordens de carga a partir de Março/2026</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchData}
            disabled={loading}
            className="text-[hsl(215,15%,75%)] hover:bg-[hsl(220,30%,20%)] hover:text-white"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : ocs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Nenhuma OC pendente</p>
            <p className="text-sm mt-1">Todas as ordens de carga foram acertadas.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {ocs.length} {ocs.length === 1 ? "ordem pendente" : "ordens pendentes"}
            </p>
            <div className="space-y-3">
              {ocs.map((oc) => (
                <Card
                  key={oc.ORDEMCARGA}
                  className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-warning"
                  onClick={() => navigate("/acerto/entrega")}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold text-foreground text-lg">OC {oc.ORDEMCARGA}</p>
                        <p className="text-sm text-muted-foreground">{oc.MOTORISTA || "Motorista não informado"}</p>
                      </div>
                      <Badge variant="outline" className="text-warning border-warning">
                        Pendente
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{oc.NOMEREG || "-"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5" />
                        <span>{oc.TIPVEI || "-"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        <span>{oc.QTDPEDIDO} pedidos</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        <span>{oc.QTDCLI} clientes</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <span className="text-xs text-muted-foreground">
                        Saída: {oc.AD_DATAHORASADA || oc.DATAAT || "-"}
                      </span>
                      <span className="font-semibold text-foreground">{formatCurrency(oc.VALOR)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default OCsPendentes;
