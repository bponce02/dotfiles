import importlib.machinery
import importlib.util
import os
import pathlib
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
LOADER = importlib.machinery.SourceFileLoader("niri_screenshot_tool", str(ROOT / "config/.local/bin/niri-screenshot-tool"))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
TOOL = importlib.util.module_from_spec(SPEC)
LOADER.exec_module(TOOL)
PNG = b"\x89PNG\r\n\x1a\n" + TOOL.PNG_END


class ScreenshotToolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="screenshot test ")
        self.addCleanup(self.temp.cleanup)
        self.home = pathlib.Path(self.temp.name)
        self.binary = self.home / "Screenshot Tool"
        self.binary.write_text("#!/bin/sh\nexit 0\n")
        self.binary.chmod(0o755)
        self.env = mock.patch.dict(os.environ, {
            "HOME": str(self.home),
            "SCREENSHOT_TOOL_BIN": str(self.binary),
            "SCREENSHOT_TOOL_CAPTURE_TIMEOUT": "0.01",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_capture_modes_use_niri_and_open_exact_path(self):
        for mode, action in [("region", "screenshot"), ("screen", "screenshot-screen"), ("window", "screenshot-window")]:
            with self.subTest(mode=mode):
                def capture(args, **kwargs):
                    self.assertEqual(args[:4], ["niri", "msg", "action", action])
                    self.assertEqual(args[4], "--path")
                    self.assertTrue(kwargs["check"])
                    pathlib.Path(args[5]).write_bytes(PNG)
                with mock.patch.object(TOOL.subprocess, "run", side_effect=capture) as niri, mock.patch.object(TOOL, "launch") as launch:
                    TOOL.run(mode)
                    path = niri.call_args.args[0][5]
                    launch.assert_called_once_with(self.binary, ["--open", path])

    def test_cancel_does_not_open_stale_screenshot(self):
        folder = self.home / "Pictures/Screenshots"
        folder.mkdir(parents=True)
        (folder / "old.png").write_bytes(PNG)
        with mock.patch.object(TOOL.subprocess, "run"), mock.patch.object(TOOL, "launch") as launch:
            TOOL.run("region")
            launch.assert_not_called()

    def test_partial_png_is_not_ready(self):
        path = self.home / "partial.png"
        path.write_bytes(PNG[:-1])
        self.assertFalse(TOOL.wait_for_capture(path, 0.01))
        path.write_bytes(PNG)
        self.assertTrue(TOOL.wait_for_capture(path, 0.01))

    def test_latest_ignores_incomplete_files(self):
        folder = self.home / "Pictures/Screenshots"
        folder.mkdir(parents=True)
        old, latest, partial = [folder / name for name in ["old.png", "latest image.png", "partial.png"]]
        old.write_bytes(PNG)
        latest.write_bytes(PNG)
        partial.write_bytes(PNG[:-1])
        os.utime(old, (1, 1))
        os.utime(latest, (2, 2))
        with mock.patch.object(TOOL, "launch") as launch:
            TOOL.run("last")
            launch.assert_called_once_with(self.binary, ["--open", str(latest)])

    def test_no_last_image_reports_error(self):
        with self.assertRaisesRegex(RuntimeError, "No screenshots"):
            TOOL.run("last")

    def test_editor_and_clipboard_do_not_capture(self):
        for mode, flag in [("editor", "--editor"), ("clipboard", "--paste")]:
            with mock.patch.object(TOOL, "launch") as launch, mock.patch.object(TOOL.subprocess, "run") as niri:
                TOOL.run(mode)
                launch.assert_called_once_with(self.binary, [flag])
                niri.assert_not_called()

    def test_missing_binary_fails_before_capture(self):
        self.binary.unlink()
        with mock.patch.object(TOOL.subprocess, "run") as niri:
            with self.assertRaisesRegex(RuntimeError, "executable not found"):
                TOOL.run("screen")
            niri.assert_not_called()

    def test_launch_preserves_paths_and_detaches(self):
        with mock.patch.dict(os.environ, {"XDG_STATE_HOME": str(self.home / "state")}), mock.patch.object(TOOL.subprocess, "Popen") as process:
            TOOL.launch(self.binary, ["--open", "/tmp/image with spaces.png"])
            self.assertEqual(process.call_args.args[0], [str(self.binary), "--open", "/tmp/image with spaces.png"])
            self.assertTrue(process.call_args.kwargs["start_new_session"])
            self.assertNotIn("shell", process.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
