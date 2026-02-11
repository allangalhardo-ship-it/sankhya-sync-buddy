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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Warehouse, Save, Loader2 } from "lucide-react";

export interface LogisticaData {
  responsavel: string;
  nf_entrada: string;
  nf_substituicao: string;
  ajuste_estoque: boolean;
  conferencia_nota_cega: boolean;
  numero_nota_cega: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: LogisticaData) => void;
  pedidoInfo: { numero_pedido: string; cliente_nome: string | null } | null;
  saving: boolean;
}

export default function ChecklistLogisticaDialog({
  open,
  onClose,
  onConfirm,
  pedidoInfo,
  saving,
}: Props) {
  const [form, setForm] = useState<LogisticaData>({
    responsavel: "",
    nf_entrada: "",
    nf_substituicao: "",
    ajuste_estoque: false,
    conferencia_nota_cega: false,
    numero_nota_cega: "",
  });

  const handleSubmit = () => {
    onConfirm(form);
    // Reset form after submit
    setForm({
      responsavel: "",
      nf_entrada: "",
      nf_substituicao: "",
      ajuste_estoque: false,
      conferencia_nota_cega: false,
      numero_nota_cega: "",
    });
  };

  if (!pedidoInfo) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            <DialogTitle>Checklist Logística — Sankhya/WMS</DialogTitle>
          </div>
          <DialogDescription>
            Preencha os dados de recebimento logístico para o pedido {pedidoInfo.numero_pedido}
            {pedidoInfo.cliente_nome ? ` — ${pedidoInfo.cliente_nome}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-4 pb-2">
            {/* Responsável */}
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Responsável</Label>
              <Input
                value={form.responsavel}
                onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))}
                placeholder="Nome do responsável"
              />
            </div>

            {/* NF Entrada / NF Substituição */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">NF Entrada</Label>
                <Input
                  value={form.nf_entrada}
                  onChange={(e) => setForm((f) => ({ ...f, nf_entrada: e.target.value }))}
                  placeholder="Nota fiscal de entrada"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">NF Substituição</Label>
                <Input
                  value={form.nf_substituicao}
                  onChange={(e) => setForm((f) => ({ ...f, nf_substituicao: e.target.value }))}
                  placeholder="Nota fiscal substituição"
                />
              </div>
            </div>

            {/* Ajuste do Estoque */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="ajuste_estoque"
                checked={form.ajuste_estoque}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, ajuste_estoque: checked === true }))
                }
              />
              <Label htmlFor="ajuste_estoque" className="text-sm font-semibold cursor-pointer">
                Ajuste do Estoque (Sankhya)
              </Label>
            </div>

            {/* Conferência via Nota Cega */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="conferencia_nota_cega"
                checked={form.conferencia_nota_cega}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, conferencia_nota_cega: checked === true }))
                }
              />
              <Label htmlFor="conferencia_nota_cega" className="text-sm font-semibold cursor-pointer">
                Conferência dos Produtos via Nota Cega e Armazenagem
              </Label>
            </div>

            {/* Número da Nota Cega */}
            {form.conferencia_nota_cega && (
              <div className="space-y-1 ml-7">
                <Label className="text-sm">Número da Nota Cega</Label>
                <Input
                  value={form.numero_nota_cega}
                  onChange={(e) => setForm((f) => ({ ...f, numero_nota_cega: e.target.value }))}
                  placeholder="Número da nota cega"
                />
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !form.responsavel.trim()}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Concluir Recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
