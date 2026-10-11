"""Check the agent npm launcher without installing Node or packages."""

from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


LAUNCHER = Path(__file__).with_name("agent-npm.sh").resolve()
BASH = shutil.which("bash")


class AgentNpmTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="jmh-agent-npm-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.home = self.root / "home"
        self.runtime = self.root / "runtime"
        self.cwd = self.root / "project"
        for directory in (self.home, self.runtime, self.cwd):
            directory.mkdir()
        self.env = {"HOME": str(self.home), "PATH": str(self.root / "missing")}

    def executable(self, name, body):
        file = self.runtime / name
        file.write_text("#!/bin/sh\n" + body)
        file.chmod(0o755)

    def runtime_fixture(self):
        self.executable("node", "exit 0\n")
        self.executable("npm", 'printf "%s\\n" "$PWD" "$@"\nexit 23\n')

    def nvm_fixture(self, fail=False):
        directory = self.home / ".nvm"
        directory.mkdir()
        (directory / "nvm.sh").write_text(
            'nvm() {\n  printf "%s\\n" "$*" >&2\n'
            + ("  return 1\n" if fail else f'  export PATH="{self.runtime}"\n')
            + "}\n"
        )

    def run_launcher(self, *args):
        return subprocess.run(
            [BASH, str(LAUNCHER), *args], cwd=self.cwd,
            env=self.env, text=True, capture_output=True, check=False,
        )

    def test_existing_runtime_preserves_arguments_cwd_and_exit_code(self):
        self.runtime_fixture()
        self.env["PATH"] = str(self.runtime)
        result = self.run_launcher("test", "--", "a file.test.ts", "$(literal)")
        self.assertEqual(result.returncode, 23)
        self.assertEqual(result.stdout.splitlines(),
                         [str(self.cwd), "test", "--", "a file.test.ts", "$(literal)"])
        self.assertEqual(result.stderr, "")

    def test_missing_path_activates_existing_nvm_default(self):
        self.runtime_fixture()
        self.nvm_fixture()
        result = self.run_launcher("--version")
        self.assertEqual(result.returncode, 23)
        self.assertIn("use --silent default", result.stderr)

    def test_project_pin_is_used_instead_of_default(self):
        self.runtime_fixture()
        self.nvm_fixture()
        (self.cwd / ".nvmrc").write_text("24\n")
        result = self.run_launcher("test")
        self.assertEqual(result.returncode, 23)
        self.assertIn("use --silent\n", result.stderr)
        self.assertNotIn("default", result.stderr)

    def test_unavailable_project_version_does_not_run_npm(self):
        self.runtime_fixture()
        self.nvm_fixture(fail=True)
        (self.cwd / ".nvmrc").write_text("24\n")
        result = self.run_launcher("ci")
        self.assertEqual(result.returncode, 127)
        self.assertEqual(result.stdout, "")
        self.assertIn("project Node version is unavailable", result.stderr)

    def test_no_runtime_fails_without_installing(self):
        result = self.run_launcher("ci")
        self.assertEqual(result.returncode, 127)
        self.assertEqual(result.stdout, "")
        self.assertIn("Activate an installed Node runtime", result.stderr)

    def test_activation_without_npm_fails_before_execution(self):
        self.executable("node", "exit 0\n")
        self.nvm_fixture()
        result = self.run_launcher("test")
        self.assertEqual(result.returncode, 127)
        self.assertIn("unavailable after runtime activation", result.stderr)


if __name__ == "__main__":
    unittest.main()
