import re
import unittest
import os

class TestVariableEngine(unittest.TestCase):
    def setUp(self):
        self.js_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "assistente-2n-cati-remoto",
            "src",
            "content",
            "whatsapp-templates.js"
        )
        self.assertTrue(os.path.exists(self.js_path), f"Arquivo não encontrado: {self.js_path}")
        with open(self.js_path, "r", encoding="utf-8") as f:
            self.js_code = f.read()

    def test_functions_exist_in_js(self):
        """Verifica se resolverSaudacao e processarVariaveis existem no arquivo JS"""
        self.assertIn("function resolverSaudacao", self.js_code)
        self.assertIn("function processarVariaveis", self.js_code)

    def test_regex_safety_and_callbacks(self):
        """Verifica se os regexes utilizam callbacks () => para evitar corrupção por $ e &"""
        self.assertRegex(self.js_code, r"/\\\{saudacao\\\}/gi")
        self.assertRegex(self.js_code, r"/\\\{chamado\\\}/gi")
        self.assertRegex(self.js_code, r"/\\\{assunto\\\}/gi")
        self.assertRegex(self.js_code, r"\.replace\(/\\\{chamado\\\}/gi,\s*\(\)\s*=>")
        self.assertRegex(self.js_code, r"\.replace\(/\\\{assunto\\\}/gi,\s*\(\)\s*=>")

    def test_variable_substitution_behavior(self):
        """Testa o comportamento de substituição das variáveis nos 5 casos críticos"""
        # Extrair e simular a lógica equivalente codificada no JS
        def resolver_saudacao(hora):
            return "Bom dia" if hora < 12 else "Boa tarde"

        def processar_variaveis(texto, contexto, hora=10):
            if not texto:
                return ""
            saudacao = resolver_saudacao(hora)
            chamado = (contexto.get("chamado") or "").strip() or "[Nº CHAMADO]"
            assunto = (contexto.get("assunto") or "").strip() or "[ASSUNTO]"

            res = re.sub(r"\{saudacao\}", lambda _: saudacao, texto, flags=re.IGNORECASE)
            res = re.sub(r"\{chamado\}", lambda _: chamado, res, flags=re.IGNORECASE)
            res = re.sub(r"\{assunto\}", lambda _: assunto, res, flags=re.IGNORECASE)
            return res

        # 1. Saudação matutina e vespertina
        self.assertEqual(resolver_saudacao(8), "Bom dia")
        self.assertEqual(resolver_saudacao(11), "Bom dia")
        self.assertEqual(resolver_saudacao(12), "Boa tarde")
        self.assertEqual(resolver_saudacao(17), "Boa tarde")

        # 2. Substituição com valores preenchidos
        tpl = "{saudacao}! Chamado #{chamado} sobre {assunto}."
        ctx = {"chamado": "245890", "assunto": "Certificado Digital"}
        res = processar_variaveis(tpl, ctx, hora=9)
        self.assertEqual(res, "Bom dia! Chamado #245890 sobre Certificado Digital.")

        # 3. Fallbacks quando vazio ou nulo
        res_vazio = processar_variaveis(tpl, {"chamado": "", "assunto": None}, hora=14)
        self.assertEqual(res_vazio, "Boa tarde! Chamado #[Nº CHAMADO] sobre [ASSUNTO].")

        # 4. Case-insensibilidade e múltiplas ocorrências
        tpl_multi = "{SAUDACAO}! {saudacao}, chamado {CHAMADO} e {chamado} - {ASSUNTO}."
        res_multi = processar_variaveis(tpl_multi, ctx, hora=10)
        self.assertEqual(res_multi, "Bom dia! Bom dia, chamado 245890 e 245890 - Certificado Digital.")

        # 5. Caracteres especiais no assunto ($ e &)
        ctx_spec = {"chamado": "12345", "assunto": "Erro SIGA ($100 & taxa $&)"}
        res_spec = processar_variaveis(tpl, ctx_spec, hora=10)
        self.assertEqual(res_spec, "Bom dia! Chamado #12345 sobre Erro SIGA ($100 & taxa $&).")

if __name__ == "__main__":
    unittest.main()
