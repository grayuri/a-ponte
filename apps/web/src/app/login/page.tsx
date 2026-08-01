import { FormularioLogin } from './formulario-login';

export const metadata = { title: 'Entrar — Rede Colheita' };

export default function PaginaLogin({
  searchParams,
}: {
  searchParams: { proximo?: string };
}) {
  return (
    <div className="login-tela">
      <div className="login-caixa">
        <div className="marca">
          <strong>Rede Colheita</strong>
          <span>Projeto Colheita · A Ponte</span>
        </div>

        <FormularioLogin proximo={searchParams.proximo ?? '/'} />

        <p className="dica" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          Esqueceu a senha? Fale com a coordenação do projeto.
        </p>
      </div>
    </div>
  );
}
