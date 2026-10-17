import unittest
import os
import json
import subprocess
import zipfile

class TestBacklog1N(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        cls.backlog_dir = os.path.join(cls.root_dir, "backlog-1n")
        cls.manifest_path = os.path.join(cls.backlog_dir, "manifest.json")
        cls.js_path = os.path.join(cls.backlog_dir, "content", "scanner-1n.js")
        cls.css_path = os.path.join(cls.backlog_dir, "content", "scanner-1n.css")
        cls.build_script = os.path.join(cls.backlog_dir, "build.py")

    def test_manifest_structure(self):
        """Verifica a estrutura e metadados do manifest.json da extensão Backlog 1N"""
        self.assertTrue(os.path.isfile(self.manifest_path), "manifest.json deve existir em backlog-1n/")
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("manifest_version"), 3)
        self.assertIn("1N", manifest.get("name", ""))
        self.assertEqual(manifest.get("version"), "1.0.1")
        self.assertIn("https://cati.tjce.jus.br/*", manifest.get("host_permissions", []))

        content_scripts = manifest.get("content_scripts", [])
        self.assertTrue(len(content_scripts) > 0)
        cs = content_scripts[0]
        self.assertIn("https://cati.tjce.jus.br/*", cs.get("matches", []))
        self.assertIn("content/scanner-1n.js", cs.get("js", []))
        self.assertIn("content/scanner-1n.css", cs.get("css", []))

        gecko_id = manifest.get("browser_specific_settings", {}).get("gecko", {}).get("id", "")
        self.assertIn("1n", gecko_id.lower())

    def test_elegibilidade_1n_cati_estrita(self):
        """A extensão deve buscar estritamente pausas feitas pela equipe 1N CATI"""
        self.assertTrue(os.path.isfile(self.js_path), "scanner-1n.js deve existir")
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
        const fn = window.__cati1nVerificarElegibilidade;
        if (!fn) {{
            process.stdout.write(JSON.stringify({{ error: "funcao_nao_encontrada" }}));
            process.exit(0);
        }}

        const agora = new Date("2026-10-13T12:00:00Z");

        // Caso 1: Pausado há 8 dias por '1N CATI' sem retorno posterior -> ELEGÍVEL
        const acoes1 = [
            {{ type: "Atribuição Interna", dateRaw: "04/10/2026 10:00", actingDept: "1N CATI" }},
            {{ type: "Aguardando Info do Usuário", dateRaw: "05/10/2026 11:00", actingDept: "1N CATI" }}
        ];
        const res1 = fn(acoes1, agora);

        // Caso 2: Pausado há 3 dias por '1N CATI' -> NÃO elegível (< 7 dias)
        const acoes2 = [
            {{ type: "Aguardando Info do Usuário", dateRaw: "10/10/2026 11:00", actingDept: "1N CATI" }}
        ];
        const res2 = fn(acoes2, agora);

        // Caso 3: Pausado há 10 dias por '1N CATI', mas usuário respondeu depois -> NÃO elegível
        const acoes3 = [
            {{ type: "Aguardando Info do Usuário", dateRaw: "01/10/2026 10:00", actingDept: "1N CATI" }},
            {{ type: "Email Recebido do Usuário", dateRaw: "11/10/2026 15:00" }}
        ];
        const res3 = fn(acoes3, agora);

        // Caso 4: Pausado há 10 dias, MAS por '2N CATI Remoto' -> NÃO elegível para o 1N
        const acoes4 = [
            {{ type: "Aguardando Info do Usuário", dateRaw: "01/10/2026 10:00", actingDept: "2N CATI Remoto" }}
        ];
        const res4 = fn(acoes4, agora);

        // Caso 5: Pausado há 10 dias, MAS por '3N Windows' -> NÃO elegível para o 1N
        const acoes5 = [
            {{ type: "Aguardando Info do Usuário", dateRaw: "01/10/2026 10:00", actingDept: "3N CATI Windows" }}
        ];
        const res5 = fn(acoes5, agora);

        // Caso 6: Variação de departamento do 1N ('Atendimento 1N' ou '1N CATI Central') -> ELEGÍVEL
        const acoes6 = [
            {{ type: "Aguardando Info do Usuário", dateRaw: "05/10/2026 10:00", actingDept: "1N CATI Central" }}
        ];
        const res6 = fn(acoes6, agora);

        process.stdout.write(JSON.stringify({{ res1, res2, res3, res4, res5, res6 }}));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertNotIn("error", res, "Função __cati1nVerificarElegibilidade deve estar exportada no window")
        self.assertTrue(res["res1"]["elegivel"])
        self.assertGreaterEqual(res["res1"]["diasDecorridos"], 7)
        self.assertFalse(res["res2"]["elegivel"], "Pausa inferior a 7 dias não deve ser elegível")
        self.assertFalse(res["res3"]["elegivel"], "Chamado com resposta posterior do usuário não deve ser elegível")
        self.assertFalse(res["res4"]["elegivel"], "Pausa feita pelo 2N CATI Remoto NÃO deve ser elegível para o 1N")
        self.assertFalse(res["res5"]["elegivel"], "Pausa feita pelo 3N NÃO deve ser elegível para o 1N")
        self.assertTrue(res["res6"]["elegivel"], "Variação válida de departamento 1N deve ser aceita")

    def test_modo_turbo_configurado(self):
        """O scanner do 1N deve operar com velocidade no modo turbo"""
        self.assertTrue(os.path.isfile(self.js_path))
        with open(self.js_path, "r", encoding="utf-8") as f:
            code = f.read()

        self.assertIn("turbo", code.lower())
        self.assertIn("pollMs: 50", code)
        self.assertIn("waitBetweenTickets: 50", code)

    def test_botoes_e_classes_css(self):
        """O CSS deve estilizar o botão flutuante e a janela modal da extensão do 1N"""
        self.assertTrue(os.path.isfile(self.css_path))
        with open(self.css_path, "r", encoding="utf-8") as f:
            css = f.read()

        self.assertIn("#cati-1n-trigger-waiting-info", css)
        self.assertIn(".cati-1n-modal-panel", css)
        self.assertIn(".cati-1n-card", css)

    def test_build_package_1n(self):
        """O script build.py deve empacotar a extensão em um .xpi funcional"""
        self.assertTrue(os.path.isfile(self.build_script), "build.py deve existir em backlog-1n/")
        res = subprocess.run(["python3", self.build_script], cwd=self.backlog_dir, capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Erro ao rodar build.py: {res.stderr}")

        xpi_path = os.path.join(self.backlog_dir, "backlog-1n-cati.xpi")
        self.assertTrue(os.path.isfile(xpi_path), "Arquivo backlog-1n-cati.xpi deve ter sido gerado")

        with zipfile.ZipFile(xpi_path, "r") as z:
            names = z.namelist()
            self.assertIn("manifest.json", names)
            self.assertIn("content/scanner-1n.js", names)
            self.assertIn("content/scanner-1n.css", names)

    def test_nao_cancelar_varredura_ao_criar_painel(self):
        """criarPainelBase e fecharPainel não devem setar cancelScan como true, o que causava cancelamento prematuro"""
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

        const elements = [];
        global.document = {{
            querySelector: (sel) => {{
                if (sel === ".cati-1n-modal-overlay") return elements[0] || null;
                return null;
            }},
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: (tag) => {{
                const el = {{
                    tag,
                    style: {{}},
                    className: "",
                    innerHTML: "",
                    textContent: "",
                    children: [],
                    appendChild: (c) => el.children.push(c),
                    addEventListener: () => {{}},
                    querySelector: () => ({{ innerText: "", textContent: "", click: () => {{}} }}),
                    remove: () => {{
                        const idx = elements.indexOf(el);
                        if (idx >= 0) elements.splice(idx, 1);
                    }}
                }};
                return el;
            }},
            body: {{
                appendChild: (el) => {{ elements.push(el); }}
            }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        eval(code);

        const hasPrematureCancelInFechar = /function\\s+fecharPainel\\s*\\(\\)\\s*\\{{[^\\}}]*cancelScan\\s*=\\s*true/.test(code);
        process.stdout.write(JSON.stringify({{ hasPrematureCancelInFechar }}));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertFalse(res["hasPrematureCancelInFechar"], "fecharPainel() NÃO deve setar cancelScan = true pois é chamado por criarPainelBase no início da varredura!")

    def test_iniciar_varredura_executa_sem_cancelamento(self):
        """Simula a execução de iniciarVarredura e verifica que ela processa as linhas da grade sem cancelar indevidamente"""
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

        let toastMessage = "";
        const elementsCreated = [];

        global.document = {{
            querySelector: (sel) => {{
                if (sel === ".dojoxGridMasterView") {{
                    return {{
                        querySelectorAll: () => [{{}}],
                        querySelector: (sub) => {{
                            if (sub.includes(".rowId0")) {{
                                return {{
                                    querySelector: (c) => ({{ innerText: "2150000" }}),
                                    dispatchEvent: () => {{}}
                                }};
                            }}
                            return null;
                        }}
                    }};
                }}
                if (sel === "#contentPaneTitle") return {{ innerText: "2150000 - Suporte 1N" }};
                if (sel === ".cati-1n-modal-overlay") return elementsCreated.find(e => e.className === "cati-1n-modal-overlay") || null;
                return null;
            }},
            querySelectorAll: (sel) => {{
                if (sel === ".tabLabel") return [{{ textContent: "Ações", click: () => {{}} }}];
                if (sel.includes("actionGrid")) return [];
                return [];
            }},
            getElementById: () => null,
            createElement: (tag) => {{
                const el = {{
                    tag,
                    style: {{}},
                    className: "",
                    innerHTML: "",
                    textContent: "",
                    children: [],
                    appendChild: (c) => el.children.push(c),
                    addEventListener: () => {{}},
                    querySelector: () => ({{ innerText: "", textContent: "", style: {{}}, click: () => {{}} }}),
                    remove: () => {{
                        const idx = elementsCreated.indexOf(el);
                        if (idx >= 0) elementsCreated.splice(idx, 1);
                    }}
                }};
                elementsCreated.push(el);
                return el;
            }},
            body: {{
                appendChild: (el) => {{
                    if (el.className === "cati-1n-toast") {{
                        toastMessage = el.textContent;
                    }}
                    elementsCreated.push(el);
                }}
            }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        global.MouseEvent = class {{}};

        eval(code);

        (async () => {{
            await window.__cati1nIniciarVarredura();
            process.stdout.write(JSON.stringify({{ toastMessage }}));
        }})();
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertNotIn("cancelada pelo usuário", res.get("toastMessage", ""), "A varredura NÃO deve ser cancelada prematuramente pelo usuário!")

if __name__ == "__main__":
    unittest.main()
