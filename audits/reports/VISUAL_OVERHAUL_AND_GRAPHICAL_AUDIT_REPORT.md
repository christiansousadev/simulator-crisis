# Visual Overhaul & Graphical Quality Audit Report: Cyber War Room

**Document ID:** IZ-AUDIT-GRAPHICS-2026-10  
**Classification:** Technical Quality Audit & Graphical Modernization Verification  
**Applies to:** `frontend/src/components/office/*`, `frontend/src/components/common/*`, `docs/screenshots/*`  
**Status:** Aprovado e Verificado em Código e Capturas Oficiais  
**Data:** Outubro de 2026 (revisado em 2026-11-11: rig de animação, vida ambiente e game feel)  
**Autor:** Equipe de Engenharia e Design Tático / Antigravity AI  

---

## 1. Sumário Executivo

Este relatório audita e documenta a reconstrução visual do cenário isométrico do **IncidentZero**, elevando a apresentação visual de modelos geométricos planos para uma **Cyber War Room Tática de Alto Padrão (Tactical High-Tech Operations Command Center)**.

A intervenção atendeu diretamente ao apontamento crítico de que os elementos anteriores (cenários, objetos, personagens e animações) não transmitiam a identidade de uma plataforma/jogo profissional. Toda a evolução foi executada sob **estrito respeito aos contratos de engenharia de software**, preservando a máquina de estados do simulador, a autoridade do servidor WebSocket, os hooks de acessibilidade e toda a suíte de testes automatizados.

### Resultados dos Quality Gates (revalidados em 2026-11-11)
- **Lint (ESLint) e tipos (`tsc --noEmit`):** 0 erros, 0 avisos.
- **Testes Unitários e de Integração (Vitest):** **63 arquivos / 478 testes aprovados**, com **zero** avisos `act()` e nada em stderr.
- **Backend (pytest):** **127/127 testes aprovados**.
- **Compilação de Produção (Vite + TypeScript):** concluída; PWA com 37 entradas em precache. Todas as keyframes de animação novas, incluindo as do screen shake, foram conferidas no CSS gerado em `dist/`.
- **Captura Automatizada de Screenshots (Playwright E2E):** **26 capturas oficiais (13 EN + 13 PT-BR)** regeradas em `docs/screenshots/` por `capture-screenshots.spec.ts` (2/2 testes aprovados).
- **Performance Gráfica:** sem filtros SVG de tela cheia (`feColorMatrix`); animações restritas a `transform` e `opacity`, com pools fixos de partículas.

---

## 2. Inventário de Arquivos Auditados e Atualizados

| Componente | Arquivo | Responsabilidade Visual | Status |
|---|---|---|---|
| Geometria Isométrica Base | `frontend/src/components/office/IsoBox.tsx` | Shader de sombreamento direcional (`fillLeft`, `fillRight`, `fillTop`), traços e chanfros especulares (`highlightTop`). | Auditado & Aprovado |
| Biblioteca de Gradientes | `frontend/src/components/office/FloorDecals.tsx` | `<LightGradients />` centralizando 15+ shaders táticos lineares e radiais; sinalização de piso em stencil militar. | Auditado & Aprovado |
| Keyframes e Micro-animações | `frontend/src/components/office/officeLife.css` | Animações CSS GPU-accelerated: LEDs de blade I/O, HUDs orbitais, pulsos hexagonais e chevrons táticos. | Auditado & Aprovado |
| Racks de Servidores 42U | `frontend/src/components/office/ServerRack.tsx` | Chassi 42U, 8 lâminas de servidores blades com travas de ejeção, cabos de fibra óptica com pulsos, vidro fumê, HUD reticular e fumaça/faíscas. | Auditado & Aprovado |
| Personagens e Sprites | `frontend/src/components/office/OfficeWorker.tsx` | Moletons SRE táticos, ternos executivos, headsets over-ear com mic boom iluminado, smartwatches OLED e laptops ultrabooks. | Auditado & Aprovado |
| Workstations de Engenharia | `frontend/src/components/office/EngineerDesk.tsx` | Mesas em acabamento de fibra de carbono/ardósia, deskpads com borda neon RGB, monitores articulados duplos/triplos e cadeiras ergonômicas em mesh. | Auditado & Aprovado |
| Piso de Engenharia | `frontend/src/components/office/EngineeringFloor.tsx` | Distribuição padronizada de mesas de operação e postos reserva seguindo o padrão de acabamento em carbono. | Auditado & Aprovado |
| Objetos e Mobiliário | `frontend/src/components/office/OfficeProps.tsx` | Máquina de expresso italiana cromada com manômetros analógicos e vapor, mesa de ping-pong padrão torneio, sofá modular em petróleo, plantas tropicais exuberantes e poltronas club. | Auditado & Aprovado |
| Sala de Reunião da Diretoria | `frontend/src/components/office/BoardRoom.tsx` | Mesa de conferência executiva em vidro fumê chanfrado com esteira de telemetria ciano e cadeiras em couro estofado com armação cromada. | Auditado & Aprovado |
| Monitor de Telemetria de Parede | `frontend/src/components/office/BoardroomMetricsDisplay.tsx` | Tela 4K de centro de comando com moldura em titânio, grade de osciloscópio, beacon de alerta SEV-1 e sparklines de latência P99, vazão e taxa de erros. | Auditado & Aprovado |
| Menu Radial e HUD Tático | `frontend/src/components/office/RackRadialMenu.tsx` | Bússola orbital com marcações de azimute a cada 45°, retículo central em cruz, botões em vidro escuro e chevrons táticos ao passar o mouse. | Auditado & Aprovado |

