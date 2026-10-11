import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('registration', Path(__file__).with_name('register-ops-secrets.py'))
registration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registration)


class RegistrationTests(unittest.TestCase):
    def test_neon_key_is_validated_against_fixed_project_without_logging_value(self):
        output = io.StringIO()
        response = MagicMock()
        response.__enter__.return_value = io.BytesIO(b'{"project":{"id":"calm-cherry-01967053","consumption_period_start":"2026-10-03T00:00:00Z","compute_time_seconds":1,"data_transfer_bytes":2}}')
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(registration, 'registered', return_value=set()), \
                patch.object(registration.shutil, 'which', return_value='gh'), \
                patch.object(registration.sys, 'argv', ['tool', 'neon-key']), \
                patch.object(registration, 'hidden', return_value='private-neon-key'), \
                patch.object(registration.urllib.request, 'build_opener', return_value=opener), \
                patch.object(registration, 'register') as register, contextlib.redirect_stdout(output):
            registration.main()
            register.assert_called_once_with('NEON_API_KEY', 'private-neon-key')
        self.assertEqual(opener.open.call_args.args[0].full_url, 'https://console.neon.tech/api/v2/projects/calm-cherry-01967053')
        self.assertNotIn('private-neon-key', output.getvalue())

    def test_neon_wrong_project_cannot_be_registered(self):
        response = MagicMock()
        response.__enter__.return_value = io.BytesIO(b'{"project":{"id":"wrong-project"}}')
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(registration, 'registered', return_value=set()), \
                patch.object(registration.shutil, 'which', return_value='gh'), \
                patch.object(registration.sys, 'argv', ['tool', 'neon-key']), \
                patch.object(registration, 'hidden', return_value='private-neon-key'), \
                patch.object(registration.urllib.request, 'build_opener', return_value=opener), \
                patch.object(registration, 'register') as register:
            with self.assertRaises(RuntimeError) as error:
                registration.main()
            register.assert_not_called()
            self.assertNotIn('private-neon-key', str(error.exception))

    def test_secret_is_only_passed_over_stdin(self):
        output = io.StringIO()
        with patch.object(registration, 'run') as run, contextlib.redirect_stdout(output):
            registration.register('VERCEL_TOKEN', 'hidden-token')
        args, data = run.call_args.args
        self.assertNotIn('hidden-token', args)
        self.assertEqual(data, 'hidden-token')
        self.assertNotIn('hidden-token', output.getvalue())

    def test_database_role_and_tls_are_required(self):
        registration.validate_source('postgres://jaemangho_backup:hidden@ep.example.neon.tech/db?sslmode=require')
        for value in [
            'postgres://owner:hidden@ep.example.neon.tech/db?sslmode=require',
            'postgres://jaemangho_backup:hidden@ep-pooler.example.neon.tech/db?sslmode=require',
            'postgres://jaemangho_backup:hidden@ep.example.neon.tech/db',
            'postgres://jaemangho_backup:hidden@[invalid/db',
        ]:
            with self.assertRaises(RuntimeError) as error:
                registration.validate_source(value)
            self.assertNotIn('hidden', str(error.exception))

    def test_existing_github_encryption_key_is_not_rotated(self):
        with patch.object(registration, 'registered', return_value={'BACKUP_ENCRYPTION_KEY'}), \
                patch.object(registration.shutil, 'which', return_value='gh'), \
                patch.object(registration.sys, 'argv', ['tool', 'backup']), \
                patch.object(registration, 'hidden') as hidden:
            with self.assertRaisesRegex(RuntimeError, '교체하지'):
                registration.main()
            hidden.assert_not_called()

    def test_non_interactive_input_is_not_echoed(self):
        with patch.object(registration.sys.stdin, 'isatty', return_value=False), \
                patch.object(registration.getpass, 'getpass') as prompt:
            with self.assertRaises(RuntimeError):
                registration.hidden('secret: ')
            prompt.assert_not_called()

    def test_key_cannot_be_stored_in_repository_or_tmp(self):
        for file in [registration.ROOT / 'key', Path('/tmp/key')]:
            with self.assertRaises(RuntimeError):
                registration.load_or_create_key(file)


if __name__ == '__main__':
    unittest.main()
