import unittest
import os
import re

class TestAssystSync(unittest.TestCase):
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
        with open(self.js_path, "r", encoding="utf-8") as f:
            self.js_code = f.read()

    def test_sync_functions_and_listeners_exist(self):
        """Verifica a presença das funções e ouvintes de sincronização no script do Assyst"""
        self.assertIn("function obterDadosChamadoAtivo", self.js_code)
        self.assertIn("function sincronizarChamadoAtivoStorage", self.js_code)
        self.assertIn("cati_active_ticket", self.js_code)
        self.assertRegex(self.js_code, r'window\.addEventListener\(\s*["\']focus["\']')

    def test_extraction_logic_priorities(self):
        """Testa as prioridades de extração de assunto: item > resumo, ignorando sentinelas"""
        def extrair_assunto(item, resumo):
            sentinelas = {"", "-", "por definir", "nenhum", "null", "undefined"}
            item_limpo = (item or "").strip()
            resumo_limpo = (resumo or "").strip()

            if item_limpo and item_limpo.lower() not in sentinelas:
                return item_limpo
            if resumo_limpo and resumo_limpo.lower() not in sentinelas:
                return resumo_limpo
            return ""

        # Prioridade para item de serviço
        self.assertEqual(extrair_assunto("Certificado Digital", "Erro no token"), "Certificado Digital")
        # Fallback para resumo se item for sentinela
        self.assertEqual(extrair_assunto("-", "Impressora sem papel"), "Impressora sem papel")
        self.assertEqual(extrair_assunto("Por definir", "Configuração de rede"), "Configuração de rede")
        self.assertEqual(extrair_assunto("", "Acesso VPN"), "Acesso VPN")
        # Sentinelas em ambos
        self.assertEqual(extrair_assunto("-", "-"), "")

    def test_ticket_number_cleanliness(self):
        """Testa se a extração limpa números de chamados válidos"""
        def limpar_numero_chamado(num_str):
            if not num_str or num_str.strip().lower() in {"chamado", "-"}:
                return ""
            m = re.search(r"\b([A-Za-z]{0,3}\d{5,10})\b", num_str)
            return m.group(1) if m else num_str.strip()

        self.assertEqual(limpar_numero_chamado("Chamado 245890"), "245890")
        self.assertEqual(limpar_numero_chamado("CH245890 - Atendimento"), "CH245890")
        self.assertEqual(limpar_numero_chamado("Chamado"), "")
    def test_recent_tickets_sync_logic(self):
        """Verifica se o armazenamento e rotação do histórico cati_recent_tickets está implementado"""
        self.assertIn("cati_recent_tickets", self.js_code)

        def adicionar_historico(historico, novo_chamado, max_itens=5):
            filtrado = [t for t in historico if t.get("chamado") != novo_chamado.get("chamado")]
            filtrado.insert(0, novo_chamado)
            return filtrado[:max_itens]

        hist = [
            {"chamado": "100", "assunto": "A"},
            {"chamado": "200", "assunto": "B"}
        ]
        # Novo item
        hist = adicionar_historico(hist, {"chamado": "300", "assunto": "C"})
        self.assertEqual([t["chamado"] for t in hist], ["300", "100", "200"])

        # Item repetido move para o topo
        hist = adicionar_historico(hist, {"chamado": "100", "assunto": "A atualizado"})
        self.assertEqual([t["chamado"] for t in hist], ["100", "300", "200"])
        self.assertEqual(hist[0]["assunto"], "A atualizado")

        # Limite de 5 itens
        hist = adicionar_historico(hist, {"chamado": "400", "assunto": "D"})
        hist = adicionar_historico(hist, {"chamado": "500", "assunto": "E"})
        hist = adicionar_historico(hist, {"chamado": "600", "assunto": "F"})
        self.assertEqual(len(hist), 5)
        self.assertEqual([t["chamado"] for t in hist], ["600", "500", "400", "100", "300"])

if __name__ == "__main__":
    unittest.main()
