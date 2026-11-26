"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product, Categoria, Order, Sale, EstoqueBaixoItem, Revendedor } from "@/lib/types";
import type { Papel } from "@/lib/roles";
import { podeAprovarRevendedor } from "@/lib/roles";
import { camposPrecoEditaveis, precoProdutoEditavel, podeExecutar, screenPermitida, screensVisiveis } from "@/lib/admin-acesso";
import type { ConfigAdmin } from "@/lib/admin-config";
import { sairAction } from "@/app/entrar/actions";
import {
  fetchProducts,
  fetchCategorias,
  fetchOrders,
  fetchSales,
  fetchConfig,
  deleteProduct,
  setAtivo,
  setDesconto,
  setSurpresa,
  fetchRevendedores,
  setRevendedorStatus,
  setDestaque,
  fetchEstoqueBaixo,
} from "@/app/admin/actions";
import ProductEditor from "./ProductEditor";
import CategoriasTab from "./CategoriasTab";
import PedidosTab from "./PedidosTab";
import SalesTab from "./SalesTab";
import VendasLeituraTab from "./VendasLeituraTab";
import ConfigTab from "./ConfigTab";
import AdminSidebar, { type AdminScreen } from "./AdminSidebar";
import VisaoGeralTab from "./VisaoGeralTab";
import RevendedoresTab from "./RevendedoresTab";
import ProdutosTab from "./ProdutosTab";
import TextosTab from "./TextosTab";
import PromocoesTab from "./PromocoesTab";
import UsuariosTab from "./UsuariosTab";
import BannerTab from "./BannerTab";
import Toast, { useToast } from "./Toast";

type Filtro = "todos" | "varejo" | "atacado";

type Config = ConfigAdmin | null;

const SCREEN_TITLES: Record<AdminScreen, [string, string]> = {
  "visao-geral": ["Visão geral", "Acompanhe o desempenho da loja em tempo real"],
  pedidos: ["Pedidos", "Todos os pedidos de varejo e atacado"],
  vendas: ["Vendas", "Lista de vendas, somente leitura"],
  produtos: ["Produtos", "Cadastro, visibilidade, destaque, desconto e bônus"],
  financeiro: ["Financeiro", "Receita, repasses e lançamentos"],
  promocoes: ["Promoções", "Descontos por categoria, período e cupom"],
  revendedores: ["Revendedores", "Cadastros e solicitações de atacado"],
  usuarios: ["Usuários", "Papéis, acessos e convites da equipe"],
  banner: ["Banner do hero", "O destaque principal da home da vitrine"],
  textos: ["Textos da loja", "Avisos, rodapé e chamadas da vitrine"],
};

