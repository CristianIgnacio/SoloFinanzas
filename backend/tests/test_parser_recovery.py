import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from app.api.routes.statements import _accept_pdf_issues

from app.domain.enums import InstitutionCode
from app.domain.parsers import ParserKey
from app.domain.product_types import ProductKind
from app.services.parsing import pipeline
from app.services.parsing.models import PdfContent, PdfImportError, PublicPdfError
from app.services.parsing.registry import _parse_document
from tests.test_pdf_importer import SANTANDER_SAMPLE
from tests.test_santander_credit_parser import SAMPLE as CREDIT_SAMPLE


class ParserRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.content = PdfContent(SANTANDER_SAMPLE, ())
        self.rows = _parse_document(ParserKey.BANCO_SANTANDER, SANTANDER_SAMPLE)

    @staticmethod
    def validators_for(*keys):
        def validate(key, text):
            if key not in keys:
                raise PdfImportError("Unsupported test format")
        return validate

    def test_success_does_not_check_account_type_or_try_alternatives(self):
        with patch.object(pipeline, "_detect_account_kind") as detect, \
             patch.object(pipeline, "_parse_document", wraps=_parse_document) as parse:
            key, rows, warnings, issues = pipeline._parse_with_recovery(
                self.content, ParserKey.BANCO_SANTANDER, "vista",
            )
        detect.assert_not_called()
        self.assertEqual(parse.call_count, 1)
        self.assertEqual(key, ParserKey.BANCO_SANTANDER)
        self.assertEqual(len(rows[0]), 2)
        self.assertEqual((warnings, issues), ([], []))

    def test_parse_failure_and_empty_result_try_a_recognized_alternative_once(self):
        for failure in (PdfImportError("Unreadable rows"), ([], [], "2026-05")):
            with self.subTest(failure=failure):
                with patch.object(pipeline, "_validate_document", side_effect=self.validators_for(
                    ParserKey.BANCO_DE_CHILE, ParserKey.BANCO_SANTANDER,
                )), patch.object(pipeline, "_parse_document", side_effect=[failure, self.rows]) as parse:
                    key, rows, _, issues = pipeline._parse_with_recovery(
                        self.content, ParserKey.BANCO_DE_CHILE, "vista",
                    )
                self.assertEqual([call.args[0] for call in parse.call_args_list], [
                    ParserKey.BANCO_DE_CHILE, ParserKey.BANCO_SANTANDER,
                ])
                self.assertEqual(key, ParserKey.BANCO_SANTANDER)
                self.assertEqual(rows, self.rows)
                self.assertEqual([issue.code for issue in issues], ["PARSER_FALLBACK", "ACCOUNT_TYPE_MISMATCH"])
                self.assertIn("Cuenta corriente", issues[1].message)

    def test_partial_rows_and_total_warnings_do_not_replace_primary_result(self):
        def parse(key, text, **options):
            options["validation_warnings"].append("Totales distintos")
            return self.rows[0], ["Una fila ilegible"], self.rows[2]
        with patch.object(pipeline, "_parse_document", side_effect=parse) as parser, \
             patch.object(pipeline, "_detect_account_kind") as detect:
            _, rows, warnings, issues = pipeline._parse_with_recovery(self.content, ParserKey.BANCO_SANTANDER, "corriente")
        detect.assert_not_called()
        self.assertEqual(parser.call_count, 1)
        self.assertEqual(rows[1], ["Una fila ilegible"])
        self.assertEqual(warnings, ["Totales distintos"])
        self.assertEqual(issues, [])

    def test_failure_without_alternative_explains_detected_type_without_retrying(self):
        with patch.object(pipeline, "_parse_document", side_effect=PdfImportError("Bad columns")) as parse:
            with self.assertRaises(PublicPdfError) as caught:
                pipeline._parse_with_recovery(self.content, ParserKey.BANCO_SANTANDER, "vista")
        self.assertEqual(parse.call_count, 1)
        self.assertIn("Cuenta corriente", str(caught.exception))
        self.assertIn("Cuenta vista", str(caught.exception))

    def test_unknown_header_is_reported_after_failure(self):
        content = PdfContent(SANTANDER_SAMPLE.replace("CARTOLA CUENTA CORRIENTE", "CARTOLA"), ())
        with patch.object(pipeline, "_parse_document", return_value=([], [], "2026-05")):
            with self.assertRaises(PublicPdfError) as caught:
                pipeline._parse_with_recovery(content, ParserKey.BANCO_SANTANDER, "corriente")
        self.assertEqual(caught.exception.code, "NO_TRANSACTIONS")
        self.assertIn("No se pudo comprobar el tipo", str(caught.exception))

    def test_ambiguous_alternatives_are_not_chosen_arbitrarily(self):
        with patch.object(pipeline, "_validate_document", side_effect=self.validators_for(
            ParserKey.BANCO_DE_CHILE, ParserKey.BANCO_SANTANDER, ParserKey.BANCO_ESTADO,
        )), patch.object(pipeline, "_parse_document", side_effect=PdfImportError("Bad columns")) as parse:
            with self.assertRaises(PublicPdfError) as caught:
                pipeline._parse_with_recovery(self.content, ParserKey.BANCO_DE_CHILE, "corriente")
        self.assertEqual(caught.exception.code, "AMBIGUOUS_FORMAT")
        self.assertEqual(parse.call_count, 1)

    def test_account_type_detection_uses_headers_and_ignores_movements(self):
        for text, kind in (
            ("Cuenta Vista\nFECHA DESCRIPCION\nCuenta Corriente destino", ProductKind.SIGHT),
            ("CARTOLA CUENTA CORRIENTE", ProductKind.CURRENT),
            ("Cuenta de Ahorro Platino", ProductKind.SAVINGS),
            ("Tipo de cuenta: Cuenta Vista", ProductKind.SIGHT),
            ("Tipo de cuenta: Vista", ProductKind.SIGHT),
            ("Estado de Cuenta Corriente", ProductKind.CURRENT),
            ("01/05 TRANSFERENCIA A CUENTA CORRIENTE\nCuenta Vista", None),
            ("Cuenta Corriente\nCuenta Vista", None),
            ("Transfiere a tu Cuenta de Ahorro", None),
        ):
            with self.subTest(text=text):
                self.assertEqual(pipeline._detect_account_kind(text), kind)

    def preview_for(self, content, **arguments):
        with patch.object(pipeline, "_build_reader", return_value=(SimpleNamespace(pages=[None]), False)), \
             patch.object(pipeline, "_extract_pdf_content", return_value=content):
            return pipeline.inspect_pdf(file_name="sample.pdf", file_bytes=b"%PDF-synthetic", **arguments)

    def test_wrong_bank_recovery_keeps_mismatch_and_requires_review(self):
        preview = self.preview_for(self.content, institution=InstitutionCode.BANCO_ESTADO, expected_account_type="vista")
        self.assertEqual(preview.parser_key, ParserKey.BANCO_SANTANDER)
        self.assertEqual(len(preview.candidate_transactions), 2)
        self.assertEqual({issue.code for issue in preview.issues}, {
            "PARSER_FALLBACK", "ACCOUNT_TYPE_MISMATCH", "BANK_MISMATCH",
        })

    def test_specific_credit_document_is_not_read_as_generic_account(self):
        content = PdfContent("BANCO SANTANDER\n" + CREDIT_SAMPLE, ())
        with patch.object(pipeline, "_parse_document", wraps=_parse_document) as parse:
            preview = self.preview_for(content, institution=InstitutionCode.BANCO_SANTANDER, expected_account_type="corriente", expected_last4="1234")
        self.assertEqual([call.args[0] for call in parse.call_args_list], [ParserKey.SANTANDER_CREDIT_NATIONAL])
        self.assertEqual([row.amount_clp for row in preview.candidate_transactions], [-100000, -30000, -2000])
        self.assertIn("DOCUMENT_TYPE_MISMATCH", {issue.code for issue in preview.issues})

    def test_recovered_preview_requires_accepting_all_issues_before_import(self):
        import json
        preview = self.preview_for(self.content, institution=InstitutionCode.BANCO_ESTADO, expected_account_type="vista")
        with self.assertRaises(HTTPException) as caught:
            _accept_pdf_issues(preview, json.dumps(["BANK_MISMATCH"]))
        self.assertEqual(caught.exception.detail["code"], "ISSUE_ACK_REQUIRED")
        _accept_pdf_issues(preview, json.dumps([issue.code for issue in preview.issues]))
        for row in preview.candidate_transactions:
            self.assertIn("PARSER_FALLBACK", row.raw_data["pdf_accepted_issue_codes"])
            self.assertEqual(row.raw_data["pdf_detected_parser"], "banco_santander")

    def test_programming_errors_do_not_trigger_a_different_parser(self):
        with patch.object(pipeline, "_parse_document", side_effect=RuntimeError("Unexpected bug")), \
             patch.object(pipeline, "_detect_account_kind") as detect:
            with self.assertRaises(RuntimeError):
                pipeline._parse_with_recovery(self.content, ParserKey.BANCO_SANTANDER, "corriente")
        detect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
