import { useState } from "react";
import { sankhya, SankhyaResponse } from "@/lib/sankhya";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Zap, Database, Users, Package, ShoppingCart, Building2 } from "lucide-react";

type ConnectionStatus = "idle" | "testing" | "success" | "error";

const Index = () => {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [result, setResult] = useState<SankhyaResponse | null>(null);
  const [apiResult, setApiResult] = useState<SankhyaResponse | null>(null);
  const [loadingEndpoint, setLoadingEndpoint] = useState<string | null>(null);

  const handleTestConnection = async () => {
    setStatus("testing");
    setResult(null);
    try {
      const res = await sankhya.testConnection();
      setResult(res);
      setStatus(res.success ? "success" : "error");
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : "Erro desconhecido" });
      setStatus("error");
    }
  };

  const handleApiCall = async (label: string, fn: () => Promise<SankhyaResponse>) => {
    setLoadingEndpoint(label);
    setApiResult(null);
    try {
      const res = await fn();
      setApiResult(res);
    } catch (err) {
      setApiResult({ success: false, error: err instanceof Error ? err.message : "Erro desconhecido" });
    } finally {
      setLoadingEndpoint(null);
    }
  };

  const endpoints = [
    { label: "Empresas", icon: Building2, fn: () => sankhya.getEmpresas() },
    { label: "Clientes", icon: Users, fn: () => sankhya.getClientes() },
    { label: "Produtos", icon: Package, fn: () => sankhya.getProdutos() },
    { label: "Pedidos", icon: ShoppingCart, fn: () => sankhya.getPedidos() },
    { label: "Vendedores", icon: Users, fn: () => sankhya.getVendedores() },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Sankhya Connect</h1>
              <p className="text-xs text-muted-foreground">Integração ERP</p>
            </div>
          </div>
          <Badge
            variant={status === "success" ? "default" : status === "error" ? "destructive" : "secondary"}
            className={status === "success" ? "bg-success text-success-foreground" : ""}
          >
            {status === "idle" && "Desconectado"}
            {status === "testing" && "Testando..."}
            {status === "success" && "Conectado"}
            {status === "error" && "Erro"}
          </Badge>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Connection Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Teste de Conexão
            </CardTitle>
            <CardDescription>
              Verifique se a autenticação OAuth 2.0 com o Sankhya está funcionando corretamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleTestConnection} disabled={status === "testing"} size="lg">
              {status === "testing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {status === "success" && <CheckCircle2 className="mr-2 h-4 w-4" />}
              {status === "error" && <XCircle className="mr-2 h-4 w-4" />}
              {status === "testing" ? "Testando..." : "Testar Conexão"}
            </Button>

            {result && (
              <div
                className={`rounded-lg border p-4 ${
                  result.success
                    ? "border-success/30 bg-success/5 text-foreground"
                    : "border-destructive/30 bg-destructive/5 text-foreground"
                }`}
              >
                <p className="font-medium">
                  {result.success ? "✅ " + (result.message || "Conexão estabelecida!") : "❌ " + result.error}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Endpoints */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Endpoints da API
            </CardTitle>
            <CardDescription>
              Teste chamadas à API Sankhya. Conecte-se primeiro usando o botão acima.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {endpoints.map(({ label, icon: Icon, fn }) => (
                <Button
                  key={label}
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-auto py-4"
                  disabled={status !== "success" || loadingEndpoint !== null}
                  onClick={() => handleApiCall(label, fn)}
                >
                  {loadingEndpoint === label ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <Icon className="h-5 w-5 text-primary" />
                  )}
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>

            {apiResult && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Resposta da API</span>
                  <Badge variant={apiResult.success ? "default" : "destructive"}>
                    {apiResult.success ? `Status ${apiResult.status || 200}` : "Erro"}
                  </Badge>
                </div>
                <pre className="max-h-80 overflow-auto rounded-md bg-card p-3 text-xs text-foreground">
                  {JSON.stringify(apiResult.data || apiResult.error, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
