import os
import zipfile
import json

def build():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_xpi = os.path.join(base_dir, "assistente-2n-cati-remoto.xpi")
    ignore_files = {"build.py", "package.json", "README.md", "DOCUMENTACAO.md", "assistente-2n-cati-remoto.xpi"}
    
    with zipfile.ZipFile(output_xpi, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(base_dir):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
            for file in files:
                if file in ignore_files or file.endswith(".zip") or file.endswith(".xpi"):
                    continue
                full_path = os.path.join(root, file)
                arcname = os.path.relpath(full_path, base_dir)
                zipf.write(full_path, arcname)
                print(f"Empacotado: {arcname}")
                
    print(f"\nSucesso: {output_xpi} gerado!")

if __name__ == "__main__":
    build()