export default function AdminApp({
  perfil,
  initialProducts,
  initialCategorias,
  initialOrders,
  initialSales,
  initialConfig,
  initialEstoqueBaixo,
}: {
  perfil: { id: string; nome: string; papel: Papel };
  initialProducts: Product[];
  initialCategorias: Categoria[];
  initialOrders: Order[];
  initialSales: Sale[];
  initialConfig: Config;
  initialEstoqueBaixo: EstoqueBaixoItem[];
}) {
  const router = useRouter();
  const papel = perfil.papel;
  const screens = screensVisiveis(papel);
  const podeAprovar = podeAprovarRevendedor(papel);
  const ehSuperadmin = podeExecutar(papel, "config");
  // Quem não edita preço (supervisor) também não vê receita nem valores de pedido; o KPI de estoque
  // baixo dele vem do banco (admin_estoque_baixo), os demais calculam a partir dos produtos.
  const podeEditarPreco = camposPrecoEditaveis(papel);
  const semValores = !podeEditarPreco;
  // Preço cheio do produto: equipe toda. O resto (financeiro, atacado próprio, desconto) segue só com admin.
  const podePrecoProduto = precoProdutoEditavel(papel);
  const podeExcluir = podeExecutar(papel, "exclusao");
  const [screenEscolhida, setScreen] = useState<AdminScreen>("visao-geral");
  const screen = screenPermitida(papel, screenEscolhida) ?? "visao-geral";
  const [estoqueBaixo, setEstoqueBaixo] = useState(initialEstoqueBaixo);
  const [produtosSubTab, setProdutosSubTab] = useState<"produtos" | "categorias">("produtos");
  const [configOpen, setConfigOpen] = useState(false);
  const { mensagem: mensagemToast, mostrar: mostrarToast } = useToast();
  const [revendedores, setRevendedores] = useState<Revendedor[]>([]);

  const [products, setProducts] = useState(initialProducts);
  const [categorias, setCategorias] = useState(initialCategorias);
  const [orders, setOrders] = useState(initialOrders);
  const [sales, setSales] = useState(initialSales);
  const [config, setConfig] = useState<Config>(initialConfig);
  const [orderFiltro, setOrderFiltro] = useState<Filtro>("todos");
  const [salesFiltro, setSalesFiltro] = useState<Filtro>("todos");

  // Estado da aba Produtos
  // editingId: id do produto em edição, "novo" (sentinela p/ editor vazio) ou null (lista).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [descontoOpenId, setDescontoOpenId] = useState<string | null>(null);
  const [descontoInput, setDescontoInput] = useState("");

  async function refreshProducts(list?: Product[]) {
    setProducts(list ?? (await fetchProducts()));
  }
  async function refreshCategorias() {
    setCategorias(await fetchCategorias());
  }
  async function refreshOrders() {
    setOrders(await fetchOrders(orderFiltro));
  }
  async function refreshSales() {
    setSales(await fetchSales(salesFiltro));
  }
  async function handleOrderFiltro(f: Filtro) {
    setOrderFiltro(f);
    setOrders(await fetchOrders(f));
  }
  async function handleSalesFiltro(f: Filtro) {
    setSalesFiltro(f);
    setSales(await fetchSales(f));
  }
  async function refreshConfig() {
    setConfig(await fetchConfig());
  }
  async function refreshRevendedores(status: string = "todos") {
    setRevendedores(await fetchRevendedores(status));
  }

  async function refreshEstoqueBaixo() {
    setEstoqueBaixo(await fetchEstoqueBaixo());
  }
  async function handleRevendedorStatus(id: string, status: "aprovado" | "recusado") {
    const { error } = await setRevendedorStatus(id, status);
    mostrarToast(error ?? (status === "aprovado" ? "Revendedor aprovado." : "Revendedor recusado."));
    await refreshRevendedores();
  }

  // Recarrega ao abrir o painel e ao trocar de tela, e a cada minuto com a aba visível,
  // para novos cadastros de revendedor aparecerem sem recarregar a página.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados do servidor
    refreshRevendedores();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refreshRevendedores();
    }, 60_000);
    return () => clearInterval(t);
  }, [screen]);

  async function handleLogout() {
    await sairAction();
    router.replace("/entrar");
    router.refresh();
  }

  // --- Ações rápidas de produto ---------------------------------------------
  async function handleToggleAtivo(p: Product) {
    setBusyId(p.id);
    const { error } = await setAtivo(p.id, !p.ativo);
    if (error) alert(`Não deu pra atualizar a visibilidade: ${error}`);
    await refreshProducts();
    setBusyId(null);
  }

  async function handleToggleSurpresa(p: Product) {
    setBusyId(p.id);
    const { error } = await setSurpresa(p.id, !p.surpresa_ativo);
    if (error) alert(`Não deu pra atualizar a Live Surpresa: ${error}`);
    await refreshProducts();
    setBusyId(null);
  }

  async function handleDelete(p: Product) {
    if (
      !confirm(`Excluir "${p.nome}"? Isso apaga cores e tamanhos também.`)
    )
      return;
    setBusyId(p.id);
    const { error } = await deleteProduct(p.id);
    if (error) alert(`Não deu pra excluir: ${error}`);
    await refreshProducts();
    setBusyId(null);
  }

  function toggleDescontoRow(p: Product) {
    if (descontoOpenId === p.id) {
      setDescontoOpenId(null);
      return;
    }
    setDescontoOpenId(p.id);
    setDescontoInput(
      p.desconto_percentual != null ? String(p.desconto_percentual) : ""
    );
  }

  async function handleSalvarDesconto(id: string) {
    const raw = descontoInput.trim();
    let pct: number | null = null;
    if (raw) {
      pct = parseInt(raw, 10);
      if (isNaN(pct) || pct < 1 || pct > 99) {
        alert("O desconto deve ser um número entre 1 e 99.");
        return;
      }
    }
    setBusyId(id);
    const { error } = await setDesconto(id, pct);
    if (error) alert(`Não deu pra salvar o desconto: ${error}`);
    await refreshProducts();
    setBusyId(null);
    setDescontoOpenId(null);
  }

  // Limpa o desconto direto — não depende de setState no mesmo tick.
  async function handleRemoverDesconto(id: string) {
    setBusyId(id);
    const { error } = await setDesconto(id, null);
    if (error) alert(`Não deu pra remover o desconto: ${error}`);
    else await refreshProducts();
    setBusyId(null);
    setDescontoOpenId(null);
  }

  const produtoEmEdicao =
    editingId === "novo"
      ? null
      : products.find((p) => p.id === editingId) ?? null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <AdminSidebar
        screen={screen}
        screens={screens}
        perfil={perfil}
        onNavigate={setScreen}
        onOpenConfig={ehSuperadmin ? () => setConfigOpen(true) : undefined}
        onLogout={handleLogout}
        pendingRevendedores={revendedores.filter((r) => r.status === "pendente").length}
      />
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 32px",
            borderBottom: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{SCREEN_TITLES[screen][0]}</div>
            <div style={{ fontSize: 13, color: "var(--adm-text-secondary)", marginTop: 2 }}>
              {SCREEN_TITLES[screen][1]}
            </div>
          </div>
          <a href="/" target="_blank" style={{ fontSize: 12, color: "var(--adm-text-secondary)" }}>
            Ver site ↗
          </a>
        </header>
        <section style={{ flex: 1, padding: "28px 32px 40px", overflow: "auto" }}>
          {screen === "visao-geral" && (
            <VisaoGeralTab
              products={products}
              orders={orders}
              sales={sales}
              semReceita={semValores}
              estoqueBaixoServidor={semValores ? estoqueBaixo : undefined}
              revendedoresPendentes={revendedores
                .filter((r) => r.status === "pendente")
                .slice(0, 3)
                .map((r) => ({ id: r.id, nome: r.razao_social, cidade: r.cidade }))}
              onAprovar={podeAprovar ? (id) => handleRevendedorStatus(id, "aprovado") : undefined}
              onRecusar={podeAprovar ? (id) => handleRevendedorStatus(id, "recusado") : undefined}
              onGoPedidos={() => setScreen("pedidos")}
              onGoProdutos={screens.includes("produtos") ? () => setScreen("produtos") : undefined}
              onGoRevendedores={() => setScreen("revendedores")}
            />
          )}
          {screen === "pedidos" && (
            <PedidosTab
              orders={orders}
              filtro={orderFiltro}
              onFiltro={handleOrderFiltro}
              onChange={async () => {
                await refreshOrders();
                if (semValores) await refreshEstoqueBaixo();
              }}
              podeLiquidar={podeExecutar(papel, "liquidar")}
              semValores={semValores}
            />
          )}
          {screen === "produtos" &&
            (produtosSubTab === "produtos" ? (
              <ProdutosTab
                products={products}
                podeEditarPreco={podeEditarPreco}
                podeVerPreco={podePrecoProduto}
                busyId={busyId}
                descontoOpenId={descontoOpenId}
                descontoInput={descontoInput}
                onNovoProduto={() => setEditingId("novo")}
                onEditar={(id) => setEditingId(id)}
                onToggleAtivo={handleToggleAtivo}
                onToggleDestaque={async (p) => {
                  setBusyId(p.id);
                  await setDestaque(p.id, !p.destaque);
                  await refreshProducts();
                  setBusyId(null);
                }}
                onToggleSurpresa={handleToggleSurpresa}
                onDescontoToggle={toggleDescontoRow}
                onDescontoChange={setDescontoInput}
                onDescontoSalvar={handleSalvarDesconto}
                onDescontoRemover={handleRemoverDesconto}
                onExcluir={handleDelete}
                onSubTab={setProdutosSubTab}
                subTab={produtosSubTab}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: 4,
                    width: "fit-content",
                  }}
                >
                  <button
                    onClick={() => setProdutosSubTab("produtos")}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: "transparent",
                      color: "var(--adm-text-secondary)",
                    }}
                  >
                    Produtos
                  </button>
                  <button
                    onClick={() => setProdutosSubTab("categorias")}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: "var(--peach)",
                      color: "var(--ink)",
                    }}
                  >
                    Categorias
                  </button>
                </div>
                <CategoriasTab
                  categorias={categorias}
                  podeEditarPreco={podeEditarPreco}
                  podeExcluir={podeExcluir}
                  onChange={refreshCategorias}
                />
              </div>
            ))}
          {screen === "produtos" && editingId !== null && (
            <ProductEditor
              key={editingId}
              product={produtoEmEdicao}
              categorias={categorias}
              podeEditarPreco={podePrecoProduto}
              podeExcluir={podeExcluir}
              onChange={refreshProducts}
              onDone={async () => {
                setEditingId(null);
                await refreshProducts();
              }}
            />
          )}
          {screen === "promocoes" && <PromocoesTab categorias={categorias} onToast={mostrarToast} />}
          {screen === "usuarios" && <UsuariosTab ator={{ id: perfil.id, papel }} onToast={mostrarToast} />}
          {screen === "vendas" && <VendasLeituraTab sales={sales} filtro={salesFiltro} onFiltro={handleSalesFiltro} />}
          {screen === "financeiro" && (
            <SalesTab
              products={products}
              sales={sales}
              filtro={salesFiltro}
              onFiltro={handleSalesFiltro}
              onChange={refreshSales}
            />
          )}
          {screen === "revendedores" && (
            <RevendedoresTab
              revendedores={revendedores}
              papel={papel}
              onAprovar={podeAprovar ? (id) => handleRevendedorStatus(id, "aprovado") : undefined}
              onRecusar={podeAprovar ? (id) => handleRevendedorStatus(id, "recusado") : undefined}
              onSalvo={async (mensagem) => {
                mostrarToast(mensagem);
                await refreshRevendedores();
              }}
            />
          )}
          {screen === "banner" && <BannerTab onToast={mostrarToast} />}
          {screen === "textos" && <TextosTab onToast={mostrarToast} />}
        </section>
      </main>
      <Toast mensagem={mensagemToast} />
      {configOpen && ehSuperadmin && (
        <ConfigTab
          config={config}
          products={products}
          onSaved={refreshConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
