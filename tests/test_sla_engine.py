import unittest
import os
import subprocess
import json

class TestSlaEngine(unittest.TestCase):
    def setUp(self):
        self.engine_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "assistente-2n-cati-remoto",
            "src",
            "content",
            "assyst-sla-engine.js"
        )

    def run_engine_eval(self, input_data, config_data):
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.engine_path)}, "utf8");
        const ctx = {{
            console: console,
            Date: Date,
            Math: Math,
            Number: Number,
            String: String,
            Array: Array,
            Object: Object,
            Set: Set,
            Map: Map,
            RegExp: RegExp
        }};
        const fn = new Function("ctx", "with(ctx) {{ " + code + "; return CatiSlaEngine; }}");
        const engine = fn(ctx);

        const input = {json.dumps(input_data)};
        const config = {json.dumps(config_data)};
        const res = engine.computeAudit(input, config);
        process.stdout.write(JSON.stringify(res));
        process.exit(0);
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"Engine eval failed:\nSTDOUT: {proc.stdout}\nSTDERR: {proc.stderr}")
        return json.loads(proc.stdout)

    def test_business_mode_overnight_pause(self):
        """No Modo Comercial, chamado aberto após 18h e atendido às 08:20 deve contar apenas 20 min"""
        input_data = {
            "ref": "2148001",
            "events": [
                {"type": "Atribuição Interna", "dateRaw": "10/08/2026 18:30", "assignedDept": "2N CATI Remoto", "actionId": "1"},
                {"type": "Resolvido", "dateRaw": "11/08/2026 08:20", "assignedDept": "2N CATI Remoto", "actionId": "2"}
            ],
            "auditedAt": 1786436400000
        }
        config_data = {
            "slaCalculationMode": "business",
            "slaWorkStart": "08:00",
            "slaWorkEnd": "18:00",
            "slaTargetHours": 1
        }
        res = self.run_engine_eval(input_data, config_data)
        self.assertEqual(res["totalMinutes"], 20, "Deveria contar apenas 20 minutos (08:00 às 08:20)")
        self.assertEqual(res["verdict"], "DENTRO", "20 min deve estar dentro da meta de 60 min")
        self.assertEqual(len(res["dayRows"]), 1)
        self.assertEqual(res["dayRows"][0]["startHM"], "08:00")
        self.assertEqual(res["dayRows"][0]["endHM"], "08:20")

    def test_24_7_mode_continuous_overnight(self):
        """No Modo 24/7, chamado aberto após 18h e atendido às 08:20 deve contar o tempo corrido ininterrupto (~830 min)"""
        input_data = {
            "ref": "2148002",
            "events": [
                {"type": "Atribuição Interna", "dateRaw": "10/08/2026 18:30", "assignedDept": "2N CATI Remoto", "actionId": "1"},
                {"type": "Resolvido", "dateRaw": "11/08/2026 08:20", "assignedDept": "2N CATI Remoto", "actionId": "2"}
            ],
            "auditedAt": 1786436400000
        }
        config_data = {
            "slaCalculationMode": "calendar",
            "slaTargetHours": 1
        }
        res = self.run_engine_eval(input_data, config_data)
        # 18:30 até 23:59 (329 min ou 330 min) + 00:00 até 08:20 (500 min) = ~829-830 min
        self.assertGreaterEqual(res["totalMinutes"], 829)
        self.assertEqual(res["verdict"], "ESTOURADO")

    def test_business_mode_weekend_pause(self):
        """No Modo Comercial, chamado aberto na sexta às 17:40 e resolvido na segunda às 08:15 conta 35 min"""
        # 14/08/2026 é sexta, 17/08/2026 é segunda
        input_data = {
            "ref": "2148003",
            "events": [
                {"type": "Atribuição Interna", "dateRaw": "14/08/2026 17:40", "assignedDept": "2N CATI Remoto", "actionId": "1"},
                {"type": "Resolvido", "dateRaw": "17/08/2026 08:15", "assignedDept": "2N CATI Remoto", "actionId": "2"}
            ]
        }
        config_data = {
            "slaCalculationMode": "business",
            "slaWorkStart": "08:00",
            "slaWorkEnd": "18:00",
            "slaTargetHours": 1
        }
        res = self.run_engine_eval(input_data, config_data)
        self.assertEqual(res["totalMinutes"], 35, "20 min de sexta + 15 min de segunda")
        self.assertEqual(res["verdict"], "DENTRO")

    def test_scheduled_ticket_auto_reactivation(self):
        """Atendimento programado com data no texto deve reativar o relógio automaticamente na data marcada"""
        # Aberto segunda 10/08 às 09:00, programado às 09:10 para 11/08 às 09:00, e resolvido às 09:30 de 11/08
        input_data = {
            "ref": "2148004",
            "events": [
                {"type": "Atribuição Interna", "dateRaw": "10/08/2026 09:00", "assignedDept": "2N CATI Remoto", "actionId": "1"},
                {"type": "Atendimento Programado", "dateRaw": "10/08/2026 09:10", "assignedDept": "2N CATI Remoto", "actionId": "2", "remarks": "Atendimento programado para o dia 11/08 às 09:00"},
                {"type": "Resolvido", "dateRaw": "11/08/2026 09:30", "assignedDept": "2N CATI Remoto", "actionId": "3"}
            ]
        }
        config_data = {
            "slaCalculationMode": "business",
            "slaWorkStart": "08:00",
            "slaWorkEnd": "18:00",
            "slaTargetHours": 1
        }
        res = self.run_engine_eval(input_data, config_data)
        # 10 min (09:00 a 09:10 no dia 10) + 30 min (09:00 a 09:30 no dia 11) = 40 min
        self.assertEqual(res["totalMinutes"], 40)
        self.assertEqual(res["verdict"], "DENTRO")

    def test_unpause_from_handoff_queue(self):
        """Retorno do 3N para o 2N deve despausar o chamado automaticamente"""
        input_data = {
            "ref": "2148005",
            "events": [
                {"type": "Atribuição Interna", "dateRaw": "10/08/2026 09:00", "assignedDept": "2N CATI Remoto", "actionId": "1"},
                {"type": "Aguardando Info do Usuário", "dateRaw": "10/08/2026 09:10", "assignedDept": "2N CATI Remoto", "actionId": "2"},
                {"type": "Atribuição Interna", "dateRaw": "10/08/2026 09:15", "assignedDept": "3N TJ Serv. de Apoio", "actionId": "3"},
                {"type": "Atribuição Interna", "dateRaw": "10/08/2026 10:00", "assignedDept": "2N CATI Remoto", "actionId": "4"},
                {"type": "Resolvido", "dateRaw": "10/08/2026 10:20", "assignedDept": "2N CATI Remoto", "actionId": "5"}
            ]
        }
        config_data = {
            "slaCalculationMode": "business",
            "slaWorkStart": "08:00",
            "slaWorkEnd": "18:00",
            "slaTargetHours": 1
        }
        res = self.run_engine_eval(input_data, config_data)
        # 10 min (09:00 a 09:10) + 20 min (10:00 a 10:20) = 30 min
        self.assertEqual(res["totalMinutes"], 30)
        self.assertEqual(res["verdict"], "DENTRO")

    def test_in_progress_night_audit(self):
        """Chamado aberto às 18:30 e auditado às 20:00 da mesma noite no modo Comercial não deve contar minutos noturnos"""
        input_data = {
            "ref": "2148006",
            "events": [
                {"type": "Atribuição Interna", "dateRaw": "10/08/2026 18:30", "assignedDept": "2N CATI Remoto", "actionId": "1"}
            ],
            "auditedAt": 1786402800000 # 20:00
        }
        config_data = {
            "slaCalculationMode": "business",
            "slaWorkStart": "08:00",
            "slaWorkEnd": "18:00",
            "slaTargetHours": 1
        }
        res = self.run_engine_eval(input_data, config_data)
        self.assertEqual(res["status"], "em_andamento")
        self.assertEqual(res["totalMinutes"], 0)
        self.assertEqual(res["progress"]["remainingMinutes"], 60)
        self.assertEqual(res["progress"]["prevVerdict"], "DENTRO")

    def test_sla_holiday_behavior(self):
        """Feriado oficial TJCE (19/03 - São José) pausa no modo Comercial e não pausa no modo 24/7"""
        # Aberto quarta 18/03 às 17:50 e resolvido sexta 20/03 às 08:20
        input_data = {
            "ref": "2148007",
            "events": [
                {"type": "Atribuição Interna", "dateRaw": "18/03/2026 17:50", "assignedDept": "2N CATI Remoto", "actionId": "1"},
                {"type": "Resolvido", "dateRaw": "20/03/2026 08:20", "assignedDept": "2N CATI Remoto", "actionId": "2"}
            ]
        }
        # Modo comercial: 10 min de quarta + 0 min de quinta (São José) + 20 min de sexta = 30 min
        config_business = {
            "slaCalculationMode": "business",
            "slaWorkStart": "08:00",
            "slaWorkEnd": "18:00",
            "slaTargetHours": 1
        }
        res_biz = self.run_engine_eval(input_data, config_business)
        self.assertEqual(res_biz["totalMinutes"], 30, "Deve ignorar o feriado de 19/03 (São José)")
        self.assertEqual(res_biz["verdict"], "DENTRO")

        # Modo 24/7: contagem contínua (~2310 min)
        config_calendar = {
            "slaCalculationMode": "calendar",
            "slaTargetHours": 1
        }
        res_cal = self.run_engine_eval(input_data, config_calendar)
        self.assertGreater(res_cal["totalMinutes"], 2000)
        self.assertEqual(res_cal["verdict"], "ESTOURADO")

    def test_sla_js_content_integration(self):
        """Verifica se assyst-sla.js delega para CatiSlaEngine, possui foraExpediente, dayRows e alternador rápido"""
        assyst_sla_path = os.path.join(
            os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "content", "assyst-sla.js"
        )
        with open(assyst_sla_path, "r", encoding="utf-8") as f:
            code = f.read()

        self.assertIn("CatiSlaEngine", code, "Deve referenciar CatiSlaEngine")
        self.assertIn("computeAudit", code, "Deve invocar computeAudit")
        self.assertIn("foraExpediente", code, "Deve calcular foraExpediente")
        self.assertIn("btn-toggle-sla-mode", code, "Deve ter botão de alternância rápida de modo no popover")
        self.assertIn("dayRows", code, "Deve suportar dayRows na interface")
        self.assertIn("FORA DE EXPEDIENTE", code, "Deve ter badge de fora de expediente")
        self.assertIn("is-pinned", code, "Deve suportar fixação do popover via classe is-pinned")

        assyst_sla_css_path = os.path.join(
            os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "content", "assyst-sla.css"
        )
        with open(assyst_sla_css_path, "r", encoding="utf-8") as f:
            css = f.read()
        self.assertIn(".is-pinned", css, "CSS deve conter regra para exibir popover quando fixado (.is-pinned)")
        self.assertIn(".pop-pauses-title", css, "CSS deve conter .pop-pauses-title para escalar título dos trechos")
        self.assertIn(".pop-timeline-item", css, "CSS deve conter .pop-timeline-item para escalar eventos de pausa")
        self.assertNotIn("font-size: 10px;", code, "JS não deve conter font-size inline hardcoded no popover")
        self.assertNotIn("font-size: 9.5px;", code, "JS não deve conter font-size inline hardcoded no popover")
        self.assertNotIn("font-size: 9px;", code, "JS não deve conter font-size inline hardcoded no popover")

    def test_sla_popup_dynamic_visibility(self):
        """Verifica se popup.html e popup.js contêm apenas os dois modos e horários fixos em 08:00-18:00"""
        popup_html_path = os.path.join(
            os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "popup", "popup.html"
        )
        with open(popup_html_path, "r", encoding="utf-8") as f:
            html = f.read()

        self.assertNotIn("setting-sla-hours-grid", html, "Campos de edição de horários de SLA devem ser removidos")
        self.assertIn("setting-sla-mode-help", html)
        self.assertIn("value=\"calendar\"", html)
        self.assertIn("value=\"business\"", html)

        popup_js_path = os.path.join(
            os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "popup", "popup.js"
        )
        with open(popup_js_path, "r", encoding="utf-8") as f:
            js = f.read()

        self.assertIn("08:00", js)
        self.assertIn("18:00", js)

    def test_perpetual_holiday_generation(self):
        """Verifica se o cálculo perpétuo de feriados TJCE e Páscoa (Meeus/Gauss) gera datas corretas e exporta funções"""
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.engine_path)}, "utf8");
        const ctx = {{
            console: console,
            Date: Date,
            Math: Math,
            Number: Number,
            String: String,
            Array: Array,
            Object: Object,
            Set: Set,
            Map: Map,
            RegExp: RegExp
        }};
        const fn = new Function("ctx", "with(ctx) {{ " + code + "; return CatiSlaEngine; }}");
        const engine = fn(ctx);

        const feriados2026 = engine.gerarFeriadosTJCE(2026);
        const feriados2027 = engine.gerarFeriadosTJCE(2027);

        const res = {{
            feriados2026,
            feriados2027,
            defaultHolidaysCount: engine.DEFAULT_HOLIDAYS.length
        }};
        process.stdout.write(JSON.stringify(res));
        process.exit(0);
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, f"Erro: {proc.stderr}")
        data = json.loads(proc.stdout)

        # Verificar feriados de 2026
        f2026 = data["feriados2026"]
        self.assertIn("2026-01-01", f2026) # Confraternização
        self.assertIn("2026-02-17", f2026) # Terça de Carnaval
        self.assertIn("2026-03-19", f2026) # São José
        self.assertIn("2026-03-25", f2026) # Data Magna CE
        self.assertIn("2026-04-03", f2026) # Sexta-feira Santa
        self.assertIn("2026-04-21", f2026) # Tiradentes
        self.assertIn("2026-05-01", f2026) # Trabalho
        self.assertIn("2026-06-04", f2026) # Corpus Christi
        self.assertIn("2026-12-25", f2026) # Natal

        # Verificar feriados de 2027
        f2027 = data["feriados2027"]
        self.assertIn("2027-02-09", f2027) # Terça de Carnaval
        self.assertIn("2027-03-26", f2027) # Sexta-feira Santa
        self.assertIn("2027-05-27", f2027) # Corpus Christi
        self.assertIn("2027-12-25", f2027)

        # Verificar pré-computação para múltiplos anos (6 anos * 19 feriados = 114)
        self.assertEqual(data["defaultHolidaysCount"], 114)

    def test_solicitacao_urgencia_nao_deve_despausar(self):
        """Solicitação de Urgência não deve ser tratada como despausa e não deve religar o relógio do SLA (caso R2476899)"""
        # Abertura às 09:00, pausa às 09:20 (20 min contados).
        # Às 09:35 entra 'Solicitação de Urgência'. Chamado continua pausado.
        # Auditoria às 10:00. O total de minutos deve continuar 20 min, e o relógio pausado.
        input_data = {
            "ref": "R2476899",
            "events": [
                {"type": "Atribuição Interna", "dateRaw": "10/08/2026 09:00", "assignedDept": "2N CATI Remoto", "actionId": "1"},
                {"type": "Aguardando Info do Usuário", "dateRaw": "10/08/2026 09:20", "assignedDept": "2N CATI Remoto", "actionId": "2"},
                {"type": "Solicitação de Urgência", "dateRaw": "10/08/2026 09:35", "actingDept": "Zz Assystnet Users", "actionId": "3"}
            ],
            "auditedAt": 1786446000000 # 10/08/2026 10:00:00 (10:00 BRT)
        }
        # Converter 10/08/2026 10:00:00 em timestamp Date JS:
        # new Date(2026, 7, 10, 10, 0, 0).getTime()
        test_script = f"""
        const fs = require("fs");
        const code = fs.readFileSync({json.dumps(self.engine_path)}, "utf8");
        const ctx = {{
            console: console,
            Date: Date,
            Math: Math,
            Number: Number,
            String: String,
            Array: Array,
            Object: Object,
            Set: Set,
            Map: Map,
            RegExp: RegExp
        }};
        const fn = new Function("ctx", "with(ctx) {{ " + code + "; return CatiSlaEngine; }}");
        const engine = fn(ctx);

        const auditedAtDate = new Date(2026, 7, 10, 10, 0, 0, 0).getTime();
        const input = {{
            ref: "R2476899",
            events: [
                {{ type: "Atribuição Interna", dateRaw: "10/08/2026 09:00", assignedDept: "2N CATI Remoto", actionId: "1" }},
                {{ type: "Aguardando Info do Usuário", dateRaw: "10/08/2026 09:20", assignedDept: "2N CATI Remoto", actionId: "2" }},
                {{ type: "Solicitação de Urgência", dateRaw: "10/08/2026 09:35", actingDept: "Zz Assystnet Users", actionId: "3" }}
            ],
            auditedAt: auditedAtDate
        }};
        const config = {{
            slaCalculationMode: "business",
            slaWorkStart: "08:00",
            slaWorkEnd: "18:00",
            slaTargetHours: 1
        }};
        const res = engine.computeAudit(input, config);
        process.stdout.write(JSON.stringify(res));
        """
        proc = subprocess.run(["node", "-e", test_script], capture_output=True, text=True, check=True)
        res = json.loads(proc.stdout)
        self.assertEqual(res["totalMinutes"], 20, "Solicitação de Urgência NÃO deve despausar nem adicionar minutos")
        self.assertEqual(res["progress"]["clockState"], "pausado_acao", "Relógio deve continuar pausado")

    def test_historico_longo_muitas_acoes_sla(self):
        """Chamados com grande histórico de ações (caso S2477951 com 50+ logs) devem calcular SLA sem erro ou estouro de pilha"""
        events = [
            {"type": "Atribuição Interna", "dateRaw": "03/08/2026 08:30", "assignedDept": "2N CATI Remoto", "actionId": "1"}
        ]
        # Gerar 50 ações intermediárias de notas, solicitações de urgência e pausas
        for i in range(2, 52):
            hora = 8 + (i // 10)
            minuto = (i * 7) % 60
            tipo = "Solicitação de Urgência" if i % 5 == 0 else "Nota Adicionada"
            events.append({
                "type": tipo,
                "dateRaw": f"03/08/2026 {hora:02d}:{minuto:02d}",
                "actionId": str(i)
            })
        events.append({"type": "Resolvido", "dateRaw": "03/08/2026 09:15", "actionId": "53"})

        input_data = {
            "ref": "S2477951",
            "events": events
        }
        config_data = {
            "slaCalculationMode": "business",
            "slaWorkStart": "08:00",
            "slaWorkEnd": "18:00",
            "slaTargetHours": 1
        }
        res = self.run_engine_eval(input_data, config_data)
        self.assertEqual(res["totalMinutes"], 45, "Das 08:30 às 09:15 são 45 minutos contados, mesmo com 50+ ações")
        self.assertEqual(res["verdict"], "DENTRO")
        self.assertEqual(res["status"], "concluido")

    def test_extracao_virtual_scroll_dojo_presente_em_js(self):
        """Verifica a presença de coletarTodasAcoesGridDojo com rolagem do scrollbox no assyst-sla.js"""
        assyst_sla_path = os.path.join(
            os.path.dirname(__file__), "..", "assistente-2n-cati-remoto", "src", "content", "assyst-sla.js"
        )
        with open(assyst_sla_path, "r", encoding="utf-8") as f:
            code = f.read()

        self.assertIn("coletarTodasAcoesGridDojo", code, "Deve implementar coletarTodasAcoesGridDojo para virtual scroll")
        self.assertIn("dojoxGridScrollbox", code, "Deve buscar o scrollbox do Dojo DataGrid")
        self.assertIn("garantirExpansaoRemarks", code, "Deve ter expansão controlada sem cliques repetidos no cabeçalho")

if __name__ == "__main__":
    unittest.main()


