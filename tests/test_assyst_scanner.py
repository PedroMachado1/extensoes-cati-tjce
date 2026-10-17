import unittest
import os
import subprocess
import json

class TestAssystScanner(unittest.TestCase):
    def setUp(self):
        self.js_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "assistente-2n-cati-remoto",
            "src",
            "content",
            "assyst-scanner.js"
        )
        self.assertTrue(os.path.exists(self.js_path), f"Arquivo não encontrado: {self.js_path}")

    def run_eval_is_lista_geral(self, href, hash_val, elements_found, active_tab_text=""):
        """Executa isListaGeralChamados em ambiente simulado via Node.js"""
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.js_path)}, "utf8");

        global.chrome = {{
            runtime: {{ onMessage: {{ addListener: () => {{}} }}, sendMessage: () => {{}} }},
            storage: {{ local: {{ get: () => {{}}, set: () => {{}} }} }}
        }};
        global.MutationObserver = class {{ observe() {{}} }};
        global.window = {{
            location: {{
                origin: "https://cati.tjce.jus.br",
                hostname: "cati.tjce.jus.br",
                href: {json.dumps(href)},
                hash: {json.dumps(hash_val)}
            }},
            addEventListener: () => {{}}
        }};

        const elements = {json.dumps(elements_found)};
        const activeTab = {json.dumps(active_tab_text)};

        global.document = {{
            querySelector: (sel) => {{
                if (sel.includes("dijitTabChecked") && activeTab) {{
                    return {{ innerText: activeTab }};
                }}
                for (const [key, val] of Object.entries(elements)) {{
                    if (sel.includes(key)) {{
                        return val;
                    }}
                }}
                return null;
            }},
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({{ style: {{}}, addEventListener: () => {{}}, appendChild: () => {{}} }}),
            body: {{ appendChild: () => {{}} }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        eval(code);
        process.stdout.write(JSON.stringify(window.__catiIsListaGeralChamados()));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        return json.loads(proc.stdout)

    def test_fila_geral_with_ticket_preview_must_be_true(self):
        """Na fila geral com preview do chamado carregado no painel, deve retornar True"""
        res = self.run_eval_is_lista_geral(
            href="https://cati.tjce.jus.br/assystweb/application.do#eventsearch%2Fmanage.do",
            hash_val="#eventsearch%2Fmanage.do",
            elements_found={
                "contentPaneTitle": {"innerText": "2147542"},
                "ManageEventForm_ES1_affectedUser_textNode": {},
                "dojoxGridMasterView": {"offsetWidth": 800, "offsetHeight": 600}
            },
            active_tab_text="Pesquisa de Eventos"
        )
        self.assertTrue(res, "isListaGeralChamados deve retornar True na fila geral mesmo com preview de chamado carregado")

    def test_inside_ticket_screen_must_be_false(self):
        """Dentro da tela cheia de chamado (displayevent), deve retornar False"""
        res = self.run_eval_is_lista_geral(
            href="https://cati.tjce.jus.br/assystweb/application.do#displayevent%2FdisplayEvent.do",
            hash_val="#displayevent%2FdisplayEvent.do",
            elements_found={
                "contentPaneTitle": {"innerText": "2147542"}
            },
            active_tab_text="Chamado 2147542"
        )
        self.assertFalse(res, "isListaGeralChamados deve retornar False quando dentro dos detalhes de um chamado")

    def test_multi_tab_ticket_active_must_be_false(self):
        """Em ambiente multi-abas do Assyst, quando a aba ativa for um chamado, deve retornar False"""
        res = self.run_eval_is_lista_geral(
            href="https://cati.tjce.jus.br/assystweb/application.do",
            hash_val="",
            elements_found={
                "contentPaneTitle": {"innerText": "2147542"}
            },
            active_tab_text="2147542"
        )
        self.assertFalse(res, "isListaGeralChamados deve retornar False quando a aba ativa for um chamado")

    def test_fila_pessoal_tecnico_detection(self):
        """isFilaPessoalTecnico deve retornar True apenas quando queryProfileId=4 estiver presente na URL/hash"""
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.js_path)}, "utf8");

        global.chrome = {{
            runtime: {{ onMessage: {{ addListener: () => {{}} }}, sendMessage: () => {{}} }},
            storage: {{ local: {{ get: () => {{}}, set: () => {{}} }} }}
        }};
        global.MutationObserver = class {{ observe() {{}} }};
        global.document = {{
            querySelector: () => ({{ offsetWidth: 800, offsetHeight: 600 }}),
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({{ style: {{}}, addEventListener: () => {{}}, appendChild: () => {{}} }}),
            body: {{ appendChild: () => {{}} }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        function testUrl(href, hashVal) {{
            global.window = {{
                location: {{
                    origin: "https://cati.tjce.jus.br",
                    hostname: "cati.tjce.jus.br",
                    href: href,
                    hash: hashVal
                }},
                addEventListener: () => {{}}
            }};
            eval(code);
            return window.__catiIsFilaPessoalTecnico ? window.__catiIsFilaPessoalTecnico() : null;
        }}

        const urlFilaPessoal = "https://cati.tjce.jus.br/assystweb/application.do#eventsearch/EventSearchDelegatingDispatchAction.do?dispatch=monitorInit&ajaxMonitor=false&queryProfileForm.columnProfileId=886&queryProfileForm.queryProfileId=4";
        const urlFilaGeral = "https://cati.tjce.jus.br/assystweb/application.do#eventsearch/EventSearchDelegatingDispatchAction.do?dispatch=monitorInit&ajaxMonitor=false&queryProfileForm.columnProfileId=886&queryProfileForm.queryProfileId=1";
        const urlBacklogPausados = "https://cati.tjce.jus.br/assystweb/application.do#eventsearch%2FEventSearchDelegatingDispatchAction.do%3Fdispatch%3DloadQuery%26showInMonitor%3Dtrue%26context%3Dselect%26queryProfileForm.queryProfileId%3D4989%26queryProfileForm.columnProfileId%3D886";

        const res = {{
            pessoal: testUrl(urlFilaPessoal, "#eventsearch/EventSearchDelegatingDispatchAction.do?dispatch=monitorInit&ajaxMonitor=false&queryProfileForm.columnProfileId=886&queryProfileForm.queryProfileId=4"),
            geral: testUrl(urlFilaGeral, "#eventsearch/EventSearchDelegatingDispatchAction.do?dispatch=monitorInit&ajaxMonitor=false&queryProfileForm.columnProfileId=886&queryProfileForm.queryProfileId=1"),
            backlogPausados: testUrl(urlBacklogPausados, "#eventsearch%2FEventSearchDelegatingDispatchAction.do%3Fdispatch%3DloadQuery%26showInMonitor%3Dtrue%26context%3Dselect%26queryProfileForm.queryProfileId%3D4989%26queryProfileForm.columnProfileId%3D886")
        }};
        process.stdout.write(JSON.stringify(res));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertTrue(res["pessoal"], "Deve identificar a fila pessoal com queryProfileId=4")
        self.assertTrue(res["backlogPausados"], "Deve identificar o backlog de pausados com queryProfileId=4989")
        self.assertFalse(res["geral"], "Não deve identificar como fila pessoal quando queryProfileId != 4 ou 4989")

    def test_verificar_elegibilidade_aguardando_info_7_dias(self):
        """Verifica a regra de 7+ dias decorridos após pausa 'Aguardando Info do Usuário'"""
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.js_path)}, "utf8");

        global.chrome = {{
            runtime: {{ onMessage: {{ addListener: () => {{}} }}, sendMessage: () => {{}} }},
            storage: {{ local: {{ get: () => {{}}, set: () => {{}} }} }}
        }};
        global.MutationObserver = class {{ observe() {{}} }};
        global.window = {{
            location: {{ origin: "https://cati.tjce.jus.br", hostname: "cati.tjce.jus.br", href: "", hash: "" }},
            addEventListener: () => {{}}
        }};
        global.document = {{
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({{ style: {{}}, addEventListener: () => {{}}, appendChild: () => {{}} }}),
            body: {{ appendChild: () => {{}} }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        eval(code);
        const fn = window.__catiVerificarElegibilidadeAguardandoInfo;
        if (!fn) {{
            process.stdout.write(JSON.stringify({{ error: "funcao_nao_encontrada" }}));
            process.exit(0);
        }}

        const agora = new Date("2026-10-07T12:00:00Z");

        // Caso 1: Pausado há 8 dias por 2N CATI Remoto sem retorno posterior -> Elegível (8 dias)
        const acoes1 = [
            {{ type: "Atribuição Interna", dateRaw: "28/09/2026 10:00", actingDept: "2N CATI Remoto" }},
            {{ type: "Aguardando Info do Usuário", dateRaw: "29/09/2026 11:00", actingDept: "2N CATI Remoto" }}
        ];
        const res1 = fn(acoes1, agora);

        // Caso 2: Pausado há 3 dias -> Não elegível
        const acoes2 = [
            {{ type: "Atribuição Interna", dateRaw: "01/10/2026 10:00", actingDept: "2N CATI Remoto" }},
            {{ type: "Aguardando Info do Usuário", dateRaw: "04/10/2026 11:00", actingDept: "2N CATI Remoto" }}
        ];
        const res2 = fn(acoes2, agora);

        // Caso 3: Pausado há 10 dias, mas depois o usuário respondeu -> Não elegível
        const acoes3 = [
            {{ type: "Aguardando Info do Usuário", dateRaw: "25/09/2026 10:00", actingDept: "2N CATI Remoto" }},
            {{ type: "Email Recebido do Usuário", dateRaw: "06/10/2026 15:00" }}
        ];
        const res3 = fn(acoes3, agora);

        // Caso 4: Já resolvido -> Não elegível
        const acoes4 = [
            {{ type: "Aguardando Info do Usuário", dateRaw: "20/09/2026 10:00", actingDept: "2N CATI Remoto" }},
            {{ type: "Resolvido", dateRaw: "25/09/2026 11:00" }}
        ];
        const res4 = fn(acoes4, agora);

        // Caso 5: Pausado há 10 dias, MAS por outro departamento (ex: 1N CATI Central) -> NÃO elegível para o 2N
        const acoes5 = [
            {{ type: "Atribuição Interna", dateRaw: "20/09/2026 10:00", actingDept: "1N Central" }},
            {{ type: "Aguardando Info do Usuário", dateRaw: "25/09/2026 10:00", actingDept: "1N Central" }}
        ];
        const res5 = fn(acoes5, agora);

        process.stdout.write(JSON.stringify({{ res1, res2, res3, res4, res5 }}));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertNotIn("error", res, "Função __catiVerificarElegibilidadeAguardandoInfo deve estar definida")
        self.assertTrue(res["res1"]["elegivel"])
        self.assertGreaterEqual(res["res1"]["diasDecorridos"], 7)
        self.assertFalse(res["res2"]["elegivel"])
        self.assertFalse(res["res3"]["elegivel"])
        self.assertFalse(res["res4"]["elegivel"])
        self.assertFalse(res["res5"]["elegivel"], "Pausa feita por outro departamento não deve ser elegível para o 2N")

    def test_botoes_flutuantes_dimensoes_padronizadas(self):
        """Os botões flutuantes Localizar Agendados e Aguardando Info devem possuir dimensões padronizadas e idênticas"""
        css_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "assistente-2n-cati-remoto",
            "src",
            "content",
            "assyst-scanner.css"
        )
        with open(css_path, "r", encoding="utf-8") as f:
            css_code = f.read()

        self.assertIn("#cati-floating-trigger", css_code)
        self.assertIn("#cati-floating-trigger-waiting-info", css_code)
        self.assertIn("width: 220px;", css_code)
        self.assertIn("height: 38px;", css_code)
        self.assertIn("box-sizing: border-box;", css_code)

    def test_abrir_ticket_em_nova_guia(self):
        """Botão 'Abrir no Assyst' na lista de 7+ dias deve abrir o chamado em nova guia via window.open"""
        with open(self.js_path, "r", encoding="utf-8") as f:
            js_code = f.read()

        self.assertIn("window.open", js_code, "Deve utilizar window.open para abrir em nova guia")
        self.assertIn("_blank", js_code, "Deve abrir com target _blank")
        self.assertIn("event.lookup.eventRefRange", js_code, "URL deve conter parâmetro de busca do chamado")

    def test_obter_limite_varredura_grade(self):
        """Identifica a opção de filtro selecionada no paginador do Assyst (25, 50, 100 ou Todos)"""
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.js_path)}, "utf8");

        global.chrome = {{
            runtime: {{ onMessage: {{ addListener: () => {{}} }}, sendMessage: () => {{}} }},
            storage: {{ local: {{ get: () => {{}}, set: () => {{}} }} }}
        }};
        global.MutationObserver = class {{ observe() {{}} }};
        global.window = {{
            location: {{ origin: "https://cati.tjce.jus.br", hostname: "cati.tjce.jus.br", href: "", hash: "" }},
            addEventListener: () => {{}}
        }};

        let mockTextoSwitch = "25";
        let mockExisteElemento = true;

        global.document = {{
            querySelector: (sel) => {{
                if (sel.includes("sizeSwitchDiv") || sel.includes("dojoxGridActivedSwitch") || sel.includes("dojoxGridPaginator")) {{
                    if (!mockExisteElemento) return null;
                    return {{ innerText: mockTextoSwitch, textContent: mockTextoSwitch }};
                }}
                return null;
            }},
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({{ style: {{}}, addEventListener: () => {{}}, appendChild: () => {{}} }}),
            body: {{ appendChild: () => {{}} }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        eval(code);
        const fn = window.__catiObterLimiteVarreduraGrade;
        if (!fn) {{
            process.stdout.write(JSON.stringify({{ error: "funcao_nao_encontrada" }}));
            process.exit(0);
        }}

        mockTextoSwitch = "25";
        const r25 = fn();

        mockTextoSwitch = "50";
        const r50 = fn();

        mockTextoSwitch = "100";
        const r100 = fn();

        mockTextoSwitch = "Todos";
        const rTodos = fn();

        mockExisteElemento = false;
        const rFallback = fn();

        process.stdout.write(JSON.stringify({{ r25, r50, r100, rTodos, rFallback }}));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertNotIn("error", res, "Função __catiObterLimiteVarreduraGrade deve estar definida no window")
        
        self.assertEqual(res["r25"]["limite"], 25)
        self.assertFalse(res["r25"]["isAltoVolume"])

        self.assertEqual(res["r50"]["limite"], 50)
        self.assertFalse(res["r50"]["isAltoVolume"])

        self.assertEqual(res["r100"]["limite"], 100)
        self.assertTrue(res["r100"]["isAltoVolume"])

        self.assertEqual(res["rTodos"]["rotulo"], "Todos")
        self.assertTrue(res["rTodos"]["isAltoVolume"])

        self.assertEqual(res["rFallback"]["limite"], 25)
        self.assertFalse(res["rFallback"]["isAltoVolume"])

    def test_verificar_elegibilidade_equipe_customizada(self):
        """Permite verificar elegibilidade com equipe personalizada das configurações"""
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.js_path)}, "utf8");

        global.chrome = {{
            runtime: {{ onMessage: {{ addListener: () => {{}} }}, sendMessage: () => {{}} }},
            storage: {{ local: {{ get: () => {{}}, set: () => {{}} }} }}
        }};
        global.MutationObserver = class {{ observe() {{}} }};
        global.window = {{
            location: {{ origin: "https://cati.tjce.jus.br", hostname: "cati.tjce.jus.br", href: "", hash: "" }},
            addEventListener: () => {{}}
        }};
        global.document = {{
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({{ style: {{}}, addEventListener: () => {{}}, appendChild: () => {{}} }}),
            body: {{ appendChild: () => {{}} }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        eval(code);
        const fn = window.__catiVerificarElegibilidadeAguardandoInfo;
        const agora = new Date("2026-10-07T12:00:00Z");

        const acoes1N = [
            {{ type: "Atribuição Interna", dateRaw: "20/09/2026 10:00", actingDept: "1N Central" }},
            {{ type: "Aguardando Info do Usuário", dateRaw: "25/09/2026 10:00", actingDept: "1N Central" }}
        ];

        // Com equipe padrão (2N CATI Remoto) -> Não elegível
        const resPadrao = fn(acoes1N, agora, "2N CATI Remoto");

        // Com equipe customizada configurada para "1N Central" -> Elegível
        const resCustom = fn(acoes1N, agora, "1N Central");

        process.stdout.write(JSON.stringify({{ resPadrao, resCustom }}));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertFalse(res["resPadrao"]["elegivel"], "Pausa do 1N não deve ser elegível para o 2N padrão")
        self.assertTrue(res["resCustom"]["elegivel"], "Pausa do 1N deve ser elegível quando a equipe customizada for 1N Central")

    def test_configuracao_waiting_info_dept_em_popup_e_taskstore(self):
        """Verifica a presença do campo de configuração de equipe no popup, taskStore e CSS de alerta de volume"""
        popup_html_path = os.path.join(os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "popup", "popup.html")
        popup_js_path = os.path.join(os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "popup", "popup.js")
        task_store_path = os.path.join(os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "storage", "taskStore.js")
        scanner_css_path = os.path.join(os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "content", "assyst-scanner.css")

        with open(popup_html_path, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn("setting-waiting-info-dept", html, "popup.html deve conter input setting-waiting-info-dept")

        with open(popup_js_path, "r", encoding="utf-8") as f:
            js = f.read()
        self.assertIn("setting-waiting-info-dept", js, "popup.js deve vincular o elemento setting-waiting-info-dept")
        self.assertIn("waitingInfoDept", js, "popup.js deve manipular waitingInfoDept")

        with open(task_store_path, "r", encoding="utf-8") as f:
            store = f.read()
        self.assertIn('waitingInfoDept: "2N CATI Remoto"', store, "taskStore deve definir waitingInfoDept por padrão")

        with open(scanner_css_path, "r", encoding="utf-8") as f:
            css = f.read()
        self.assertIn(".cati-volume-alert", css, "assyst-scanner.css deve estilizar o alerta de volume")

    def test_botao_aguardando_info_visivel_em_qualquer_lista_geral(self):
        """O botão Aguardando Info (7+ Dias) deve ser visível em qualquer lista/pesquisa geral de chamados, não restrito a IDs 4 ou 4989"""
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.js_path)}, "utf8");

        global.chrome = {{
            runtime: {{ onMessage: {{ addListener: () => {{}} }}, sendMessage: () => {{}} }},
            storage: {{ local: {{ get: () => {{}}, set: () => {{}} }} }}
        }};
        global.MutationObserver = class {{ observe() {{}} }};
        global.window = {{
            location: {{
                origin: "https://cati.tjce.jus.br",
                hostname: "cati.tjce.jus.br",
                href: "https://cati.tjce.jus.br/assystweb/application.do#eventsearch%2Fmanage.do?queryProfileId=999",
                hash: "#eventsearch%2Fmanage.do?queryProfileId=999"
            }},
            addEventListener: () => {{}}
        }};

        const elements = {{}};
        global.document = {{
            querySelector: (sel) => {{
                if (sel.includes("eventsearch") || sel.includes("dojoxGridMasterView")) {{
                    return {{ offsetWidth: 800, offsetHeight: 600 }};
                }}
                return null;
            }},
            querySelectorAll: () => [],
            getElementById: (id) => elements[id] || null,
            createElement: (tag) => {{
                const el = {{
                    id: "",
                    style: {{ display: "none" }},
                    addEventListener: () => {{}},
                    appendChild: () => {{}},
                    setAttribute: () => {{}}
                }};
                return el;
            }},
            body: {{
                appendChild: (el) => {{
                    if (el.id) elements[el.id] = el;
                }}
            }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        eval(code);
        if (typeof window.__catiCriarBotoesFlutuantes === "function") {{
            window.__catiCriarBotoesFlutuantes();
        }}

        const btnAgendados = elements["cati-floating-trigger"];
        const btn7Dias = elements["cati-floating-trigger-waiting-info"];

        process.stdout.write(JSON.stringify({{
            agendadosDisplay: btnAgendados?.style?.display,
            dias7Display: btn7Dias?.style?.display
        }}));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertEqual(res["agendadosDisplay"], "inline-flex", "Botão Localizar Agendados deve estar visível")
        self.assertEqual(res["dias7Display"], "inline-flex", "Botão Aguardando Info deve estar visível em qualquer lista geral do Assyst")

if __name__ == "__main__":
    unittest.main()