---

## 3. Detalhamento Técnico das Etapas de Modernização

### 3.1 Primitivas Isométricas e Shaders Vetoriais
- **Problema Anterior:** As geometrias utilizavam cores hexadecimais sólidas estáticas (`#b98a5a`, `#1e293b`), gerando uma aparência de blocos plásticos e sem profundidade de iluminação.
- **Solução Implementada:** O componente `IsoBox` foi aprimorado para suportar injeção independente de gradientes SVG por face (`fillLeft`, `fillRight`, `fillTop`), espessuras de borda e chanfros especulares (`highlightTop`) simulando reflexo de borda polida.
- **Impacto de Performance:** Ao invés de aplicar filtros caros de convolução ou matriz de cores (`feColorMatrix`), os gradientes são resolvidos diretamente na rasterização nativa da GPU, mantendo o consumo de memória em zero e a taxa de quadros a 60 FPS.

### 3.2 Servidores Blades 42U e Infraestrutura de Rede
- **Detalhes Estruturais:**
  - O rack foi redesenhado como um gabinete enterprise 42U com 8 gavetas individuais de servidores blade.
  - Cada blade apresenta perfurações de micro-ventilação, travas mecânicas cromadas e LEDs de tráfego de I/O cintilantes (`ol-blade-led`).
  - Guias de patch cord de fibra óptica iluminadas (`fiberGlowCyan`) com pulsos de luz em movimento.
  - Porta de vidro fumê temperado com brilho especular diagonal (`rackGlassSheen`).
  - Retículo tático holográfico concêntrico com anéis em contra-rotação (`ol-holo-spin` e `ol-holo-spin-rev`) ativado sobre o rack em foco/seleção.
  - Estado de falha crítica com emissão de faíscas no topo (`data-testid="rack-top-spark"`) e coluna volumétrica de fumaça.

### 3.3 Personagens e Dinâmica SRE
- **Modelagem de Vestuário e Equipamento:**
  - Especialistas de engenharia vestem moletons táticos com zíper frontal e capuz detalhado; executivos vestem ternos grafite de alfaiataria com gravatas acetinadas.
  - Headsets de comunicação SRE com arco estruturado e haste de microfone com LED indicador de status.
  - Smartwatches nos pulsos com display ciano brilhante.
  - Ultrabooks portáteis (`data-testid="worker-laptop"`) abertos durante atendimento a incidentes, exibindo linhas de código em terminal ciano.
  - Animação sutil de piscada ocular natural (`animate-eye-blink`) com ponto de brilho reflexivo.

### 3.4 Workstations, Mobiliário e Áreas de Descompressão
- **Workstations:** Acabamento em compósito de carbono com bordas chanfradas, deskpad estendido com contorno neon RGB iluminado, torres de PC com painel lateral em vidro temperado e cooler RGB giratório, além de monitores widescreen duplos/triplos ultrafinos com linhas de diagnóstico ao vivo.
- **Cadeiras Ergonômicas:** Estrutura em mesh respirável com suporte lombar curvo, pistão de ajuste a gás cromado (`chromeMetal`) e base estrela com rodízios.
- **Copa e Lounge:** Máquina de café expresso italiana de alta pressão em aço escovado com dois manômetros circulares analógicos, aquecedor de xícaras de porcelana e plumas de vapor; mesa de ping-pong padrão torneio em azul com rede suspensa; sofá modular em tom petróleo com base de carvalho e almofadas de design.
- **Sala de Diretoria Executiva:** Mesa de conferência executiva com tampo em vidro fumê e esteira de telemetria de rede ciano, rodeada por poltronas executivas em couro canelado. Na parede, monitor 4K com moldura de titânio, tela de osciloscópio digital e alerta SEV-1 interativo.

