// Banco local de teste: Postgres do Supabase em Docker.
// Uso: node scripts/db-local.mjs up|test|down
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const NOME = "lola-pg";
const IMAGEM = "public.ecr.aws/supabase/postgres:17.11.0.004";
const raiz = process.cwd();
// Mínimo de casos que o roteiro rls-teste.sql deve imprimir; aumente quando o roteiro crescer.
const CASOS_MINIMOS = Number(process.env.CASOS_MINIMOS ?? 62);

function docker(args, opts = {}) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });
}

function psql(usuario, sql, { transacaoUnica = false } = {}) {
  const args = ["exec", "-i", NOME, "psql", "-U", usuario, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-A", "-F", "|"];
  if (transacaoUnica) args.push("-1");
  const r = spawnSync("docker", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { codigo: r.status, saida: (r.stdout || "") + (r.stderr || "") };
}

function subir() {
  try {
    docker(["info"]);
  } catch {
    console.error("Docker não encontrado ou parado; abra o Docker Desktop");
    process.exit(1);
  }
  const existe = docker(["ps", "-a", "--filter", `name=^${NOME}$`, "--format", "{{.Names}}"]).trim();
  if (!existe) {
    docker(["run", "-d", "--name", NOME, "-e", "POSTGRES_PASSWORD=postgres", "-p", "127.0.0.1:54329:5432", IMAGEM]);
  } else {
    spawnSync("docker", ["start", NOME]);
  }
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", NOME, "pg_isready", "-U", "supabase_admin", "-h", "localhost"]);
    if (r.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error("Postgres não ficou pronto");
}

function esperarInit() {
  // A imagem sobe um servidor temporário de init e reinicia: espera auth.users e os roles existirem.
  const q = (sql) => spawnSync("docker", ["exec", NOME, "psql", "-U", "supabase_admin", "-d", "postgres", "-Atc", sql], { encoding: "utf8" });
  for (let i = 0; i < 60; i++) {
    const a = q("select (to_regclass('auth.users') is not null)::text");
    const b = q("select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')");
    if (a.status === 0 && b.status === 0 && a.stdout.trim() === "true" && b.stdout.trim() === "3") return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  console.error("Init do Postgres não terminou em 120 s (auth.users/roles ausentes)");
  process.exit(1);
}

function aplicarSql(usuario, arquivo, opts) {
  const r = psql(usuario, readFileSync(arquivo, "utf8"), opts);
  if (r.codigo !== 0) {
    console.error(`FALHOU ${arquivo}\n${r.saida}`);
    process.exit(1);
  }
  return r.saida;
}

function testar() {
  subir();
  esperarInit();
  // shim exige dono de auth.users; reset e migrações rodam como postgres
  aplicarSql("supabase_admin", join(raiz, "supabase/local/01-shim-supabase.sql"));
  aplicarSql("postgres", join(raiz, "supabase/local/00-reset.sql"));
  const migracoes = readdirSync(join(raiz, "supabase/migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const m of migracoes) {
    aplicarSql("postgres", join(raiz, "supabase/migrations", m));
    console.log(`ok  ${m}`);
  }
  // Roteiro de isolamento: linhas "ok = f" que não estejam na lista esperada falham o teste.
  const esperadas = new Set((process.env.RLS_FALHAS_ESPERADAS ?? "").split(",").filter(Boolean).map(Number));
  const saida = aplicarSql("postgres", join(raiz, "supabase/rls-teste.sql"), { transacaoUnica: true });
  const linhas = saida.split("\n").map((l) => l.trim()).filter((l) => /\|(t|f)$/.test(l));
  const falhas = linhas.filter((l) => l.endsWith("|f")).map((l) => Number(l.split("|")[0]));
  if (linhas.length < CASOS_MINIMOS) {
    console.error(`rls-teste imprimiu ${linhas.length} casos; esperado ao menos ${CASOS_MINIMOS}. Roteiro vazio ou formato mudou.`);
    process.exit(1);
  }
  const inesperadas = falhas.filter((n) => !esperadas.has(n));
  console.log(`rls-teste: ${linhas.length - falhas.length}/${linhas.length} ok; falhas: [${falhas.join(",")}]`);
  if (inesperadas.length) {
    console.error(`FALHAS INESPERADAS: [${inesperadas.join(",")}]`);
    process.exit(1);
  }
  // Testes funcionais: cada arquivo levanta exceção se algo falhar.
  const dirTestes = join(raiz, "supabase/testes");
  if (existsSync(dirTestes)) {
    for (const t of readdirSync(dirTestes).filter((f) => f.endsWith(".sql")).sort()) {
      // Convenção: o arquivo termina com `raise exception 'TESTE_..._OK'` (desfaz tudo); qualquer outra saída é falha.
      const r = psql("postgres", readFileSync(join(dirTestes, t), "utf8"), { transacaoUnica: true });
      if (!/TESTE_[A-Z0-9_]+_OK/.test(r.saida)) {
        console.error(`FALHOU testes/${t}\n${r.saida}`);
        process.exit(1);
      }
      console.log(`ok  testes/${t}`);
    }
  }
}

const cmd = process.argv[2];
if (cmd === "up") { subir(); esperarInit(); }
else if (cmd === "down") spawnSync("docker", ["rm", "-f", NOME], { stdio: "inherit" });
else if (cmd === "test") testar();
else {
  console.error("uso: node scripts/db-local.mjs up|test|down");
  process.exit(2);
}
