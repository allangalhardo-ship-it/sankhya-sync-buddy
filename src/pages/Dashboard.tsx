import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, PackageX, Truck, LogOut, User } from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Truck className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">FR Romaneio</h1>
              <p className="text-xs text-muted-foreground">Acerto de Ordem de Carga</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground mr-2">
              <User className="h-4 w-4" />
              <span>{user?.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">Olá, bem-vindo!</h2>
          <p className="text-muted-foreground mt-1">Selecione o tipo de checklist para iniciar o acerto.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 max-w-2xl">
          {/* Checklist de Entrega */}
          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 border-2 hover:border-success/50 group"
            onClick={() => navigate("/acerto/entrega")}
          >
            <CardHeader className="pb-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 group-hover:bg-success/20 transition-colors">
                <ClipboardCheck className="h-7 w-7 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-xl mb-2">Checklist de Entrega</CardTitle>
              <CardDescription>
                Registre as entregas realizadas, devoluções e reentregas do romaneio.
              </CardDescription>
            </CardContent>
          </Card>

          {/* Checklist de Devolução */}
          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 border-2 hover:border-warning/50 group"
            onClick={() => navigate("/acerto/devolucao")}
          >
            <CardHeader className="pb-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 group-hover:bg-warning/20 transition-colors">
                <PackageX className="h-7 w-7 text-warning" />
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-xl mb-2">Checklist de Devolução</CardTitle>
              <CardDescription>
                Confira e registre os produtos devolvidos do romaneio.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
