import { cnpjValido, emailValido, mascararCnpj, mascararWhatsapp } from "@/lib/validators";

export type Modo = "entrar" | "cadastro" | "revendedor" | "esqueci";

export type Campo = {
  nome: string;
  rotulo: string;
  tipo: "text" | "email" | "password" | "tel";
  placeholder: string;
  autoComplete: string;
  mono?: boolean;
  inputMode?: "numeric" | "tel" | "email";
};

export const SENHA_MIN = 8;

export const CAMPOS: Record<Modo, Campo[]> = {
  entrar: [
    { nome: "email", rotulo: "E-mail", tipo: "email", placeholder: "voce@email.com", autoComplete: "email", inputMode: "email" },
    { nome: "senha", rotulo: "Senha", tipo: "password", placeholder: "••••••••", autoComplete: "current-password" },
  ],
  cadastro: [
    { nome: "nome", rotulo: "Nome completo", tipo: "text", placeholder: "Como você se chama?", autoComplete: "name" },
    { nome: "email", rotulo: "E-mail", tipo: "email", placeholder: "voce@email.com", autoComplete: "email", inputMode: "email" },
    { nome: "senha", rotulo: "Crie uma senha", tipo: "password", placeholder: "Mínimo 8 caracteres", autoComplete: "new-password" },
  ],
  revendedor: [
    { nome: "razao_social", rotulo: "Nome da loja / razão social", tipo: "text", placeholder: "Ex.: Bela Vitrine Calçados", autoComplete: "organization" },
    { nome: "cnpj", rotulo: "CNPJ", tipo: "text", placeholder: "00.000.000/0000-00", autoComplete: "off", mono: true, inputMode: "numeric" },
    { nome: "nome", rotulo: "Seu nome", tipo: "text", placeholder: "Responsável pela conta", autoComplete: "name" },
    { nome: "email", rotulo: "E-mail", tipo: "email", placeholder: "loja@email.com", autoComplete: "email", inputMode: "email" },
    { nome: "whatsapp", rotulo: "WhatsApp", tipo: "tel", placeholder: "(00) 00000-0000", autoComplete: "tel", mono: true, inputMode: "tel" },
    { nome: "senha", rotulo: "Crie uma senha", tipo: "password", placeholder: "Mínimo 8 caracteres", autoComplete: "new-password" },
  ],
  esqueci: [
    { nome: "email", rotulo: "E-mail da conta", tipo: "email", placeholder: "voce@email.com", autoComplete: "email", inputMode: "email" },
  ],
};

export const COPY: Record<Modo, { titulo: string; subtitulo: string; botao: string }> = {
  entrar: { titulo: "Oi de novo.", subtitulo: "Entre na sua conta LOLA.", botao: "Entrar" },
  cadastro: { titulo: "Crie sua conta.", subtitulo: "Acompanhe pedidos e salve seus favoritos.", botao: "Criar conta" },
  revendedor: {
    titulo: "Seja revendedor.",
    subtitulo: "Preço de atacado a partir de 12 modelos diferentes.",
    botao: "Enviar solicitação",
  },
  esqueci: {
    titulo: "Esqueceu a senha?",
    subtitulo: "Enviamos um link para você criar uma nova.",
    botao: "Enviar link",
  },
};

const MODOS: Modo[] = ["entrar", "cadastro", "revendedor", "esqueci"];

export function normalizarModo(valor: string | string[] | undefined, varejoAtivo: boolean = true): Modo {
  const modo: Modo =
    typeof valor === "string" && (MODOS as string[]).includes(valor) ? (valor as Modo) : "entrar";
  // Sem varejo não existe conta de cliente: o cadastro cai no de revendedora.
  return modo === "cadastro" && !varejoAtivo ? "revendedor" : modo;
}

/** Abas do topo do login: cadastro de cliente só com varejo ligado; sem ele, o cadastro de revendedora ocupa a vaga. */
export function abasLogin(varejoAtivo: boolean): { modo: Modo; rotulo: string }[] {
  return [
    { modo: "entrar", rotulo: "Entrar" },
    varejoAtivo
      ? { modo: "cadastro", rotulo: "Criar conta" }
      : { modo: "revendedor", rotulo: "Seja revendedora" },
  ];
}

export function aplicarMascara(nome: string, valor: string): string {
  if (nome === "cnpj") return mascararCnpj(valor);
  if (nome === "whatsapp") return mascararWhatsapp(valor);
  return valor;
}

const MSG_SENHA_CURTA = `A senha precisa ter ao menos ${SENHA_MIN} caracteres.`;

export type Diagnostico = { campo: string; mensagem: string };

export function diagnosticarFormulario(
  modo: Modo,
  valores: Record<string, string | undefined>
): Diagnostico | null {
  const v = (nome: string) => (valores[nome] ?? "").trim();
  const vazio = CAMPOS[modo].find((c) => !v(c.nome));
  if (vazio) return { campo: vazio.nome, mensagem: "Preencha todos os campos." };
  if (!emailValido(v("email"))) return { campo: "email", mensagem: "Confira o e-mail." };
  if (modo === "revendedor") {
    if (!cnpjValido(v("cnpj"))) return { campo: "cnpj", mensagem: "Confira o CNPJ." };
    const tel = v("whatsapp").replace(/\D/g, "");
    if (tel.length !== 10 && tel.length !== 11) {
      return { campo: "whatsapp", mensagem: "WhatsApp inválido. Use DDD + número." };
    }
  }
  if ((modo === "cadastro" || modo === "revendedor") && (valores.senha ?? "").length < SENHA_MIN) {
    return { campo: "senha", mensagem: MSG_SENHA_CURTA };
  }
  return null;
}

export function validarFormulario(modo: Modo, valores: Record<string, string | undefined>): string | null {
  return diagnosticarFormulario(modo, valores)?.mensagem ?? null;
}

export function diagnosticarNovaSenha(senha: string, confirmar: string): Diagnostico | null {
  if (!senha) return { campo: "senha", mensagem: "Preencha todos os campos." };
  if (!confirmar) return { campo: "confirmar", mensagem: "Preencha todos os campos." };
  if (senha.length < SENHA_MIN) return { campo: "senha", mensagem: MSG_SENHA_CURTA };
  if (senha !== confirmar) return { campo: "confirmar", mensagem: "As senhas não conferem." };
  return null;
}

export function validarNovaSenha(senha: string, confirmar: string): string | null {
  return diagnosticarNovaSenha(senha, confirmar)?.mensagem ?? null;
}
