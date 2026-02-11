import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PackageX, Send, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export interface DevolucaoInfo {
  nunota: string;
  cliente_nome: string;
  tipo_devolucao: "parcial" | "total";
  agregado: string;
  nf_fr: string;
  nf_cliente: string;
  parceiro: string;
  vendedor: string;
  motivo: string;
  conferencia_produtos: "sim" | "nao";
  desconta_taxa_vendedor: "sim" | "nao";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (devolucoes: DevolucaoInfo[]) => void;
  pedidosDevolvidos: { numero_pedido: string; cliente_nome: string; nf_fr?: string; parceiro?: string; vendedor?: string }[];
  motorista: string;
  saving: boolean;
}

const emptyDevolucao = (nunota: string, cliente: string, nf_fr?: string, parceiro?: string, agregado?: string, vendedor?: string): DevolucaoInfo => ({
  nunota,
  cliente_nome: cliente,
  tipo_devolucao: "total",
  agregado: agregado || "",
  nf_fr: nf_fr || "",
  nf_cliente: "",
  parceiro: parceiro || "",
  vendedor: vendedor || "",
  motivo: "",
  conferencia_produtos: "sim",
  desconta_taxa_vendedor: "nao",
});

export default function ChecklistDevolucaoDialog({
  open,
  onClose,
  onConfirm,
  pedidosDevolvidos,
  motorista,
  saving,
}: Props) {
  const [devolucoes, setDevolucoes] = useState<DevolucaoInfo[]>(() =>
    pedidosDevolvidos.map((p) => emptyDevolucao(p.numero_pedido, p.cliente_nome, p.nf_fr, p.parceiro, motorista, p.vendedor))
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset state when pedidos change
  const resetIfNeeded = () => {
    if (devolucoes.length !== pedidosDevolvidos.length) {
      setDevolucoes(pedidosDevolvidos.map((p) => emptyDevolucao(p.numero_pedido, p.cliente_nome, p.nf_fr, p.parceiro, motorista, p.vendedor)));
      setCurrentIndex(0);
    }
  };

  // Call on open
  if (open && devolucoes.length !== pedidosDevolvidos.length) {
    resetIfNeeded();
  }

  const current = devolucoes[currentIndex];
  if (!current) return null;

  const updateField = <K extends keyof DevolucaoInfo>(field: K, value: DevolucaoInfo[K]) => {
    setDevolucoes((prev) => {
      const copy = [...prev];
      copy[currentIndex] = { ...copy[currentIndex], [field]: value };
      return copy;
    });
  };

  const isLast = currentIndex === devolucoes.length - 1;
  const isFirst = currentIndex === 0;

  const handleSubmit = () => {
    if (isLast) {
      onConfirm(devolucoes);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-destructive" />
            <DialogTitle>Checklist de Devolução</DialogTitle>
          </div>
          <DialogDescription>
            Preencha os dados da devolução para cada pedido devolvido.
          </DialogDescription>
        </DialogHeader>

        {devolucoes.length > 1 && (
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              Pedido {currentIndex + 1} de {devolucoes.length}
            </Badge>
            <p className="text-sm font-medium text-foreground">
              NF {current.nunota} — {current.cliente_nome}
            </p>
          </div>
        )}

        {devolucoes.length === 1 && (
          <p className="text-sm font-medium text-foreground">
            NF {current.nunota} — {current.cliente_nome}
          </p>
        )}

        <Separator />

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-4 pb-2">
            {/* Tipo de Devolução */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tipo de Devolução</Label>
              <RadioGroup
                value={current.tipo_devolucao}
                onValueChange={(v) => updateField("tipo_devolucao", v as "parcial" | "total")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="parcial" id="parcial" />
                  <Label htmlFor="parcial">Parcial</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="total" id="total" />
                  <Label htmlFor="total">Total</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Agregado */}
            <div className="space-y-1">
              <Label className="text-sm">Agregado</Label>
              <Input
                value={current.agregado}
                onChange={(e) => updateField("agregado", e.target.value)}
                placeholder="Nome do agregado"
                readOnly={!!motorista}
                className={motorista ? "bg-muted" : ""}
              />
            </div>

            {/* NF FR / NF Cliente */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">NF FR</Label>
                <Input
                  value={current.nf_fr}
                  onChange={(e) => updateField("nf_fr", e.target.value)}
                  placeholder="Nota fiscal FR"
                  readOnly={!!pedidosDevolvidos[currentIndex]?.nf_fr}
                  className={pedidosDevolvidos[currentIndex]?.nf_fr ? "bg-muted" : ""}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">NF Cliente</Label>
                <Input
                  value={current.nf_cliente}
                  onChange={(e) => updateField("nf_cliente", e.target.value)}
                  placeholder="Nota fiscal cliente"
                />
              </div>
            </div>

            {/* Parceiro / Vendedor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Parceiro</Label>
                <Input
                  value={current.parceiro}
                  onChange={(e) => updateField("parceiro", e.target.value)}
                  placeholder="Nome do parceiro"
                  readOnly={!!pedidosDevolvidos[currentIndex]?.parceiro}
                  className={pedidosDevolvidos[currentIndex]?.parceiro ? "bg-muted" : ""}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Vendedor</Label>
                <Input
                  value={current.vendedor}
                  onChange={(e) => updateField("vendedor", e.target.value)}
                  placeholder="Nome do vendedor"
                  readOnly={!!pedidosDevolvidos[currentIndex]?.vendedor}
                  className={pedidosDevolvidos[currentIndex]?.vendedor ? "bg-muted" : ""}
                />
              </div>
            </div>

            {/* Motivo */}
            <div className="space-y-1">
              <Label className="text-sm">Motivo da Devolução</Label>
              <Textarea
                value={current.motivo}
                onChange={(e) => updateField("motivo", e.target.value)}
                placeholder="Descreva o motivo da devolução"
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Conferência dos Produtos */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Conferência dos Produtos</Label>
              <RadioGroup
                value={current.conferencia_produtos}
                onValueChange={(v) => updateField("conferencia_produtos", v as "sim" | "nao")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sim" id="conf-sim" />
                  <Label htmlFor="conf-sim">Sim</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nao" id="conf-nao" />
                  <Label htmlFor="conf-nao">Não</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Desconta Taxa do Vendedor */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Desconta Taxa do Vendedor</Label>
              <RadioGroup
                value={current.desconta_taxa_vendedor}
                onValueChange={(v) => updateField("desconta_taxa_vendedor", v as "sim" | "nao")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sim" id="taxa-sim" />
                  <Label htmlFor="taxa-sim">Sim</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nao" id="taxa-nao" />
                  <Label htmlFor="taxa-nao">Não</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          {!isFirst && (
            <Button variant="outline" onClick={() => setCurrentIndex((i) => i - 1)} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={saving} className="flex-1">
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isLast ? (
              <Send className="mr-2 h-4 w-4" />
            ) : (
              <ChevronRight className="mr-2 h-4 w-4" />
            )}
            {isLast ? "Finalizar Acerto" : "Próximo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