### 3.5 HUD Tático de Azimute e Mira Holográfica
- O menu de ações radiais ao redor dos racks (`RackRadialMenu`) agora simula uma mira de controle militar:
  - Anel externo com marcações de graus de azimute a cada 45°.
  - Retículo central em cruz com pulso de núcleo ciano.
  - Botões de ação em cápsulas de vidro escuro que projetam chevrons de enquadramento tático nos cantos ao passar o cursor.
  - Sinalização de piso das salas (`FloorSignage`) integrada com molduras stencil e linhas sublinhadas pontilhadas.

---

## 4. Auditoria dos Artefatos de Captura de Tela (Screenshots)

Executado o teste E2E oficial (`capture-screenshots.spec.ts`) contra instâncias do frontend (Vite dev) e do backend (uvicorn) levantadas pelo próprio Playwright:

```bash
$env:E2E_FRONTEND_PORT="5185"; $env:E2E_BACKEND_PORT="8015"; npx playwright test capture-screenshots.spec.ts
```

**Resultado:** 2/2 testes aprovados (EN e PT-BR); as 26 imagens foram regravadas na mesma execução.

O spec agora monta um escritório com equipe antes das capturas:
- **Equipe contratada:** depois de resetar a sessão, ele contrata dois especialistas pela API REST (`POST /api/staff/hire`): `auth` em `srv-auth` e `payments` em `srv-payment`. A captura do HUD espera os dois chegarem pela recepção e começarem a digitar nas mesas (`[data-testid="worker-typing"]` ≥ 2).
- **Log triage:** o terminal CRT abre pelo store (`openTriageTerminal`) no incidente ativo. A captura espera o fluxo de linhas parar de crescer e depois fecha com Escape.
- **Tutorial:** o módulo 1 abre por `openOnboarding(1)` e avança até o passo que põe o holofote no rack em alerta. A seleção de rack é limpa antes, para o menu radial não entrar na imagem, e o tutorial é fechado por `closeOnboarding()`.

### Inventário de Imagens Atualizadas em `docs/screenshots/`
Todas as 26 capturas de tela oficiais (13 pares EN e PT-BR) foram regeradas na mesma execução e conferidas visualmente:

| Arquivo (EN / PT-BR) | Resolução | Conteúdo Demonstrado |
|---|---|---|
| `title-screen.png` / `title-screen-pt.png` | 1600x1000 | Tela inicial com briefing de missão e seleção de perfil |
| `office-hud.png` / `office-hud-pt.png` | 1600x1000 | Vista panorâmica da War Room com dois engenheiros sentados digitando em monitores acesos, canecas nas mesas, cadeiras recolhidas e telas em descanso nas mesas vagas |
| `service-map.png` / `service-map-pt.png` | 1600x1000 | Mapa topológico de dependências entre microsserviços |
| `war-room.png` / `war-room-pt.png` | 1600x1000 | Painel de comunicações ao vivo e status page pública de stakeholders |
| `mitigations-panel.png` / `mitigations-panel-pt.png` | 1600x1000 | Catálogo operacional de runbooks e diretivas de mitigação |
| `upgrades-tree.png` / `upgrades-tree-pt.png` | 1600x1000 | Árvore tecnológica de melhorias de infraestrutura e automação |
| `active-incident.png` / `active-incident-pt.png` | 1600x1000 | Incidente P2 em `srv-notify`: badge de alerta no rack, card de ameaça ativa, faixa "Threat detected" e DEFCON 4 |
| `incident-detail.png` / `incident-detail-pt.png` | 1600x1000 | Modal de investigação de incidentes com tri-bloco de contexto e ações |
| `log-triage.png` / `log-triage-pt.png` | 1600x1000 | Terminal CRT de investigação forense com o fluxo completo de linhas (INFO/WARN/ERROR/FATAL) |
| `tutorial.png` / `tutorial-pt.png` | 1600x1000 | Tutorial guiado (passo 2 de 4) com holofote no rack em alerta |
| `flight-academy.png` / `flight-academy-pt.png` | 1600x1000 | Academia de treinamento interativo SRE |
| `glossary.png` / `glossary-pt.png` | 1600x1000 | Glossário de termos técnicos operacionais |
| `post-match-debrief.png` / `post-match-debrief-pt.png` | 1600x1000 | Linha do tempo pós-partida com pontuação e relatório de carreira |

