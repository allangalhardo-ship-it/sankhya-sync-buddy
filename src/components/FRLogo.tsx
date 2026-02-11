import frLogo from "@/assets/fr-logo.jpeg";

const FRLogo = ({ className = "h-10 w-10" }: { className?: string }) => (
  <div className={`${className} rounded-lg overflow-hidden bg-white flex items-center justify-center p-0.5`}>
    <img src={frLogo} alt="FR Distribuição" className="h-full w-full object-contain" />
  </div>
);

export default FRLogo;
