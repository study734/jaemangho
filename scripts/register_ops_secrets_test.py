import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('registration', Path(__file__).with_name('register-ops-secrets.py'))
registration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registration)


class RegistrationTests(unittest.TestCase):
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
