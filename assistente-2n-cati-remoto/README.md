# Assistente - 2N CATI Remoto

## Instruções para Revisores da Mozilla / Build Instructions

Esta extensão é desenvolvida em **JavaScript padrão (Vanilla WebExtensions)**, HTML5 e CSS3, sem ferramentas de compilação complexas, sem webpack/vite, sem transpilação e sem minimizadores de código.

### Requisitos de Ambiente
- Sistema Operacional: Linux, macOS ou Windows
- Python 3.8 ou superior (ou qualquer utilitário de arquivo ZIP)

### Passos de Construção (Build)
Para reproduzir exatamente o arquivo `.xpi` a partir deste código-fonte:
1. Abra o terminal na raiz deste projeto.
2. Execute o comando de compilação:
   ```bash
   python3 build.py
   ```
   (Ou `npm run build` se tiver o Node instalado).

O script empacota todos os arquivos da extensão (`manifest.json`, `_locales/`, `src/`) mantendo a integridade exata do código-fonte.
