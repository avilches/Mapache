"""Tests para admin/lib/levels.py — parseo, construcción y helpers de batch."""
import json
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib.levels import (
    LEVEL_TAIL_RE,
    build_level_id,
    create_level_dir,
    level_base_and_n,
    max_batch_n,
    parse_level_id,
    scan_level_dirs,
)


# ── LEVEL_TAIL_RE ─────────────────────────────────────────────────────────────

class TestLevelTailRe:
    def test_matches_valid(self):
        m = LEVEL_TAIL_RE.match("daily-life-loose-phrases-1-A1")
        assert m is not None
        assert m.group("cefr") == "A1"
        assert m.group("prefix") == "daily-life-loose-phrases-1"

    def test_all_cefr_levels(self):
        for cefr in ("A1", "A2", "B1", "B2", "C1", "C2"):
            assert LEVEL_TAIL_RE.match(f"work-day-to-day-1-{cefr}") is not None

    def test_rejects_old_format_with_trailing_n(self):
        # Formato viejo: topic-level-CEFR-N al final ya no es válido como CEFR
        assert LEVEL_TAIL_RE.match("daily-life-loose-phrases-A1-1") is None

    def test_rejects_no_cefr(self):
        assert LEVEL_TAIL_RE.match("daily-life-loose-phrases-1") is None

    def test_rejects_empty(self):
        assert LEVEL_TAIL_RE.match("") is None


# ── parse_level_id ────────────────────────────────────────────────────────────

class TestParseLevelId:
    TOPICS = {"daily-life", "work", "travel", "abstract-everyday"}

    def test_basic(self):
        result = parse_level_id("daily-life-loose-phrases-1-A1", self.TOPICS)
        assert result == ("daily-life", "loose-phrases-1", "A1")

    def test_multi_word_topic(self):
        result = parse_level_id("abstract-everyday-want-and-need-1-A1", self.TOPICS)
        assert result == ("abstract-everyday", "want-and-need-1", "A1")

    def test_batch_2(self):
        result = parse_level_id("daily-life-loose-phrases-2-A1", self.TOPICS)
        assert result == ("daily-life", "loose-phrases-2", "A1")

    def test_returns_none_for_invalid(self):
        assert parse_level_id("no-cefr-here", self.TOPICS) is None

    def test_returns_none_for_unknown_topic(self):
        assert parse_level_id("unknown-topic-foo-1-B1", self.TOPICS) is None

    def test_uses_meta_json_when_no_topics_given(self, tmp_path):
        level_dir = tmp_path / "daily-life-loose-phrases-1-A1"
        level_dir.mkdir()
        (level_dir / "meta.json").write_text(
            json.dumps({"topicId": "daily-life"}), encoding="utf-8"
        )
        # Monkey-patch LEVELS_DIR
        import lib.levels as lv_mod
        original = lv_mod.LEVELS_DIR
        lv_mod.LEVELS_DIR = str(tmp_path)
        try:
            result = parse_level_id("daily-life-loose-phrases-1-A1")
            assert result == ("daily-life", "loose-phrases-1", "A1")
        finally:
            lv_mod.LEVELS_DIR = original


# ── build_level_id ────────────────────────────────────────────────────────────

class TestBuildLevelId:
    def test_basic(self):
        assert build_level_id("daily-life", "loose-phrases-1", "A1") == "daily-life-loose-phrases-1-A1"

    def test_batch_2(self):
        assert build_level_id("work", "day-to-day-2", "B1") == "work-day-to-day-2-B1"


# ── level_base_and_n ──────────────────────────────────────────────────────────

class TestLevelBaseAndN:
    def test_batch_1(self):
        assert level_base_and_n("loose-phrases-1") == ("loose-phrases", 1)

    def test_batch_2(self):
        assert level_base_and_n("loose-phrases-2") == ("loose-phrases", 2)

    def test_high_n(self):
        assert level_base_and_n("some-level-10") == ("some-level", 10)

    def test_no_n_returns_none(self):
        assert level_base_and_n("loose-phrases") is None

    def test_only_number_returns_none(self):
        # "1" tiene base vacía — no es válido como levelId
        assert level_base_and_n("1") is None

    def test_multi_word_base(self):
        assert level_base_and_n("want-and-need-1") == ("want-and-need", 1)


# ── max_batch_n ───────────────────────────────────────────────────────────────

