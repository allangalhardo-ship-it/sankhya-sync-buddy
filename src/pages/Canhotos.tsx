import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Search, FileImage, Download, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CanhotoResult {
  id: string;
  numero_pedido: string;
  numero_unico: string | null;
  cliente_nome: string | null;
  foto_canhoto_url: string | null;
  status_entrega: string;
  acerto_id: string;
  numero_ordem_carga: string;
  created_at: string;
}

const Canhotos = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState<"nunota" | "numnota" | "oc">("nunota");
  const [results, setResults] = useState<CanhotoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast({ title: "Informe o valor para busca", variant: "destructive" });
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      let query = supabase
        .from("acerto_pedidos")
        .select("id, numero_pedido, numero_unico, cliente_nome, foto_canhoto_url, status_entrega, acerto_id, created_at, acertos!inner(numero_ordem_carga, status)")
        .not("foto_canhoto_url", "is", null)
        .eq("acertos.status", "finalizado");

      const term = searchTerm.trim();

      if (searchType === "nunota") {
        query = query.eq("numero_unico", term);
      } else if (searchType === "numnota") {
        query = query.eq("numero_pedido", term);
      } else {
        query = query.eq("acertos.numero_ordem_carga", term);
      }

      query = query.order("created_at", { ascending: false }).limit(50);

      const { data, error } = await query;

      if (error) throw error;

      const mapped: CanhotoResult[] = (data ?? []).map((item: any) => ({
        id: item.id,
        numero_pedido: item.numero_pedido,
        numero_unico: item.numero_unico,
        cliente_nome: item.cliente_nome,
        foto_canhoto_url: item.foto_canhoto_url,
        status_entrega: item.status_entrega,
        acerto_id: item.acerto_id,
        numero_ordem_carga: item.acertos?.numero_ordem_carga ?? "-",
        created_at: item.created_at,
      }));

      setResults(mapped);
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao buscar canhotos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from("canhotos").getPublicUrl(path);
    return data.publicUrl;
  };

  const extractPath = (url: string) => {
    // URL format: .../canhotos/<path>
    const match = url.match(/canhotos\/(.+)$/);
    return match ? match[1] : url;
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
            <h1 className="text-lg font-bold text-white">Canhotos - Financeiro</h1>
            <p className="text-xs text-[hsl(215,15%,65%)]">Comprovantes de acertos concluídos</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {([
                { value: "nunota" as const, label: "NUNOTA" },
                { value: "numnota" as const, label: "NUMNOTA" },
                { value: "oc" as const, label: "Ordem Carga" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSearchType(opt.value)}
                  className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
                    searchType === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Input
              placeholder={
                searchType === "nunota" ? "Nº Único (NUNOTA)" :
                searchType === "numnota" ? "Nº da Nota (NUMNOTA)" :
                "Nº Ordem de Carga"
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={loading} className="w-full">
              <Search className="h-4 w-4 mr-2" />
              {loading ? "Buscando..." : "Buscar"}
            </Button>
          </CardContent>
        </Card>

        {searched && (
          <p className="text-sm text-muted-foreground mb-3">
            {results.length} {results.length === 1 ? "resultado encontrado" : "resultados encontrados"}
          </p>
        )}

        <div className="space-y-3">
          {results.map((item) => {
            const publicUrl = item.foto_canhoto_url ? getPublicUrl(item.foto_canhoto_url) : null;
            return (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-4 flex items-center gap-4">
                <button
                  onClick={() => publicUrl && setPreviewUrl(publicUrl)}
                  className="flex-shrink-0 h-16 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
                >
                  {publicUrl ? (
                    <img
                      src={publicUrl}
                      alt="Canhoto"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileImage className="h-6 w-6 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">Pedido {item.numero_unico || item.numero_pedido}</p>
                  <p className="text-sm text-muted-foreground truncate">{item.cliente_nome || "Cliente não informado"}</p>
                  <p className="text-xs text-muted-foreground">OC: {item.numero_ordem_carga} • {new Date(item.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => publicUrl && window.open(publicUrl, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
            );
          })}
        </div>

        {searched && results.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FileImage className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Nenhum canhoto encontrado</p>
            <p className="text-sm mt-1">Tente buscar com outros filtros.</p>
          </div>
        )}
      </main>

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Canhoto</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <img src={previewUrl} alt="Canhoto" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Canhotos;
