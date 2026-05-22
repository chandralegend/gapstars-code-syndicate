import json

from app.core import storage


def test_init_layout_creates_subdirs():
    root = storage.init_task_layout("abc-123")
    assert root.is_dir()
    assert storage.input_dir("abc-123").is_dir()
    assert storage.files_dir("abc-123").is_dir()
    assert storage.output_dir("abc-123").is_dir()
    assert storage.screenshots_dir("abc-123").is_dir()
    assert storage.logs_dir("abc-123").is_dir()


def test_write_and_read_input_json():
    storage.init_task_layout("t1")
    storage.write_input_json("t1", {"prompt": "hi", "model": "m"})
    data = json.loads((storage.task_dir("t1") / "input.json").read_text())
    assert data["prompt"] == "hi"


def test_read_output_json_missing_returns_none():
    storage.init_task_layout("t2")
    assert storage.read_output_json("t2", "result.json") is None


def test_read_output_json_present():
    storage.init_task_layout("t3")
    (storage.output_dir("t3") / "result.json").write_text('{"status": "succeeded"}')
    assert storage.read_output_json("t3", "result.json") == {"status": "succeeded"}


def test_remove_task_dir_idempotent():
    storage.init_task_layout("t4")
    storage.remove_task_dir("t4")
    storage.remove_task_dir("t4")  # should not raise
    assert not storage.task_dir("t4").exists()
