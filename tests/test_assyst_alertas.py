import unittest
import os
import subprocess
import json

class TestAssystAlertas(unittest.TestCase):
    def setUp(self):
        self.js_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "assistente-2n-cati-remoto",
            "src",
            "content",
            "assyst-alertas.js"
        )
        self.assertTrue(os.path.exists(self.js_path), f"Arquivo não encontrado: {self.js_path}")

    def run_eval(self, href, hash_val, elements_found, active_tab_text=""):
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.js_path)}, "utf8");

        global.chrome = {{
            runtime: {{ onMessage: {{ addListener: () => {{}} }}, sendMessage: () => {{}} }},
            storage: {{ local: {{ get: () => {{}}, set: () => {{}} }} }}
        }};
        global.MutationObserver = class {{ observe() {{}} }};
        global.setInterval = () => {{}};
        global.setTimeout = (fn) => fn();
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
        const createdElements = [];

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
            getElementById: (id) => {{
                if (elements[id]) {{
                    const el = elements[id];
                    if (!el.querySelector) el.querySelector = () => null;
                    if (!el.appendChild) el.appendChild = (child) => {{ createdElements.push(child); }};
                    if (!el.insertBefore) el.insertBefore = (child) => {{ createdElements.push(child); }};
                    return el;
                }}
                return null;
            }},
            createElement: (tag) => {{
                const el = {{ tag, id: "", className: "", innerHTML: "", style: {{}}, appendChild: () => {{}}, insertBefore: () => {{}} }};
                createdElements.push(el);
                return el;
            }},
            body: {{
                appendChild: (el) => {{ createdElements.push(el); }},
                insertBefore: (el) => {{ createdElements.push(el); }}
            }},
            addEventListener: () => {{}},
            readyState: "complete"
        }};

        eval(code);

        // Check if base notification, btn-copiar-ficha, and menu toggle were created
        const baseNotif = createdElements.find(e => e.id === "cati-notificacao-sem-base");
        const btnFicha = createdElements.find(e => e.id === "cati-btn-copiar-ficha");
        const menuToggle = createdElements.find(e => e.id === "cati-assyst-menu-toggle");
        process.stdout.write(JSON.stringify({{
            baseNotifCreated: !!baseNotif,
            btnFichaCreated: !!btnFicha,
            menuToggleCreated: !!menuToggle
        }}));
        process.exit(0);
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        return json.loads(proc.stdout)

    def test_fila_geral_must_never_show_base_notification(self):
        """Na fila geral de chamados (eventsearch), o lembrete de base de conhecimento NUNCA deve ser exibido"""
        res = self.run_eval(
            href="https://cati.tjce.jus.br/assystweb/application.do#eventsearch%2Fmanage.do",
            hash_val="#eventsearch%2Fmanage.do",
            elements_found={
                "contentPaneTitle": {"innerText": "2147542"},
                "contentPane": {},
                "ManageEventForm_ES1_affectedUser_textNode": {}
            },
            active_tab_text="Pesquisa de Eventos"
        )
        self.assertFalse(res["baseNotifCreated"], "Lembrete de base NÃO deve ser criado na fila geral")
        self.assertFalse(res["btnFichaCreated"], "Botão copiar ficha NÃO deve ser exibido na fila geral")

    def test_inside_ticket_without_base_shows_notification_in_proper_container(self):
        """Dentro do chamado sem base atribuída, o lembrete deve ser criado no container de ações sugeridas"""
        res = self.run_eval(
            href="https://cati.tjce.jus.br/assystweb/application.do#displayevent%2FdisplayEvent.do",
            hash_val="#displayevent%2FdisplayEvent.do",
            elements_found={
                "jukeboxsuggestedactionscontent": {}
            },
            active_tab_text="Chamado 2147542"
        )
        self.assertTrue(res["baseNotifCreated"], "Lembrete de base DEVE ser criado dentro do chamado quando sem base")
        self.assertTrue(res["btnFichaCreated"], "Botão copiar ficha DEVE ser criado dentro do chamado")

    def test_inside_ticket_with_base_does_not_show_notification(self):
        """Dentro do chamado com base atribuída, o lembrete NÃO deve ser exibido"""
        res = self.run_eval(
            href="https://cati.tjce.jus.br/assystweb/application.do#displayevent%2FdisplayEvent.do",
            hash_val="#displayevent%2FdisplayEvent.do",
            elements_found={
                "jukeboxKnowledgeContent": {"textContent": "KB10023 - Procedimento de E-mail"},
                "jukeboxsuggestedactionscontent": {}
            },
            active_tab_text="Chamado 2147542"
        )
        self.assertFalse(res["baseNotifCreated"], "Lembrete de base NÃO deve ser criado quando chamado possui base")
        self.assertTrue(res["btnFichaCreated"], "Botão copiar ficha DEVE ser criado dentro do chamado")

    def test_menu_toggle_created_and_toggle_behavior(self):
        """Menu hambúrguer toggle de controle dos botões deve ser criado e gerenciado"""
        res = self.run_eval(
            href="https://cati.tjce.jus.br/assystweb/application.do#displayevent%2FdisplayEvent.do",
            hash_val="#displayevent%2FdisplayEvent.do",
            elements_found={},
            active_tab_text="Chamado 2147542"
        )
        self.assertTrue(res["menuToggleCreated"], "Menu hambúrguer toggle DEVE ser criado na página")

        with open(self.js_path, "r", encoding="utf-8") as f:
            js_code = f.read()
        self.assertIn("cati-assyst-menu-toggle", js_code)
        self.assertIn("cati-buttons-minimized", js_code)
        self.assertIn("alternarMinimizacaoBotoes", js_code)

        css_path = os.path.join(os.path.dirname(self.js_path), "assyst-alertas.css")
        with open(css_path, "r", encoding="utf-8") as f:
            css_code = f.read()
        self.assertIn("#cati-assyst-menu-toggle", css_code)
        self.assertIn("cati-buttons-minimized", css_code)
        self.assertIn("body.cati-buttons-minimized #cati-floating-trigger-waiting-info", css_code)

if __name__ == "__main__":
    unittest.main()
