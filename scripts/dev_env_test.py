"""Exercise real Git worktree hooks, safe copying, and secret-safe failures."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import tomllib
import unittest
from unittest.mock import patch

TOOL = Path(__file__).with_name('dev-env.py').resolve()
spec = importlib.util.spec_from_file_location('dev_env', TOOL)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SOURCE = 'DATABASE_URL=postgresql://postgres:fixture-secret@127.0.0.1:54329/dev\nSESSION_SECRET=' + 's' * 40 + '\nDEV_LOGIN=1\n'


class DevEnvTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='jmh-dev-env-test-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / 'project with spaces'
        self.root.mkdir()
        self.git('init')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'user.name', 'fixture')
        (self.root / '.gitignore').write_text('*.local\n')
        self.git('add', '.gitignore')
        self.git('commit', '-m', 'fixture')
        self.source = self.root / '.env.local'
        self.source.write_text(SOURCE)
        self.source.chmod(0o600)
        self.common = self.root / '.git'
        self.store = self.common / 'jaemangho-dev-env'

    def git(self, *args, cwd=None):
        result = subprocess.run(['git', '-C', str(cwd or self.root), *args], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def run_tool(self, *args, cwd=None, data=None):
        return subprocess.run([sys.executable, str(TOOL), *args], cwd=cwd or self.root,
                              input=data, text=True, capture_output=True)

    def ready(self):
        result = self.run_tool('import', '--source', str(self.source), '--confirm-development')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_real_worktree_creation_spaces_secret_permissions_and_no_network(self):
        self.ready()
        self.assertEqual(self.run_tool('install').returncode, 0)
        target = self.base / 'new worktree with spaces'
        started = time.monotonic()
        self.git('worktree', 'add', '--detach', str(target))
        self.assertLess(time.monotonic() - started, 5)
        values = module.read(target / '.env.local')
        self.assertEqual(values, module.read(self.source))
        self.assertEqual((target / '.env.local').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.git('check-ignore', '.env.local', cwd=target), '.env.local')
        # The shared hook works even on branches without the new tool file.
        self.assertFalse((target / 'scripts/dev-env.py').exists())

    def test_existing_file_preserved_and_explicit_replace_works(self):
        self.ready()
        self.source.write_text(SOURCE.replace('s' * 40, 't' * 40))
        result = self.run_tool('sync')
        self.assertEqual(result.returncode, 0)
        self.assertIn('t' * 40, self.source.read_text())
        result = self.run_tool('sync', '--replace')
        self.assertEqual(result.returncode, 0)
        self.assertNotIn('t' * 40, self.source.read_text())
        self.assertNotIn('fixture-secret', result.stdout + result.stderr)

    def test_import_requires_confirmation_and_does_not_replace_cache(self):
        self.assertNotEqual(self.run_tool('import', '--source', str(self.source)).returncode, 0)
        self.ready()
        before = (self.store / 'development.env').read_bytes()
        self.source.write_text(SOURCE.replace('s' * 40, 't' * 40))
        self.assertNotEqual(self.run_tool('import', '--source', str(self.source), '--confirm-development').returncode, 0)
        self.assertEqual((self.store / 'development.env').read_bytes(), before)

    def test_symlink_target_and_shared_directory_are_not_followed(self):
        self.ready()
        outside = self.base / 'outside'
        outside.write_text('preserve')
        self.source.unlink()
        self.source.symlink_to(outside)
        self.assertNotEqual(self.run_tool('sync', '--replace').returncode, 0)
        self.assertEqual(outside.read_text(), 'preserve')
        self.source.unlink()
        self.source.write_text(SOURCE)
        other = self.base / 'other-store'
        self.store.rename(other)
        self.store.symlink_to(other, target_is_directory=True)
        self.assertNotEqual(self.run_tool('sync').returncode, 0)

    def test_existing_git_hooks_and_custom_hook_directory_are_preserved(self):
        self.ready()
        hook = self.common / 'hooks/post-checkout'
        hook.write_text('#!/bin/sh\nexit 0\n')
        before = hook.read_bytes()
        self.assertNotEqual(self.run_tool('install').returncode, 0)
        self.assertEqual(hook.read_bytes(), before)
        hook.unlink()
        self.git('config', 'core.hooksPath', 'custom-hooks')
        self.assertNotEqual(self.run_tool('install').returncode, 0)
        self.assertEqual(self.git('config', '--get', 'core.hooksPath'), 'custom-hooks')

    def test_claude_hook_uses_stdin_worktree_cwd_and_rejects_foreign_repository(self):
        self.ready()
        target = self.base / 'claude-worktree'
        self.git('worktree', 'add', '--detach', str(target))
        result = self.run_tool('hook', data=json.dumps({'cwd': str(target)}))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(module.read(target / '.env.local'), module.read(self.source))
        foreign = self.base / 'foreign'
        foreign.mkdir()
        self.git('init', cwd=foreign)
        result = self.run_tool('hook', data=json.dumps({'cwd': str(foreign)}))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((foreign / '.env.local').exists())

    def test_codex_setup_handles_creation_that_skips_git_hooks(self):
        self.ready()
        self.assertEqual(self.run_tool('install').returncode, 0)
        target = self.base / 'codex-worktree'
        self.git('worktree', 'add', '--no-checkout', '--detach', str(target))
        self.assertFalse((target / '.env.local').exists())
        config = tomllib.loads((TOOL.parent.parent / '.codex/environments/environment.toml').read_text())
        result = subprocess.run(['bash', '-c', config['setup']['script']], cwd=target,
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(module.read(target / '.env.local'), module.read(self.source))
        self.assertIn('set -eu', config['setup']['linux']['script'])

    def test_configured_claude_command_works_without_project_script_on_branch(self):
        self.ready()
        self.assertEqual(self.run_tool('install').returncode, 0)
        target = self.base / 'claude-empty-worktree'
        self.git('worktree', 'add', '--no-checkout', '--detach', str(target))
        config = json.loads((TOOL.parent.parent / '.claude/settings.json').read_text())
        command = config['hooks']['SessionStart'][0]['hooks'][0]['command']
        result = subprocess.run(['bash', '-c', command], cwd=self.root,
                                input=json.dumps({'cwd': str(target)}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((target / '.env.local').is_file())
        self.assertFalse((target / 'scripts/dev-env.py').exists())

    def test_cache_permissions_and_missing_source_fail_without_fake_configuration(self):
        self.assertNotEqual(self.run_tool('sync').returncode, 0)
        self.ready()
        cache = self.store / 'development.env'
        cache.chmod(0o644)
        self.assertNotEqual(self.run_tool('sync').returncode, 0)

    def test_missing_external_credentials_are_not_reported_as_ready(self):
        self.ready()
        result = self.run_tool('check', '--profile', 'discord')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('DISCORD_PUBLIC_KEY', result.stdout)
        self.assertNotIn('fixture-secret', result.stdout + result.stderr)
        self.assertEqual(self.run_tool('check', '--profile', 'local').returncode, 0)

    def test_bad_source_redacted_and_old_cache_kept(self):
        self.ready()
        before = (self.store / 'development.env').read_bytes()
        self.source.write_text(SOURCE + 'DISCORD_PUBLIC_KEY=never-print-this-secret\n')
        result = self.run_tool('import', '--source', str(self.source), '--confirm-development', '--replace')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('never-print-this-secret', result.stdout + result.stderr)
        self.assertEqual((self.store / 'development.env').read_bytes(), before)

    def test_refresh_is_development_only_and_excludes_vercel_session_tokens(self):
        self.ready()
        def fake_run(args, **kwargs):
            self.assertIn('--environment=development', args)
            self.assertIn(module.PROJECT, args)
            Path(args[3]).write_text(SOURCE + 'VERCEL_OIDC_TOKEN=never-cache-this\n')
            return subprocess.CompletedProcess(args, 0, '', '')
        with patch.object(module.shutil, 'which', return_value='/fixture/vercel'), patch.object(module.subprocess, 'run', side_effect=fake_run):
            module.refresh(self.root, self.store)
        self.assertNotIn('never-cache-this', (self.store / 'development.env').read_text())

    def test_failed_refresh_does_not_destroy_working_source_or_print_cli_secret(self):
        self.ready()
        before = (self.store / 'development.env').read_bytes()
        failure = subprocess.CompletedProcess([], 1, 'secret-cli-output', 'secret-cli-error')
        with patch.object(module.shutil, 'which', return_value='/fixture/vercel'), patch.object(module.subprocess, 'run', return_value=failure):
            with self.assertRaises(module.ConfigError) as caught:
                module.refresh(self.root, self.store)
        self.assertNotIn('secret-cli', str(caught.exception))
        self.assertEqual((self.store / 'development.env').read_bytes(), before)

    def test_publish_uses_stdin_only_skips_local_db_and_is_development_only(self):
        self.ready()
        calls = []
        def fake_run(args, **kwargs):
            calls.append(args)
            self.assertIn('development', args)
            self.assertNotIn('production', args)
            self.assertNotIn('s' * 40, ' '.join(args))
            self.assertNotIn('--force', args)
            self.assertIn('input', kwargs)
            return subprocess.CompletedProcess(args, 0, 'never-display-this', '')
        with patch.object(module.shutil, 'which', return_value='/fixture/vercel'), patch.object(module.subprocess, 'run', side_effect=fake_run):
            module.publish(self.root, self.store)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all('DATABASE_URL' not in args for args in calls))

    def test_refresh_keeps_local_database_and_uses_cloud_session_key(self):
        self.ready()
        def fake_run(args, **kwargs):
            Path(args[3]).write_text('SESSION_SECRET=' + 't' * 40 + '\nDEV_LOGIN=1\n')
            return subprocess.CompletedProcess(args, 0, '', '')
        with patch.object(module.shutil, 'which', return_value='/fixture/vercel'), patch.object(module.subprocess, 'run', side_effect=fake_run):
            module.refresh(self.root, self.store)
        values = module.read(self.store / 'development.env')
        self.assertEqual(values['DATABASE_URL'], module.read(self.source)['DATABASE_URL'])
        self.assertEqual(values['SESSION_SECRET'], 't' * 40)

    def test_refresh_keeps_local_backup_of_write_only_external_secrets(self):
        self.ready()
        values = module.read(self.store / 'development.env')
        values['STEAM_API_KEY'] = 'a' * 32
        module.write_private(self.store / 'development.env', module.encode(values), replace=True)
        def fake_run(args, **kwargs):
            Path(args[3]).write_text(SOURCE)
            return subprocess.CompletedProcess(args, 0, '', '')
        with patch.object(module.shutil, 'which', return_value='/fixture/vercel'), patch.object(module.subprocess, 'run', side_effect=fake_run):
            module.refresh(self.root, self.store)
        self.assertEqual(module.read(self.store / 'development.env')['STEAM_API_KEY'], 'a' * 32)

    def test_publish_external_credentials_as_secrets(self):
        self.ready()
        values = module.read(self.store / 'development.env')
        values['STEAM_API_KEY'] = 'a' * 32
        module.write_private(self.store / 'development.env', module.encode(values), replace=True)
        def fake_run(args, **kwargs):
            if 'STEAM_API_KEY' in args:
                self.assertIn('--sensitive', args)
                self.assertNotIn('--no-sensitive', args)
                self.assertNotIn('a' * 32, ' '.join(args))
            return subprocess.CompletedProcess(args, 0, '', '')
        with patch.object(module.shutil, 'which', return_value='/fixture/vercel'), patch.object(module.subprocess, 'run', side_effect=fake_run):
            module.publish(self.root, self.store)

    def test_uninstall_preserves_source_and_does_not_remove_unowned_hook(self):
        self.ready()
        self.assertEqual(self.run_tool('install').returncode, 0)
        self.assertEqual(self.run_tool('uninstall').returncode, 0)
        self.assertTrue((self.store / 'development.env').exists())
        hook = self.common / 'hooks/post-checkout'
        hook.write_text('unowned-hook')
        self.assertNotEqual(self.run_tool('uninstall').returncode, 0)
        self.assertEqual(hook.read_text(), 'unowned-hook')

    def test_empty_optional_keys_omitted_and_special_chars_roundtrip(self):
        values = module.read(self.source)
        values['DATABASE_URL_UNPOOLED'] = ''
        values['DISCORD_CLIENT_SECRET'] = 'spaces # dollar $ literal \\ quote "'
        module.write_private(self.base / 'encoded', module.encode(values))
        self.assertNotIn('DATABASE_URL_UNPOOLED', (self.base / 'encoded').read_text())
        self.assertEqual(module.read(self.base / 'encoded')['DISCORD_CLIENT_SECRET'], values['DISCORD_CLIENT_SECRET'])


if __name__ == '__main__':
    unittest.main()
