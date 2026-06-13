import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="mb-2 text-4xl font-bold">404</h1>
        <p className="mb-6 text-muted-foreground">Página não encontrada.</p>
        <Link to="/" className={buttonVariants()}>Voltar ao início</Link>
      </div>
    </div>
  );
}