**Limitação das capturas estáticas:** o incidente de prática (`POST /api/tutorial/incident`) é um P2 num serviço `standard`, então não dispara o alerta vermelho. Por isso as imagens não mostram corrida, pânico, poeira ou executivos apontando para a TV. Esses comportamentos estão cobertos pelos testes de componente listados na Seção 5.

---

## 5. Modernização Adicional: Estilo Pixel Art Isométrico (16-bit Retro)

Para atender à demanda estética de eliminar o aspecto vetorial excessivamente geométrico ("quadradão"), foi implementada a transição completa para **Pixel Art Isométrico**:

1. **Primitivas de Degraus Isométricos 2:1:**
   - Em `isoMath.ts` e `IsoBox.tsx`, as caixas isométricas adotam geometria pura de 4 vértices por face, respeitando rigorosamente a inclinação 2:1 clássica de jogos isométricos retro (como *Habbo Hotel*, *Kairosoft* e *Mega Man Battle Network*).
   - Ativação de `shapeRendering="crispEdges"` e `image-rendering: pixelated`, eliminando borrões de anti-aliasing do navegador.
   - Contornos escuros sólidos de 1px (`#090d16` / `#0a0f1d`) com junção em esquadria (`miter`).

2. **Personagens (NPCs Chibi 16-bit):**
   - Redesenho completo em `OfficeWorker.tsx`: cabeça chibi (13x11px), olhos 2x2 com brilho especular branco, mechas de cabelo pixeladas e bochechas coradas.
   - Vestimentas temáticas em pixel art: moletons táticos com cordões e bolso canguru para engenheiros, ternos escuros com camisa social e gravata para executivos.
   - Sneakers com solado de borracha branco de 1px destacado.
   - Acessórios de alta tecnologia: headsets de concha quadrada com anel neon ciano, haste com LED verde e smartwatch com display ciano.
   - Animações por passos discretos (`steps()`): ciclo de caminhada em 4 frames-chave, *idle bobbing* de 1px e digitação frenética alternada.

3. **Gamificação Completa e Loja de Decoração de Prestígio:**
   - Adicionada aba de personalização em `HallOfFameModal.tsx` integrada à API `/api/cosmetics/*`.
   - Implementados shaders dinâmicos (`goldMetal`, `marbleStone`, `executiveLeather`) em `FloorDecals.tsx`.
   - Renderização reativa de reskins desbloqueados: Cafeteira Dourada 24K em `BreakRoom.tsx`, Sofá Executivo Cognac e Balcão de Mármore Carrara em `ReceptionLobby.tsx`.
   - Micro-detalhes de War Room: canecas cerâmicas nas mesas SRE (`EngineerDesk.tsx`), diagrama arquitetural C4 no quadro branco da diretoria (`BoardRoom.tsx`) e extintores/saídas de emergência nas paredes perimetrais (`PerimeterWalls.tsx`).

