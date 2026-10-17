import unittest
import os
import zipfile
import json

class TestBuildPackage(unittest.TestCase):
    def setUp(self):
        self.root_dir = os.path.join(os.path.dirname(__file__), "..")
        self.ext_dir = os.path.join(self.root_dir, "assistente-2n-cati-remoto")
        self.xpi_path = os.path.join(self.root_dir, "assistente-2n-cati-remoto.xpi")
        self.zip_path = os.path.join(self.root_dir, "codigo-fonte-assistente-2n.zip")

    def test_xpi_package_integrity(self):
        """Verifica a integridade e o conteúdo do pacote .xpi gerado"""
        self.assertTrue(os.path.exists(self.xpi_path), f"Arquivo .xpi não encontrado: {self.xpi_path}")
        with zipfile.ZipFile(self.xpi_path, "r") as z:
            names = z.namelist()
            self.assertIn("manifest.json", names)
            self.assertIn("src/content/whatsapp-templates.js", names)
            self.assertIn("src/content/whatsapp-templates.css", names)
            self.assertIn("src/content/assyst-alertas.js", names)

            # Validar manifesto dentro do pacote
            manifest_raw = z.read("manifest.json").decode("utf-8")
            manifest = json.loads(manifest_raw)
            with open(os.path.join(self.ext_dir, "manifest.json"), "r", encoding="utf-8") as f:
                source_manifest = json.load(f)
            self.assertEqual(source_manifest.get("version"), "3.1.0", "Versão deve ser 3.1.0")
            self.assertEqual(manifest.get("version"), source_manifest.get("version"))

    def test_source_zip_package_integrity(self):
        """Verifica a integridade do arquivo zip de código-fonte"""
        self.assertTrue(os.path.exists(self.zip_path), f"Arquivo .zip não encontrado: {self.zip_path}")
        with zipfile.ZipFile(self.zip_path, "r") as z:
            names = z.namelist()
            self.assertTrue(any("manifest.json" in n for n in names))
            self.assertTrue(any("whatsapp-templates.js" in n for n in names))

    def test_manifest_content_scripts_assyst_downtime(self):
        """Verifica se assyst-downtime.js e assyst-downtime.css estão registrados no manifest.json"""
        with open(os.path.join(self.ext_dir, "manifest.json"), "r", encoding="utf-8") as f:
            manifest = json.load(f)

        cati_script = None
        for cs in manifest.get("content_scripts", []):
            if "https://cati.tjce.jus.br/*" in cs.get("matches", []):
                cati_script = cs
                break

        self.assertIsNotNone(cati_script, "Content script para cati.tjce.jus.br não encontrado")
        self.assertIn("src/content/assyst-downtime.js", cati_script.get("js", []))
        self.assertIn("src/content/assyst-downtime.css", cati_script.get("css", []))

if __name__ == "__main__":
    unittest.main()