class TestMaxBatchN:
    def test_single_batch(self):
        dirs = ["daily-life-loose-phrases-1-A1"]
        assert max_batch_n("daily-life", "loose-phrases", "A1", dirs) == 1

    def test_multiple_batches(self):
        dirs = [
            "daily-life-loose-phrases-1-A1",
            "daily-life-loose-phrases-2-A1",
            "daily-life-loose-phrases-3-A1",
        ]
        assert max_batch_n("daily-life", "loose-phrases", "A1", dirs) == 3

    def test_ignores_other_topics(self):
        dirs = ["work-loose-phrases-1-A1", "daily-life-loose-phrases-1-A1"]
        assert max_batch_n("work", "loose-phrases", "A1", dirs) == 1

    def test_ignores_other_cefr(self):
        dirs = ["daily-life-loose-phrases-1-A1", "daily-life-loose-phrases-1-B1"]
        assert max_batch_n("daily-life", "loose-phrases", "A1", dirs) == 1
        assert max_batch_n("daily-life", "loose-phrases", "B1", dirs) == 1

    def test_empty_dirs_returns_0(self):
        assert max_batch_n("daily-life", "loose-phrases", "A1", []) == 0

    def test_no_match_returns_0(self):
        dirs = ["work-day-to-day-1-B1"]
        assert max_batch_n("daily-life", "loose-phrases", "A1", dirs) == 0


# ── create_level_dir ──────────────────────────────────────────────────────────

class TestCreateLevelDir:
    def test_creates_dir_and_meta(self, tmp_path):
        import lib.levels as lv_mod
        original = lv_mod.LEVELS_DIR
        lv_mod.LEVELS_DIR = str(tmp_path)
        try:
            full_id = create_level_dir(
                topic_id="daily-life",
                level_id="loose-phrases-1",
                cefr="A1",
                title="Frases sueltas",
                description="Desc",
                prompt="Prompt test",
            )
            assert full_id == "daily-life-loose-phrases-1-A1"
            meta_path = tmp_path / full_id / "meta.json"
            assert meta_path.exists()
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            assert meta["id"] == "daily-life-loose-phrases-1-A1"
            assert meta["topicId"] == "daily-life"
            assert meta["difficulty"] == "A1"
            assert meta["prompt"] == "Prompt test"
        finally:
            lv_mod.LEVELS_DIR = original

    def test_raises_if_exists(self, tmp_path):
        import lib.levels as lv_mod
        original = lv_mod.LEVELS_DIR
        lv_mod.LEVELS_DIR = str(tmp_path)
        try:
            create_level_dir("daily-life", "loose-phrases-1", "A1", "T", "D")
            with pytest.raises(FileExistsError):
                create_level_dir("daily-life", "loose-phrases-1", "A1", "T", "D")
        finally:
            lv_mod.LEVELS_DIR = original

    def test_invalid_cefr_raises(self, tmp_path):
        import lib.levels as lv_mod
        original = lv_mod.LEVELS_DIR
        lv_mod.LEVELS_DIR = str(tmp_path)
        try:
            with pytest.raises(ValueError):
                create_level_dir("daily-life", "loose-phrases-1", "X9", "T", "D")
        finally:
            lv_mod.LEVELS_DIR = original

    def test_no_prompt_omitted_from_meta(self, tmp_path):
        import lib.levels as lv_mod
        original = lv_mod.LEVELS_DIR
        lv_mod.LEVELS_DIR = str(tmp_path)
        try:
            full_id = create_level_dir("daily-life", "test-1", "A2", "T", "D")
            meta = json.loads((tmp_path / full_id / "meta.json").read_text())
            assert "prompt" not in meta
        finally:
            lv_mod.LEVELS_DIR = original


# ── roundtrip: build → parse ──────────────────────────────────────────────────

class TestRoundtrip:
    TOPICS = {"daily-life", "work", "travel", "abstract-everyday", "awkward-conversations"}

    @pytest.mark.parametrize("topic,level,cefr", [
        ("daily-life", "loose-phrases-1", "A1"),
        ("daily-life", "loose-phrases-2", "A1"),
        ("work", "negotiation-1", "C1"),
        ("abstract-everyday", "want-and-need-1", "A1"),
        ("awkward-conversations", "diplomacy-1", "C1"),
    ])
    def test_build_then_parse(self, topic, level, cefr):
        full_id = build_level_id(topic, level, cefr)
        parsed = parse_level_id(full_id, self.TOPICS)
        assert parsed == (topic, level, cefr)
