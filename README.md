# OHM — Monitoramento e Controle Inteligente de Energia

Protótipo funcional construído a partir do documento **"OHM — Planejamento das Telas e
Funcionamento do Sistema"** (Projeto Sistema Mecânico · Estratégia Empresarial).

O OHM cumpre a promessa do pitch em três verbos: **medir** (consumo em tempo real por
equipamento), **entender** (histórico, linha de base, anomalias e consumo ocioso) e
**agir** (desligamento remoto, ação em lote e regras automáticas).

## Como executar

Não há dependências nem build: **abra o arquivo `index.html` em qualquer navegador**
(duplo clique funciona). Opcionalmente, sirva a pasta com um servidor local:

```
npx serve .
```

Para ver o **modo aplicativo** (barra inferior com 5 itens, como no planejamento),
estreite a janela do navegador para menos de 720 px ou use o modo responsivo do DevTools.

## Acessos de demonstração

A tela de login tem botões de acesso rápido (qualquer senha serve no campo manual):

| Pessoa | Perfil | O que enxerga |
|---|---|---|
| **Mariana Costa** | Administradora (facilities) | Toda a organização, cadastros, regras, relatórios |
| **Rafael Almeida** | Administrador (manutenção) | Idem — foco na tela Saúde e manutenção |
| **Paola Queiroz** | Usuário padrão | Somente o **Bloco B** (ver + controlar) |
| **Daniela Zei** | Usuário padrão | Somente o setor **Administrativo** |

O fluxo de **primeiro acesso por convite** também está simulado ("Ativar convite",
código `OHM-2026`).

## Os 4 fluxos da seção 6 — roteiro de demonstração

1. **Encerrar expediente** — entre como *Paola* → "Meus equipamentos" → **Encerrar
   expediente**. O sistema mostra o que será desligado, pede confirmação e exibe o
   resultado item a item: 2 confirmados e **1 falha** (o ar da Sala B-101 está offline),
   deixando claro que algo ficou ligado.
2. **Anomalia de 35%** — como *Mariana*, abra o alerta crítico do ar-condicionado do
   Laboratório 2: gráfico real × esperado, custo extra estimado, causas prováveis
   (filtros, gás, obsolescência) e botão para abrir recomendação de manutenção, que
   aparece na tela **Saúde e manutenção**.
3. **Prestação de contas** — tela **Consumo**: filtre o período, marque "Destacar
   consumo ocioso" no mapa de calor, depois gere o relatório comparativo em
   **Relatórios** e exporte em **PDF** (imprimir) ou **CSV**.
4. **Regra automática** — tela **Automações** → botão **▶ Simular** na regra
   "Religamento fora do horário": alguém religa o ar às 22h, a regra desliga de novo,
   registra no **Histórico de ações** e avisa o responsável — o que o temporizador
   comum não consegue fazer.

## O que está implementado (20 telas do planejamento)

| # | Tela | Rota |
|---|---|---|
| 1 | Login e primeiro acesso | `#/login` |
| 2 | Início (painel principal) | `#/inicio` |
| 3 | Consumo | `#/consumo` |
| 4 | Ambientes (lista e detalhe) | `#/ambientes` |
| 5 | Equipamentos (ranking) | `#/equipamentos` |
| 6 | Detalhe do equipamento | `#/equipamentos/eq07` |
| 7 | Meus equipamentos e ação em lote | `#/meus` |
| 8 | Automações | `#/automacoes` |
| 9 | Criar e editar regra (quando·se·então) | `#/automacoes/nova` |
| 10 | Central de alertas | `#/alertas` |
| 11 | Detalhe do alerta e diagnóstico | `#/alertas/a1` |
| 12 | Saúde e manutenção | `#/saude` |
| 13 | Relatórios | `#/relatorios` |
| 14 | Projeção e sugestões de economia | `#/projecao` |
| 15 | Usuários e permissões | `#/admin/usuarios` |
| 16 | Estrutura de locais | `#/admin/locais` |
| 17 | Dispositivos e sensores | `#/admin/dispositivos` |
| 18 | Configurações da organização | `#/admin/config` |
| 19 | Histórico de ações (auditoria) | `#/admin/historico` |
| 20 | Perfil e preferências | `#/perfil` |

## Regras de negócio da seção 7 — como foram tratadas

- **Equipamento crítico**: desligar exige confirmação explícita de intertravamento;
  **ligar** remotamente é ainda mais restrito (digitar `LIGAR`); ações em lote
  **excluem** máquinas críticas.
- **Todo comando tem retorno**: enviado → confirmado pelo sensor ou **falhou**. A
  interface nunca mostra "desligado" só porque o botão foi tocado.
- **Sensor offline ≠ consumo zero**: aparece como aviso, com a última leitura conhecida.
- **Botão de desligar escondido** onde não há atuador (equipamentos apenas monitorados).
- **LGPD**: histórico de ações restrito ao administrador; desativar usuário preserva o
  histórico para auditoria.
- **Controle do excesso de alertas**: gravidade configurável, silenciamento **com
  justificativa obrigatória** e horário de silêncio.

## Números do pitch mantidos no protótipo

42,8 kW de consumo atual · queda de ~18% · desvio de 35% no ar-condicionado · tarifa
R$ 1,18/kWh · split 12.000 BTU/h ligado 10 h além do expediente ≈ 220 kWh ≈ R$ 260/mês.

## Estrutura do código

```
index.html            página única (SPA por hash routing)
css/styles.css        tokens de design (claro/escuro) + componentes
js/data.js            modelo de domínio e dados de demonstração
js/sim.js             simulação: histórico 28d, linha de base, comandos, regras
js/charts.js          gráficos SVG (linha c/ faixa esperada, barras, mapa de calor)
js/views-monitor.js   telas 1–6 · js/views-action.js telas 7–12 · js/views-admin.js telas 13–20
js/app.js             roteador, shell, RBAC, modais, fluxos de comando
```

Tudo roda no navegador, sem backend: os sensores, a nuvem e o motor de regras são
simulados de forma determinística para que a demonstração conte sempre a mesma história.
