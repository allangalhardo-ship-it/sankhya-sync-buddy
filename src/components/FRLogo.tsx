import frLogo from "@/assets/fr-logo.jpeg";

const FRLogo = ({ className = "h-10 w-10" }: { className?: string }) => (
  <img src={frLogo} alt="FR Distribuição" className={className} />
);

export default FRLogo;
