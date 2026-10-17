import unittest
import os
import re

class TestTemplateEditor(unittest.TestCase):
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

    def test_default_templates_contain_dynamic_tags(self):
        """Verifica se os modelos padrão utilizam as variáveis dinâmicas {saudacao}, {chamado} e {assunto}"""
        self.assertIn("{saudacao}", self.js_code)
        self.assertIn("{chamado}", self.js_code)
        self.assertIn("{assunto}", self.js_code)

    def test_chips_and_insertion_function_exist(self):
        """Verifica a presença dos chips e da função de inserção de tags no cursor da textarea"""
        self.assertIn("cati-wa-tag-chips", self.js_code)
        self.assertIn("inserirTagNaTextarea", self.js_code)
        self.assertIn("setRangeText", self.js_code)
        self.assertRegex(self.js_code, r'inserirTagNaTextarea\(["\']\{saudacao\}["\']\)')
        self.assertRegex(self.js_code, r'inserirTagNaTextarea\(["\']\{chamado\}["\']\)')
        self.assertRegex(self.js_code, r'inserirTagNaTextarea\(["\']\{assunto\}["\']\)')

    def test_chips_styling_in_css(self):
        """Verifica as regras CSS dos chips de atalho no editor"""
        self.assertIn(".cati-wa-tag-chips", self.css_code)
        self.assertIn(".cati-wa-tag-chip", self.css_code)

    def test_categories_and_tabs_in_js_and_css(self):
        """Verifica a presença das abas de categorias, seletores de formulário e estilos"""
        self.assertIn("cati-wa-category-tabs", self.js_code)
        self.assertIn("cati-wa-input-category", self.js_code)
        self.assertIn("cati-wa-card-category", self.js_code)
        self.assertIn(".cati-wa-category-tabs", self.css_code)
        self.assertIn(".cati-wa-category-tab", self.css_code)
        self.assertIn(".cati-wa-card-category", self.css_code)

if __name__ == "__main__":
    unittest.main()
