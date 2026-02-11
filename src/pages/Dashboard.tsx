import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, LogOut, User, PackageX } from "lucide-react";
import FRLogo from "@/components/FRLogo";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header - FR branded dark navy */}
      <header className="bg-[hsl(220,35%,14%)] sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <FRLogo className="h-10 w-10" />
            <div>
              <h1 className="text-lg font-bold text-white">FR Distribuição</h1>
              <p className="text-xs text-[hsl(215,15%,65%)]">Acerto de Romaneio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-sm text-[hsl(215,15%,75%)] mr-2">
              <User className="h-4 w-4" />
              <span>Bem-vindo(a)</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              className="border-[hsl(220,30%,25%)] bg-transparent text-[hsl(215,15%,75%)] hover:bg-[hsl(220,30%,20%)] hover:text-white"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-foreground">Acerto de Romaneio</h2>
          <p className="text-muted-foreground mt-1">Selecione o tipo de checklist para iniciar o acerto.</p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 border-2 border-l-4 border-l-primary hover:border-primary/50 group"
            onClick={() => navigate("/acerto/entrega")}
          >
            <CardHeader className="pb-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <ClipboardCheck className="h-7 w-7 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-xl mb-2">Iniciar Acerto</CardTitle>
              <CardDescription>
                Escaneie a ordem de carga para iniciar o acerto de romaneio. Devoluções serão tratadas automaticamente.
              </CardDescription>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 border-2 border-l-4 border-l-destructive hover:border-destructive/50 group"
            onClick={() => navigate("/historico-devolucoes")}
          >
            <CardHeader className="pb-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 group-hover:bg-destructive/20 transition-colors">
                <PackageX className="h-7 w-7 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-xl mb-2">Histórico de Devoluções</CardTitle>
              <CardDescription>
                Visualize todas as devoluções registradas com detalhes completos do checklist.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
