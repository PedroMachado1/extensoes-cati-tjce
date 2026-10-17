import unittest
import os
import re

class TestWhatsAppUI(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.join(
            os.path.dirname(__file__),
            "..",
            "assistente-2n-cati-remoto",
            "src",
            "content"
        )
        self.js_path = os.path.join(self.base_dir, "whatsapp-templates.js")
        self.css_path = os.path.join(self.base_dir, "whatsapp-templates.css")
        with open(self.js_path, "r", encoding="utf-8") as f:
            self.js_code = f.read()
        with open(self.css_path, "r", encoding="utf-8") as f:
            self.css_code = f.read()

    def test_active_ticket_elements_in_js(self):
        """Verifica a presença dos seletores e funções do card de chamado ativo no WhatsApp"""
        self.assertIn("cati-wa-active-ticket-card", self.js_code)
        self.assertIn("cati-wa-ticket-num", self.js_code)
        self.assertIn("cati-wa-ticket-subject", self.js_code)
        self.assertIn("cati-wa-ticket-clear", self.js_code)
        self.assertIn("cati-wa-ticket-badge", self.js_code)
        self.assertIn("chrome.storage.onChanged.addListener", self.js_code)
        self.assertIn("activeTicketContext", self.js_code)

    def test_variable_resolution_on_actions(self):
        """Verifica se processarVariaveis é chamado nos botões Inserir e Copiar"""
        self.assertRegex(self.js_code, r"inserirMensagemNoChat\(processarVariaveis\(")
        self.assertRegex(self.js_code, r"writeText\(processarVariaveis\(")

    def test_active_ticket_styles_in_css(self):
        """Verifica se os seletores CSS do card e badge foram declarados"""
        self.assertIn("#cati-wa-active-ticket-card", self.css_code)
        self.assertIn(".cati-wa-ticket-badge", self.css_code)
    def test_recent_tickets_in_js_and_css(self):
        """Verifica a presença da lista de chamados recentes e seus estilos no WhatsApp"""
        self.assertIn("cati_recent_tickets", self.js_code)
        self.assertIn("cati-wa-recent-tickets-chips", self.js_code)
        self.assertIn("renderizarChipsChamadosRecentes", self.js_code)
        self.assertIn(".cati-wa-recent-tickets-chips", self.css_code)
        self.assertIn(".cati-wa-recent-chip", self.css_code)

    def test_trigger_draggable_and_minimizable_in_js(self):
        """Verifica se o botão gatilho possui lógica de arraste vertical e persistência de posição"""
        self.assertIn("cati_wa_trigger_top", self.js_code)
        self.assertIn("configurarArrasteTrigger", self.js_code)
        self.assertIn("alternarMinimizarTrigger", self.js_code)

    def test_trigger_draggable_and_minimizable_in_css(self):
        """Verifica estilos CSS para o arraste (grab/grabbing) e modo minimizado do gatilho"""
        self.assertIn("cursor: grab", self.css_code)
        self.assertIn(".is-dragging", self.css_code)
        self.assertIn(".minimized", self.css_code)

if __name__ == "__main__":
    unittest.main()