4. **Pacote PWA Completo e Metatags Sociais:**
   - `frontend/public/` enriquecido com `favicon.ico`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon.png` e `og-image.png` (1200x630).
   - Manifesto PWA em `vite.config.ts` e metatags Open Graph/Twitter em `index.html` atualizados para máxima conformidade.

5. **Rig de Animação em Camadas e Game Feel:**
   - **Rig em camadas no `OfficeWorker`:** a sombra de contato fica no chão, fora de qualquer bob, e encolhe a cada passada. As camadas, de fora para dentro: cue (antecipação, assentamento, sentar/levantar, susto, squash do clique), bob, pernas, inclinação e tronco, com braços e cabeça dentro do tronco.
   - **Relógio único `--step`:** derivado da velocidade (`workerRig.gaitFor`: 0,333 s andando a 1,5 tile/s, 0,2 s correndo a 3,2 tile/s). Pernas, braços em contrafase, bob e sombra seguem esse mesmo ciclo.
   - **Pixel art preservada:** poses em pixels inteiros com `steps()`, sem `rotate` nem `skewX`. O braço que carrega laptop ou caneca fica travado.
   - **4 direções isométricas:** `heading: "ne" | "nw" | "se" | "sw"` em `rosterStage`/`waypointGraph`, com variante de costas simplificada (sem rosto, óculos nem crachá; capuz ou gola nas costas). Parado, o sprite volta a ficar de frente.
   - **Rotas:** ease-in na largada e ease-out na chegada.
   - **Respiração e digitação:** a respiração mexe só no tronco, com fase por sprite (inclusive `tired` e `recovering`); a digitação vem em rajadas com pausas de leitura.
   - **Alarme:** susto com balão `!` de 7×9 px propagando em onda de 0–300 ms pelo andar e três estilos de pânico fixos por engenheiro.
   - **Gestos esporádicos (`useIdleGesture`):** olhar em volta, checar o relógio, espreguiçar, beber da caneca da mesa; na copa, tirar café e recostar no sofá.
   - **Vida ambiente:**
     - porta de vidro do datacenter deslizando em 4 quadros enquanto alguém cruza (`.ol-door-slide`);
     - cadeira afastada e girada enquanto o engenheiro está fora da mesa;
     - screensaver lento e atenuado nas mesas vagas;
     - luminária que acende ao anoitecer (18h) com 2 quadros de flicker;
     - planta que balança 1 px quando alguém passa correndo no alerta vermelho;
     - almofada do sofá que afunda com assentamento elástico;
     - poeira de 1–2 px atrás dos calcanhares na corrida de urgência;
     - executivos na TV: um aponta para a tela e o outro bate o pé;
     - wanderers viram para o datacenter, esticam a cabeça e dão um passo hesitante para trás.
   - **Juice:**
     - squash & stretch de 180 ms (`.ol-press`) em mesas, racks e funcionários;
     - confete pixelado (`PixelBurst`) e comemoração do engenheiro quando o serviço é restaurado;
     - chips de valor ancorados no mundo (`WorldChip`): `+SLA` no rack restaurado, `-$` no rack sob runbook, `+XP` na mesa do engenheiro do serviço, como o XP que o backend concede na resolução;
     - ventoinhas que forçam em `degraded` e desaceleram até parar em `down`, chassi vibrando 1 px e faíscas em rajadas irregulares.
   - **Screen shake corrigido:** as keyframes `screen-shake-*` existiam só no `tailwind.config.js`, que só emite keyframes de utilitários `animate-*` em uso, então o tremor **nunca rodava em produção**. Agora elas ficam em `index.css` e foram conferidas no bundle. O tremor saiu da raiz do app e foi para o `<svg>` do escritório (`useSceneShake`): HUD, dock e KPIs ficam parados. São três intensidades (SLA rompido / P1 / falência), com intervalo mínimo de 1,5 s entre tremores.
   - **Movimento reduzido:** sem tremor (borda vermelha estática no lugar), sem gestos automáticos, susto, squash nem passo para trás. As poses continuam estáticas e legíveis.
   - **Cobertura:** `workerRig.test.tsx` (31 testes), `ambientLife.test.tsx` (17) e `officeDetails.test.tsx`.

---

## 6. Parecer Conclusivo da Auditoria

O objetivo de transformar o visual e as animações do projeto em uma experiência com aspecto de **plataforma e jogo profissional** foi atingido.

- A atmosfera anterior, tida como simples e sem apelo, virou uma **Cyber War Room em Pixel Art Isométrico 16-bit**. Os personagens têm rig em camadas e quatro direções e reagem ao que o jogador faz; o cenário tem vida ambiente e retorno físico (squash, confete, chips de valor, tremor de cena).
- A especificação de animações e game feel foi implementada nas três fases, incluindo os itens de vida ambiente. O arquivo de trabalho da spec foi removido da raiz depois disso; o registro do que entrou fica no `CHANGELOG.md` e na Seção 5 deste relatório.
- **Nenhuma regressão introduzida:** os contratos de acessibilidade (`prefers-reduced-motion` e a preferência de movimento do jogo, `[data-high-contrast]`, `[data-colorblind-safe]`) seguem íntegros.
- **Quality gates (2026-11-11):**
  - lint 0/0;
  - `tsc` limpo;
  - **478/478** testes Vitest, sem nenhum aviso `act()`;
  - **127/127** pytest;
  - build de produção verde;
  - Playwright 2/2, com as **26** screenshots regeradas.
- **Ressalva de verificação:** o comportamento das animações foi verificado por testes de componente e pelas capturas estáticas, não por inspeção do movimento em tempo real no navegador.
