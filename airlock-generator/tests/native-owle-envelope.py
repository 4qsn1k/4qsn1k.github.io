"""Synthetic ZIP envelope tests, NOT a native project fixture or Owen QA."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import stat
import struct
import tempfile
import unittest
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("inspector", ROOT / "scripts/inspect-native-owle.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def archive(entries=None, document=None):
    output = io.BytesIO()
    if entries is None:
        entries = [("Project", json.dumps({"DocumentModel": document or {"Elements": [], "ConnectorModels": []}})), ("StFunctionBlocks", "[]")]
    with zipfile.ZipFile(output, "w") as out:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            for name, body in entries:
                out.writestr(name, body)
    return output.getvalue()


class EnvelopeTests(unittest.TestCase):
    def inspect(self, raw):
        with tempfile.TemporaryDirectory(prefix="airlock-owle-envelope-") as temp:
            file = Path(temp) / "SYNTHETIC_ENVELOPE_ONLY.owle"
            file.write_bytes(raw)
            report = module.inspect_archive(file)
            self.assertEqual(file.read_bytes(), raw)
            return report

    def test_whitelisted_report_is_read_only_and_has_no_native_claim(self):
        raw = archive([("Project", '{"PrivateSiteName":"sensitive-placeholder","DocumentModel":{"Elements":[],"ConnectorModels":[]}}'), ("StFunctionBlocks", '[{"SourceCode":"sensitive-source-placeholder"}]')])
        report = self.inspect(raw)
        self.assertEqual(report["status"], "ZIP_JSON_ENVELOPE_INSPECTED_ONLY")
        self.assertIsNone(report["nativeDocument"])
        self.assertFalse(report["usableForSerialization"])
        self.assertNotIn("sensitive", json.dumps(report))
        self.assertEqual(report["nativeGui"], "NEEDS_NATIVE_GUI")

    def test_duplicate_member_and_case_alias_are_rejected(self):
        for extra in ("Project", "project"):
            with self.assertRaisesRegex(ValueError, "DUPLICATE_ZIP_MEMBER"):
                self.inspect(archive([("Project", "{}"), ("StFunctionBlocks", "[]"), (extra, "{}")]))

    def test_unsafe_paths_missing_members_and_symlinks(self):
        for name in ("../escape", "/absolute", "a\\b", "a/./b", "a//b"):
            data = archive([("Project", "{}"), ("StFunctionBlocks", "[]"), (name, "{}")])
            # Python's ZipInfo normalizes backslashes to slashes on Windows
            # while building a fixture. Patch the raw local+central header
            # filenames, preserving their length, to test *actual* unsafe ZIP bytes.
            if name == "a\\b" and b"a\\b" not in data:
                assert data.count(b"a/b") == 2, "unexpected synthetic ZIP member layout"
                data = data.replace(b"a/b", b"a\\b")
            with self.assertRaisesRegex(ValueError, "UNSAFE_ZIP_MEMBER"):
                self.inspect(data)
        with self.assertRaisesRegex(ValueError, "MISSING_KNOWN_ZIP_MEMBERS"):
            self.inspect(archive([("Project", "{}")]))
        link = zipfile.ZipInfo("linked")
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaisesRegex(ValueError, "ZIP_SYMLINK"):
            self.inspect(archive([("Project", "{}"), ("StFunctionBlocks", "[]"), (link, "target")]))

    def test_crc_truncation_and_encryption_metadata(self):
        raw = bytearray(archive())
        position = raw.index(b'"DocumentModel"')
        raw[position] ^= 1
        with self.assertRaises(zipfile.BadZipFile):
            self.inspect(raw)
        with self.assertRaises(zipfile.BadZipFile):
            self.inspect(archive()[:-15])
        raw = bytearray(archive())
        central = raw.index(b"PK\x01\x02")
        struct.pack_into("<H", raw, central + 8, 1)
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_ZIP_FLAGS"):
            self.inspect(raw)

    def test_json_duplicates_nonfinite_numbers_and_unknown_document_shapes(self):
        for body in ('{"DocumentModel":{},"DocumentModel":{}}', '{"x":NaN}'):
            with self.assertRaises(ValueError):
                self.inspect(archive([("Project", body), ("StFunctionBlocks", "[]")]))
        for document in ({"Elements": [], "ConnectorModels": [], "Invented": 1}, {"Elements": [{"Discriminator": 99}], "ConnectorModels": []}):
            with self.assertRaises(ValueError):
                self.inspect(archive(document=document))

    def test_authentic_fb_shapes_inspected_without_accepting_definition_resolution(self):
        fixture = json.loads((ROOT / "experimental/fixtures/fbd-two-native-blocks.sample.json").read_text())
        document = {"Elements": fixture["elements"], "ConnectorModels": []}
        report = self.inspect(archive(document=document))
        self.assertEqual(report["documentSummaries"], [{"elements": 2, "connectors": 0, "ports": 39, "unresolvedSTInstances": 2}])
        for mutate in (
            lambda d: d["Elements"][0]["ElementBlockStoreModel"]["ElementModel"]["Primitives"][0].update({"Discriminator": 999}),
            lambda d: d["Elements"][0]["ElementBlockStoreModel"]["ElementModel"]["Primitives"][0].update({"UnknownPrimitiveField": 0}),
            lambda d: d["Elements"][0]["ElementBlockStoreModel"]["ElementModel"]["Ports"][0].update({"AnchorUniqueId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}),
            lambda d: d["Elements"][0]["ElementBlockStoreModel"]["ElementModel"]["Ports"][0].update({"DataType": 6}),
        ):
            changed = copy.deepcopy(document)
            mutate(changed)
            with self.assertRaises(ValueError):
                self.inspect(archive(document=changed))


if __name__ == "__main__":
    unittest.main()
