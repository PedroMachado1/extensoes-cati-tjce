import unittest
import os
import subprocess
import json

class TestAssystDowntime(unittest.TestCase):
    def setUp(self):
        self.js_path = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "assistente-2n-cati-remoto",
                "src",
                "content",
                "assyst-downtime.js"
            )
        )
        self.css_path = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "assistente-2n-cati-remoto",
                "src",
                "content",
                "assyst-downtime.css"
            )
        )
        self.popup_html_path = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "assistente-2n-cati-remoto",
                "src",
                "popup",
                "popup.html"
            )
        )
        self.popup_js_path = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "assistente-2n-cati-remoto",
                "src",
                "popup",
                "popup.js"
            )
        )

    def mock_dom_js(self):
        return """
        function createMockElement(tag) {
          const listeners = {};
          const el = {
            tagName: tag.toUpperCase(),
            id: '',
            className: '',
            classList: {
              _classes: new Set(),
              add: function(...cls) { cls.forEach(c => this._classes.add(c)); el.className = Array.from(this._classes).join(' '); },
              remove: function(...cls) { cls.forEach(c => this._classes.delete(c)); el.className = Array.from(this._classes).join(' '); },
              contains: function(c) { return this._classes.has(c); }
            },
            style: {},
            innerText: '',
            textContent: '',
            children: [],
            parentNode: null,
            appendChild: function(child) {
              if (!child) return child;
              if (child.parentNode) child.parentNode.removeChild(child);
              child.parentNode = this;
              this.children.push(child);
              return child;
            },
            removeChild: function(child) {
              const idx = this.children.indexOf(child);
              if (idx !== -1) {
                this.children.splice(idx, 1);
                child.parentNode = null;
              }
              return child;
            },
            remove: function() {
              if (this.parentNode) {
                this.parentNode.removeChild(this);
              }
            },
            querySelector: function(sel) {
              return findSelector(this, sel);
            },
            querySelectorAll: function(sel) {
              const res = [];
              findAllSelectors(this, sel, res);
              return res;
            },
            addEventListener: function(evt, handler) {
              if (!listeners[evt]) listeners[evt] = [];
              listeners[evt].push(handler);
            },
            dispatchEvent: function(evt) {
              const type = typeof evt === 'string' ? evt : (evt && evt.type ? evt.type : 'click');
              const handlers = listeners[type] || [];
              handlers.forEach(h => h({ type, target: this, preventDefault: () => {} }));
            },
            click: function() {
              this.dispatchEvent('click');
            }
          };
          return el;
        }

        function matchEl(el, sel) {
          if (!el || !sel) return false;
          if (sel.startsWith('#')) return el.id === sel.slice(1);
          if (sel.startsWith('.')) {
            const cls = sel.slice(1);
            return el.className && el.className.split(/\\s+/).includes(cls);
          }
          return el.tagName === sel.toUpperCase();
        }

        function findSelector(root, sel) {
          for (const child of root.children) {
            if (matchEl(child, sel)) return child;
            const found = findSelector(child, sel);
            if (found) return found;
          }
          return null;
        }

        function findAllSelectors(root, sel, res) {
          for (const child of root.children) {
            if (matchEl(child, sel)) res.push(child);
            findAllSelectors(child, sel, res);
          }
        }

        function createMockDocument() {
          const doc = {
            createElement: (tag) => createMockElement(tag),
            body: createMockElement('body'),
            getElementById: (id) => findSelector(doc.body, '#' + id),
            querySelector: (sel) => {
              if (sel === 'body') return doc.body;
              return findSelector(doc.body, sel);
            },
            querySelectorAll: (sel) => {
              const res = [];
              findAllSelectors(doc.body, sel, res);
              return res;
            }
          };
          return doc;
        }
        """

    def run_node(self, snippet):
        """Executa um trecho JavaScript importando o módulo assyst-downtime.js."""
        script = f"""
        const engine = require({json.dumps(self.js_path)});
        {snippet}
        """
        proc = subprocess.run(["node", "-e", script], capture_output=True, text=True, timeout=10)
        if proc.returncode != 0:
            raise RuntimeError(f"Node execution failed (code {proc.returncode}):\nSTDOUT: {proc.stdout}\nSTDERR: {proc.stderr}")
        out = proc.stdout.strip()
        return json.loads(out) if out else None

    def test_js_file_exists(self):
        """O arquivo assyst-downtime.js deve existir."""
        self.assertTrue(os.path.exists(self.js_path), f"Arquivo não encontrado: {self.js_path}")

    def test_detectar_queda_logout_session_invalid(self):
        """Detecta queda quando a URL contém /logout/logout.do e sessionInvalid=true."""
        snippet = """
        const res = engine.detectarQuedaAssyst(
            "https://cati.tjce.jus.br/assystweb/logout/logout.do?dispatch=prepare&sessionInvalid=true",
            "Página de login"
        );
        process.stdout.write(JSON.stringify(res));
        """
        res = self.run_node(snippet)
        self.assertTrue(res["caiu"])
        self.assertEqual(res["motivo"], "Sessão Expirada / Queda de Acesso")

    def test_detectar_queda_dom_sessao_expirou(self):
        """Detecta queda quando o DOM contém 'Sua sessão expirou.'."""
        snippet = """
        const res = engine.detectarQuedaAssyst(
            "https://cati.tjce.jus.br/assystweb/login.do",
            "Aviso do sistema: Sua sessão expirou. Efetue login novamente."
        );
        process.stdout.write(JSON.stringify(res));
        """
        res = self.run_node(snippet)
        self.assertTrue(res["caiu"])
        self.assertEqual(res["motivo"], "Sessão Expirada")

    def test_detectar_queda_dom_licencas_esgotadas(self):
        """Detecta queda quando o DOM contém 'Todas as licenças estão em uso'."""
        snippet = """
        const res = engine.detectarQuedaAssyst(
            "https://cati.tjce.jus.br/assystweb/login.do",
            "Erro de autenticação: Todas as licenças estão em uso. Tente novamente mais tarde."
        );
        process.stdout.write(JSON.stringify(res));
        """
        res = self.run_node(snippet)
        self.assertTrue(res["caiu"])
        self.assertEqual(res["motivo"], "Falta de Licenças Disponíveis")

    def test_detectar_queda_http_errors(self):
        """Detecta queda quando o DOM acusa status HTTP 500, 502, 503 ou 504."""
        erros = [
            "500 Internal Server Error",
            "HTTP 502 Bad Gateway",
            "503 Service Unavailable",
            "504 Gateway Time-out"
        ]
        for err in erros:
            snippet = f"""
            const res = engine.detectarQuedaAssyst(
                "https://cati.tjce.jus.br/assystweb/application.do",
                {json.dumps(err)}
            );
            process.stdout.write(JSON.stringify(res));
            """
            res = self.run_node(snippet)
            self.assertTrue(res["caiu"], f"Falhou para erro HTTP: {err}")
            self.assertEqual(res["motivo"], "Instabilidade de Servidor / Rede")

    def test_detectar_queda_normal(self):
        """Retorna caiu=false quando sistema está normal."""
        snippet = """
        const res = engine.detectarQuedaAssyst(
            "https://cati.tjce.jus.br/assystweb/application.do",
            "Painel de Chamados 2N CATI Remoto"
        );
        process.stdout.write(JSON.stringify(res));
        """
        res = self.run_node(snippet)
        self.assertFalse(res["caiu"])
        self.assertIsNone(res["motivo"])

    def test_detectar_restabelecimento_sucesso(self):
        """Retorna true quando a URL é application.do e elementos autenticados estão presentes."""
        snippet = """
        const mockDom = {
            querySelector: (sel) => {
                if (sel === "#contentPaneTitle" || sel === ".dojoxGridMasterView") return {};
                return null;
            },
            innerText: "Chamados Atribuídos"
        };
        const ok = engine.detectarRestabelecimento(
            "https://cati.tjce.jus.br/assystweb/application.do#tab=1",
            mockDom
        );
        process.stdout.write(JSON.stringify({ ok }));
        """
        res = self.run_node(snippet)
        self.assertTrue(res["ok"])

    def test_detectar_restabelecimento_em_logout_ou_erro(self):
        """Retorna false se ainda estiver em logout, sessão inválida ou sem elementos autenticados."""
        # Caso 1: Na rota logout.do
        snippet1 = """
        const mockDom = {
            querySelector: (sel) => ({}),
            innerText: "Normal"
        };
        const ok = engine.detectarRestabelecimento(
            "https://cati.tjce.jus.br/assystweb/logout/logout.do",
            mockDom
        );
        process.stdout.write(JSON.stringify({ ok }));
        """
        self.assertFalse(self.run_node(snippet1)["ok"])

        # Caso 2: Na rota application.do mas texto de sessão expirou
        snippet2 = """
        const mockDom = {
            querySelector: (sel) => ({}),
            innerText: "Sua sessão expirou."
        };
        const ok = engine.detectarRestabelecimento(
            "https://cati.tjce.jus.br/assystweb/application.do",
            mockDom
        );
        process.stdout.write(JSON.stringify({ ok }));
        """
        self.assertFalse(self.run_node(snippet2)["ok"])

        # Caso 3: Na rota application.do mas sem elementos autenticados no DOM
        snippet3 = """
        const mockDom = {
            querySelector: (sel) => null,
            innerText: "Carregando..."
        };
        const ok = engine.detectarRestabelecimento(
            "https://cati.tjce.jus.br/assystweb/application.do",
            mockDom
        );
        process.stdout.write(JSON.stringify({ ok }));
        """
        self.assertFalse(self.run_node(snippet3)["ok"])

    def test_formatar_duracao(self):
        """Testa formatação de durações em milissegundos."""
        # 1103000 ms (~18 min e 23 seg)
        snippet = """
        const res = engine.formatarDuracao(1103000);
        process.stdout.write(JSON.stringify(res));
        """
        res = self.run_node(snippet)
        self.assertEqual(res["formatada"], "18m 23s")
        self.assertEqual(res["minutos"], 18)
        self.assertEqual(res["segundos"], 23)
        self.assertEqual(res["textoExtenso"], "18 minutos e 23 segundos")

        # 0 ms
        snippet0 = """
        const res = engine.formatarDuracao(0);
        process.stdout.write(JSON.stringify(res));
        """
        res0 = self.run_node(snippet0)
        self.assertEqual(res0["minutos"], 0)
        self.assertEqual(res0["segundos"], 0)
        self.assertEqual(res0["textoExtenso"], "0 segundos")

        # 60000 ms (1 minuto exato)
        snippet1m = """
        const res = engine.formatarDuracao(60000);
        process.stdout.write(JSON.stringify(res));
        """
        res1m = self.run_node(snippet1m)
        self.assertEqual(res1m["minutos"], 1)
        self.assertEqual(res1m["segundos"], 0)
        self.assertEqual(res1m["textoExtenso"], "1 minuto")

        # 3665000 ms (1 hora, 1 minuto e 5 segundos)
        snippet1h = """
        const res = engine.formatarDuracao(3665000);
        process.stdout.write(JSON.stringify(res));
        """
        res1h = self.run_node(snippet1h)
        self.assertEqual(res1h["formatada"], "1h 1m 5s")
        self.assertEqual(res1h["textoExtenso"], "1 hora, 1 minuto e 5 segundos")

    def test_gerar_texto_comprovante(self):
        """Gera texto de comprovante com o template exato especificado."""
        snippet = """
        const inc = {
            dataStr: "16/10/2026",
            horaInicio: "14:10:22",
            horaFim: "14:28:45",
            duracaoTexto: "18 minutos e 23 segundos",
            motivo: "Sessão Expirada / Falta de Licenças no Servidor"
        };
        const txt = engine.gerarTextoComprovante(inc);
        process.stdout.write(JSON.stringify({ txt }));
        """
        res = self.run_node(snippet)
        txt = res["txt"]
        self.assertIn("⚠️ COMPROVANTE DE INSTABILIDADE DO SISTEMA (ASSYST)", txt)
        self.assertIn("📅 Data: 16/10/2026", txt)
        self.assertIn("⏱️ Início da Queda: 14:10:22", txt)
        self.assertIn("🔄 Restabelecimento: 14:28:45", txt)
        self.assertIn("⏳ Duração da Indisponibilidade: 18 minutos e 23 segundos", txt)
        self.assertIn("📌 Diagnóstico: Sessão Expirada / Falta de Licenças no Servidor", txt)
        self.assertIn("🏢 Equipe: 2N CATI Remoto — TJCE", txt)
        self.assertIn("ℹ️ Registro autenticado pelo Assistente 2N CATI Remoto", txt)

    def test_gerar_relatorio_consolidado(self):
        """Gera relatório diário consolidado para a gestão filtrado por data."""
        snippet = """
        const historico = [
            {
                dataStr: "16/10/2026",
                inicio: 1729080850000,
                horaInicio: "09:14:10",
                horaFim: "09:25:20",
                duracaoMs: 670000,
                duracao: "11 min e 10 seg",
                motivo: "Sessão Expirada"
            },
            {
                dataStr: "16/10/2026",
                inicio: 1729089005000,
                horaInicio: "11:30:05",
                horaFim: "11:42:15",
                duracaoMs: 730000,
                duracao: "12 min e 10 seg",
                motivo: "Todas as licenças em uso"
            },
            {
                dataStr: "16/10/2026",
                inicio: 1729098622000,
                horaInicio: "14:10:22",
                horaFim: "14:28:45",
                duracaoMs: 1103000,
                duracao: "18 min e 23 seg",
                motivo: "Sessão Expirada"
            },
            {
                dataStr: "15/10/2026",
                inicio: 1729000000000,
                horaInicio: "10:00:00",
                horaFim: "10:05:00",
                duracaoMs: 300000,
                duracao: "5m 0s",
                motivo: "Outro dia"
            }
        ];
        const txt = engine.gerarRelatorioConsolidado(historico, "16/10/2026");
        process.stdout.write(JSON.stringify({ txt }));
        """
        res = self.run_node(snippet)
        txt = res["txt"]
        self.assertIn("📊 RELATÓRIO DE INSTABILIDADE DO ASSYST — TJCE", txt)
        self.assertIn("📅 Data: 16/10/2026", txt)
        self.assertIn("🏢 Equipe: 2N CATI Remoto", txt)
        self.assertIn("• Queda 1: 09:14:10 às 09:25:20 (11 min e 10 seg) — Sessão Expirada", txt)
        self.assertIn("• Queda 2: 11:30:05 às 11:42:15 (12 min e 10 seg) — Todas as licenças em uso", txt)
        self.assertIn("• Queda 3: 14:10:22 às 14:28:45 (18 min e 23 seg) — Sessão Expirada", txt)
        self.assertNotIn("Outro dia", txt)
        self.assertIn("⏱️ Tempo Total de Indisponibilidade: 41 minutos e 43 segundos", txt)
        self.assertIn("🔢 Total de Ocorrências: 3 quedas", txt)
        self.assertIn("ℹ️ Dados catalogados automaticamente pelo Assistente 2N CATI Remoto", txt)

    def test_gerar_relatorio_consolidado_sem_quedas(self):
        """Gera relatório diário para uma data sem registros."""
        snippet = """
        const txt = engine.gerarRelatorioConsolidado([], "16/10/2026");
        process.stdout.write(JSON.stringify({ txt }));
        """
        res = self.run_node(snippet)
        txt = res["txt"]
        self.assertIn("📊 RELATÓRIO DE INSTABILIDADE DO ASSYST — TJCE", txt)
        self.assertIn("(Nenhuma indisponibilidade registrada nesta data)", txt)
        self.assertIn("🔢 Total de Ocorrências: 0 quedas", txt)

    def test_iniciar_incidente_storage(self):
        """iniciarIncidenteStorage cria incidente ativo e não reinicia caso já exista (F5 resilience)."""
        snippet = """
        async function run() {
            let store = {};
            const storageMock = {
                get: (keys, cb) => {
                    const res = {};
                    keys.forEach(k => { if (k in store) res[k] = store[k]; });
                    if (cb) cb(res);
                    return Promise.resolve(res);
                },
                set: (items, cb) => {
                    Object.assign(store, items);
                    if (cb) cb();
                    return Promise.resolve();
                }
            };

            const t0 = new Date("2026-10-16T14:10:22.000Z");
            const inc1 = await engine.iniciarIncidenteStorage("Sessão Expirada", t0, storageMock);

            // Segunda chamada simulando F5 30 segundos depois:
            const t1 = new Date("2026-10-16T14:10:52.000Z");
            const inc2 = await engine.iniciarIncidenteStorage("Sessão Expirada", t1, storageMock);

            return {
                inc1Inicio: inc1.inicio,
                inc2Inicio: inc2.inicio,
                storeInicio: store.cati_downtime_active.inicio,
                status: inc1.status,
                id: inc1.id
            };
        }
        run().then(res => process.stdout.write(JSON.stringify(res))).catch(e => {
            console.error(e);
            process.exit(1);
        });
        """
        res = self.run_node(snippet)
        self.assertEqual(res["inc1Inicio"], res["inc2Inicio"], "F5 reiniciou timestamp inicial do incidente!")
        self.assertEqual(res["storeInicio"], res["inc1Inicio"])
        self.assertEqual(res["status"], "ativo")
        self.assertTrue(res["id"].startswith("down_"))

    def test_finalizar_incidente_storage(self):
        """finalizarIncidenteStorage calcula duração, salva no histórico (FIFO max 30) e limpa ativo."""
        snippet = """
        async function run() {
            const t0 = new Date("2026-10-16T14:10:00.000Z");
            const t1 = new Date("2026-10-16T14:28:23.000Z"); // 18m 23s (1103000 ms)

            let store = {
                cati_downtime_active: {
                    id: "down_test",
                    inicio: t0.getTime(),
                    dataStr: "16/10/2026",
                    horaInicio: "14:10:00",
                    motivo: "Falta de Licenças Disponíveis",
                    status: "ativo"
                },
                cati_downtime_history: []
            };

            const storageMock = {
                get: (keys, cb) => {
                    const res = {};
                    keys.forEach(k => { if (k in store) res[k] = store[k]; });
                    if (cb) cb(res);
                    return Promise.resolve(res);
                },
                set: (items, cb) => {
                    Object.assign(store, items);
                    if (cb) cb();
                    return Promise.resolve();
                },
                remove: (keys, cb) => {
                    const arr = Array.isArray(keys) ? keys : [keys];
                    arr.forEach(k => delete store[k]);
                    if (cb) cb();
                    return Promise.resolve();
                }
            };

            const fin = await engine.finalizarIncidenteStorage(t1, storageMock);

            return {
                finStatus: fin.status,
                duracaoFormatada: fin.duracao,
                duracaoMs: fin.duracaoMs,
                activeCleared: !store.cati_downtime_active,
                historyLength: store.cati_downtime_history.length,
                historyFirstId: store.cati_downtime_history[0].id
            };
        }
        run().then(res => process.stdout.write(JSON.stringify(res))).catch(e => {
            console.error(e);
            process.exit(1);
        });
        """
        res = self.run_node(snippet)
        self.assertEqual(res["finStatus"], "finalizado")
        self.assertEqual(res["duracaoFormatada"], "18m 23s")
        self.assertEqual(res["duracaoMs"], 1103000)
        self.assertTrue(res["activeCleared"])
        self.assertEqual(res["historyLength"], 1)
        self.assertEqual(res["historyFirstId"], "down_test")

    def test_finalizar_incidente_storage_rotacao_fifo_max_30(self):
        """Garante rotação FIFO preservando no máximo 30 itens."""
        snippet = """
        async function run() {
            const t0 = new Date("2026-10-16T10:00:00.000Z");
            const t1 = new Date("2026-10-16T10:05:00.000Z");

            // Popula com 30 itens existentes
            const fakeHistory = [];
            for (let i = 0; i < 30; i++) {
                fakeHistory.push({ id: `down_old_${i}` });
            }

            let store = {
                cati_downtime_active: {
                    id: "down_novo",
                    inicio: t0.getTime(),
                    status: "ativo"
                },
                cati_downtime_history: fakeHistory
            };

            const storageMock = {
                get: (keys, cb) => {
                    const res = {};
                    keys.forEach(k => { if (k in store) res[k] = store[k]; });
                    if (cb) cb(res);
                    return Promise.resolve(res);
                },
                set: (items, cb) => {
                    Object.assign(store, items);
                    if (cb) cb();
                    return Promise.resolve();
                }
            };

            await engine.finalizarIncidenteStorage(t1, storageMock);

            return {
                totalHistory: store.cati_downtime_history.length,
                firstId: store.cati_downtime_history[0].id,
                hasOldLast: store.cati_downtime_history.some(x => x.id === "down_old_29")
            };
        }
        run().then(res => process.stdout.write(JSON.stringify(res))).catch(e => {
            console.error(e);
            process.exit(1);
        });
        """
        res = self.run_node(snippet)
        self.assertEqual(res["totalHistory"], 30)
        self.assertEqual(res["firstId"], "down_novo")
        self.assertFalse(res["hasOldLast"], "O 30º item antigo deveria ter sido descartado")

    def test_window_binding(self):
        """No navegador, o motor deve ser anexado a window.__catiDowntimeEngine."""
        snippet = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.js_path)}, "utf8");
        const fakeWindow = {{}};
        const fn = new Function("window", "module", code + "; return window.__catiDowntimeEngine;");
        const engineOnWindow = fn(fakeWindow, undefined);
        process.stdout.write(JSON.stringify({{
            hasEngine: !!engineOnWindow,
            hasDetectarQueda: typeof engineOnWindow.detectarQuedaAssyst === "function"
        }}));
        """
        proc = subprocess.run(["node", "-e", snippet], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, f"Erro: {proc.stderr}")
        res = json.loads(proc.stdout.strip())
        self.assertTrue(res["hasEngine"])
        self.assertTrue(res["hasDetectarQueda"])

    def test_css_file_exists_and_rules(self):
        """O arquivo assyst-downtime.css deve existir e conter os seletores de UI obrigatórios."""
        self.assertTrue(os.path.exists(self.css_path), f"Arquivo CSS não encontrado: {self.css_path}")
        with open(self.css_path, "r", encoding="utf-8") as f:
            css = f.read()

        seletores_obrigatorios = [
            "#cati-downtime-banner",
            "#cati-downtime-chrono",
            ".cati-downtime-motivo-tag",
            ".cati-downtime-aviso",
            "#cati-downtime-modal-restabelecido",
            ".cati-downtime-modal-content",
            ".cati-downtime-modal-duracao",
            "#cati-downtime-btn-copiar",
            "#cati-downtime-btn-fechar"
        ]
        for sel in seletores_obrigatorios:
            self.assertIn(sel, css, f"Seletor CSS ausente no arquivo: {sel}")

    def test_atualizar_cronometro_ao_vivo(self):
        """atualizarCronometroAoVivo deve formatar corretamente o delta em HH:MM:SS."""
        snippet = """
        const res = {
            c0: engine.atualizarCronometroAoVivo(1000, 1000),
            c44s: engine.atualizarCronometroAoVivo(1000, 45000),
            c4m32s: engine.atualizarCronometroAoVivo(1000, 273000),
            c1h1m: engine.atualizarCronometroAoVivo(1000, 3661000)
        };
        process.stdout.write(JSON.stringify(res));
        """
        res = self.run_node(snippet)
        self.assertEqual(res["c0"], "00:00:00")
        self.assertEqual(res["c44s"], "00:00:44")
        self.assertEqual(res["c4m32s"], "00:04:32")
        self.assertEqual(res["c1h1m"], "01:01:00")

    def test_renderizar_banner_queda_ativa(self):
        """renderizarBannerQuedaAtiva deve injetar o banner com cronômetro, motivo e aviso sem duplicar."""
        snippet = f"""
        {self.mock_dom_js()}
        const doc = createMockDocument();
        const inc = {{
            id: "down_test",
            inicio: 1729098622000,
            horaInicio: "14:10:22",
            motivo: "Sessão Expirada"
        }};

        const el1 = engine.renderizarBannerQuedaAtiva(inc, doc);
        const chrono1 = doc.querySelector("#cati-downtime-chrono");
        const motivo1 = doc.querySelector(".cati-downtime-motivo-tag");
        const aviso1 = doc.querySelector(".cati-downtime-aviso");
        const totalBanners1 = doc.querySelectorAll("#cati-downtime-banner").length;

        // Renderiza novamente para testar idempotência (sem duplicação):
        const el2 = engine.renderizarBannerQuedaAtiva(inc, doc);
        const totalBanners2 = doc.querySelectorAll("#cati-downtime-banner").length;

        process.stdout.write(JSON.stringify({{
            hasBanner: !!el1,
            bannerId: el1 ? el1.id : null,
            hasChrono: !!chrono1,
            motivoTexto: motivo1 ? motivo1.innerText : null,
            hasAviso: !!aviso1,
            totalBanners1,
            totalBanners2
        }}));
        """
        res = self.run_node(snippet)
        self.assertTrue(res["hasBanner"])
        self.assertEqual(res["bannerId"], "cati-downtime-banner")
        self.assertTrue(res["hasChrono"])
        self.assertEqual(res["motivoTexto"], "Sessão Expirada")
        self.assertTrue(res["hasAviso"])
        self.assertEqual(res["totalBanners1"], 1)
        self.assertEqual(res["totalBanners2"], 1)

    def test_remover_banner_queda(self):
        """removerBannerQueda remove o banner do DOM e retorna true se removido."""
        snippet = f"""
        {self.mock_dom_js()}
        const doc = createMockDocument();
        const inc = {{ id: "down_1", inicio: Date.now(), motivo: "Erro" }};
        engine.renderizarBannerQuedaAtiva(inc, doc);

        const antes = !!doc.getElementById("cati-downtime-banner");
        const rem1 = engine.removerBannerQueda(doc);
        const depois = !!doc.getElementById("cati-downtime-banner");
        const rem2 = engine.removerBannerQueda(doc);

        process.stdout.write(JSON.stringify({{
            antes,
            rem1,
            depois,
            rem2
        }}));
        """
        res = self.run_node(snippet)
        self.assertTrue(res["antes"])
        self.assertTrue(res["rem1"])
        self.assertFalse(res["depois"])
        self.assertFalse(res["rem2"])

    def test_renderizar_modal_restabelecimento(self):
        """renderizarModalRestabelecimento injeta modal com título, duração, botões e fecha ao clicar em fechar."""
        snippet = f"""
        {self.mock_dom_js()}
        const doc = createMockDocument();
        const inc = {{
            id: "down_fin",
            dataStr: "16/10/2026",
            horaInicio: "14:10:22",
            horaFim: "14:28:45",
            duracaoTexto: "18 minutos e 23 segundos",
            duracao: "18m 23s",
            duracaoMs: 1103000,
            motivo: "Sessão Expirada"
        }};

        const modal = engine.renderizarModalRestabelecimento(inc, doc);
        const titleEl = doc.querySelector(".cati-downtime-modal-title");
        const duracaoEl = doc.querySelector(".cati-downtime-modal-duracao");
        const btnCopiar = doc.querySelector("#cati-downtime-btn-copiar");
        const btnFechar = doc.querySelector("#cati-downtime-btn-fechar");
        const contentEl = doc.querySelector(".cati-downtime-modal-content");

        const antesFechar = !!doc.getElementById("cati-downtime-modal-restabelecido");
        btnFechar.click();
        const depoisFechar = !!doc.getElementById("cati-downtime-modal-restabelecido");

        process.stdout.write(JSON.stringify({{
            hasModal: !!modal,
            hasContent: !!contentEl,
            titleText: titleEl ? titleEl.innerText : "",
            duracaoText: duracaoEl ? duracaoEl.innerText : "",
            btnCopiarText: btnCopiar ? btnCopiar.innerText : "",
            btnFecharText: btnFechar ? btnFechar.innerText : "",
            antesFechar,
            depoisFechar
        }}));
        """
        res = self.run_node(snippet)
        self.assertTrue(res["hasModal"])
        self.assertTrue(res["hasContent"])
        self.assertIn("Assyst Restabelecido!", res["titleText"])
        self.assertIn("18 minutos e 23 segundos", res["duracaoText"])
        self.assertIn("Copiar Comprovante de SLA", res["btnCopiarText"])
        self.assertIn("Fechar", res["btnFecharText"])
        self.assertTrue(res["antesFechar"])
        self.assertFalse(res["depoisFechar"])

    def test_modal_clique_copiar_comprovante(self):
        """Clicar no botão Copiar Comprovante deve acionar callback e atualizar texto de feedback."""
        snippet = f"""
        {self.mock_dom_js()}
        const doc = createMockDocument();
        const inc = {{
            id: "down_fin",
            dataStr: "16/10/2026",
            horaInicio: "14:10:22",
            horaFim: "14:28:45",
            duracaoTexto: "18 minutos e 23 segundos",
            duracao: "18m 23s",
            duracaoMs: 1103000,
            motivo: "Sessão Expirada / Falta de Licenças no Servidor"
        }};

        let copiado = null;
        engine.renderizarModalRestabelecimento(inc, doc, (txt) => {{
            copiado = txt;
        }});

        const btnCopiar = doc.querySelector("#cati-downtime-btn-copiar");
        const textoAntes = btnCopiar.innerText;
        btnCopiar.click();
        const textoDepois = btnCopiar.innerText;

        process.stdout.write(JSON.stringify({{
            textoAntes,
            textoDepois,
            copiado
        }}));
        """
        res = self.run_node(snippet)
        self.assertIn("Copiar Comprovante de SLA", res["textoAntes"])
        self.assertIn("Copiado", res["textoDepois"])
        self.assertIsNotNone(res["copiado"])
        self.assertIn("COMPROVANTE DE INSTABILIDADE DO SISTEMA", res["copiado"])
        self.assertIn("18 minutos e 23 segundos", res["copiado"])

    def test_iniciar_ciclo_downtime_queda(self):
        """iniciarCicloDowntime detecta queda, grava no storage e exibe banner ativo."""
        snippet = f"""
        {self.mock_dom_js()}
        async function run() {{
            const doc = createMockDocument();
            doc.body.innerText = "Aviso do sistema: Sua sessão expirou.";
            const win = {{
                location: {{
                    href: "https://cati.tjce.jus.br/assystweb/logout/logout.do?dispatch=prepare&sessionInvalid=true"
                }}
            }};
            let store = {{}};
            const storageMock = {{
                get: (keys, cb) => {{
                    const res = {{}};
                    keys.forEach(k => {{ if (k in store) res[k] = store[k]; }});
                    if (cb) cb(res);
                    return Promise.resolve(res);
                }},
                set: (items, cb) => {{
                    Object.assign(store, items);
                    if (cb) cb();
                    return Promise.resolve();
                }}
            }};

            await engine.iniciarCicloDowntime(doc, win, storageMock);

            const banner = doc.getElementById("cati-downtime-banner");
            const activeInc = store.cati_downtime_active;

            return {{
                hasBanner: !!banner,
                activeStatus: activeInc ? activeInc.status : null,
                activeMotivo: activeInc ? activeInc.motivo : null
            }};
        }}
        run().then(res => {{
            process.stdout.write(JSON.stringify(res));
            process.exit(0);
        }}).catch(e => {{
            console.error(e);
            process.exit(1);
        }});
        """
        res = self.run_node(snippet)
        self.assertTrue(res["hasBanner"])
        self.assertEqual(res["activeStatus"], "ativo")
        self.assertIn("Sessão Expirada", res["activeMotivo"])

    def test_iniciar_ciclo_downtime_restabelecimento(self):
        """iniciarCicloDowntime detecta restabelecimento, finaliza incidente no storage e exibe modal de SLA."""
        snippet = f"""
        {self.mock_dom_js()}
        async function run() {{
            const doc = createMockDocument();
            const authEl = doc.createElement("div");
            authEl.id = "contentPaneTitle";
            authEl.innerText = "Painel Principal";
            doc.body.appendChild(authEl);

            const win = {{
                location: {{
                    href: "https://cati.tjce.jus.br/assystweb/application.do#tab=1"
                }}
            }};

            let store = {{
                cati_downtime_active: {{
                    id: "down_rec",
                    inicio: Date.now() - 60000,
                    dataStr: "16/10/2026",
                    horaInicio: "10:00:00",
                    motivo: "Falta de Licenças Disponíveis",
                    status: "ativo"
                }},
                cati_downtime_history: []
            }};
            const storageMock = {{
                get: (keys, cb) => {{
                    const res = {{}};
                    keys.forEach(k => {{ if (k in store) res[k] = store[k]; }});
                    if (cb) cb(res);
                    return Promise.resolve(res);
                }},
                set: (items, cb) => {{
                    Object.assign(store, items);
                    if (cb) cb();
                    return Promise.resolve();
                }},
                remove: (keys, cb) => {{
                    const arr = Array.isArray(keys) ? keys : [keys];
                    arr.forEach(k => delete store[k]);
                    if (cb) cb();
                    return Promise.resolve();
                }}
            }};

            await engine.iniciarCicloDowntime(doc, win, storageMock);

            const modal = doc.getElementById("cati-downtime-modal-restabelecido");
            const activeCleared = !store.cati_downtime_active;
            const historyCount = store.cati_downtime_history.length;

            return {{
                hasModal: !!modal,
                activeCleared,
                historyCount
            }};
        }}
        run().then(res => {{
            process.stdout.write(JSON.stringify(res));
            process.exit(0);
        }}).catch(e => {{
            console.error(e);
            process.exit(1);
        }});
        """
        res = self.run_node(snippet)
        self.assertTrue(res["hasModal"])
        self.assertTrue(res["activeCleared"])
        self.assertEqual(res["historyCount"], 1)

    def test_popup_html_contains_downtime_elements(self):
        """popup.html deve conter a seção de quedas do Assyst, resumo diário, lista e botão de exportar relatório."""
        self.assertTrue(os.path.exists(self.popup_html_path), f"Arquivo não encontrado: {self.popup_html_path}")
        with open(self.popup_html_path, "r", encoding="utf-8") as f:
            html = f.read()

        elementos_obrigatorios = [
            "cati-downtime-section",
            "cati-downtime-summary",
            "btn-export-downtime-report",
            "cati-downtime-list"
        ]
        for el in elementos_obrigatorios:
            self.assertIn(el, html, f"Elemento obrigatório ausente em popup.html: {el}")

    def test_popup_js_contains_downtime_loader(self):
        """popup.js deve conter a lógica de carregamento de histórico de quedas e exportação de relatório."""
        self.assertTrue(os.path.exists(self.popup_js_path), f"Arquivo não encontrado: {self.popup_js_path}")
        with open(self.popup_js_path, "r", encoding="utf-8") as f:
            js = f.read()

        self.assertIn("cati-downtime-summary", js, "popup.js deve referenciar cati-downtime-summary")
        self.assertIn("btn-export-downtime-report", js, "popup.js deve referenciar btn-export-downtime-report")
        self.assertIn("cati_downtime_history", js, "popup.js deve consultar cati_downtime_history no storage")

if __name__ == "__main__":
    unittest.main()
