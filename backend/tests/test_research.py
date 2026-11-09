"""Research use of growers' photos: only with consent (US22, charter §7), and evaluated apart
from the benchmark (§8 "practical evaluation", §22.2)."""

import csv
from datetime import date

import pytest

from app import cli
from app.config import BACKEND_DIR
from app.services import research
from tests.fakes import FakeClassifier
from tests.helpers import add_observation, add_plant


@pytest.fixture(autouse=True)
def classifier(app):
    app.state.classifier = FakeClassifier()  # suggests "aphids" at 80%


def run(settings, *args):
    return cli.main(list(args), settings=settings)


def sighting(client, notes="Green insects on the new shoots"):
    plant = add_plant(client, "Lemon tree")
    observation = add_observation(client, plant["id"], notes=notes)
    client.post(f"/api/observations/{observation['id']}/analysis")
    return observation


def reviewed(grower, specialist, observation, **feedback):
    case = grower.post(f"/api/observations/{observation['id']}/review", json={"note": "Is this right?"}).json()
    body = {"outcome": "identified", "category_key": "whiteflies", "message": "Whitefly nymphs.", **feedback}
    assert specialist.post(f"/api/specialist/cases/{case['id']}/feedback", json=body).status_code == 201


def consent(client, on=True):
    assert client.patch("/api/account/consent", json={"research_consent": on}).status_code == 200


def manifest(folder):
    with (folder / research.MANIFEST).open(encoding="utf-8") as file:
        return list(csv.DictReader(file))


def test_only_consenting_growers_photos_with_a_specialist_check_are_exported(
    grower, other_grower, specialist, settings, tmp_path, capsys
):
    checked = sighting(grower, notes="Private note about my garden")
    reviewed(grower, specialist, checked)
    sighting(grower)  # never checked by a specialist
    reviewed(other_grower, specialist, sighting(other_grower))  # checked, but no consent
    consent(grower)
    out = tmp_path / "research"

    assert run(settings, "export-research-photos", "--out", str(out)) == 0

    rows = manifest(out)
    assert [row["file"] for row in rows] == [f"obs-{checked['id']}.jpg"]
    assert rows[0]["category"] == "whiteflies"
    assert rows[0]["checked_by"] == research.SPECIALIST_REVIEW
    assert rows[0]["observed_on"] == checked["observed_on"]
    assert rows[0]["nabta_result"] == "aphids"
    assert (out / rows[0]["file"]).is_file()
    exported = (out / research.MANIFEST).read_text(encoding="utf-8")
    assert "Private note" not in exported and "Lemon tree" not in exported and "sara" not in exported.lower()
    assert "Exported 1 photos from 1 growers" in capsys.readouterr().out


def test_unchecked_photos_can_be_exported_for_a_reviewer_to_label(grower, settings, tmp_path):
    sighting(grower)
    consent(grower)

    run(settings, "export-research-photos", "--out", str(tmp_path / "set"), "--include-unchecked")

    rows = manifest(tmp_path / "set")
    assert len(rows) == 1 and rows[0]["category"] == "" and rows[0]["checked_by"] == ""


def test_an_insect_outside_nabtas_categories_is_exported_as_unsupported(grower, specialist, settings, tmp_path):
    reviewed(grower, specialist, sighting(grower), category_key=None, other_pest="Ladybird larva")
    consent(grower)

    run(settings, "export-research-photos", "--out", str(tmp_path / "set"))

    assert manifest(tmp_path / "set")[0]["category"] == research.UNSUPPORTED


def test_exporting_again_drops_withdrawn_photos_and_keeps_the_teams_entries(
    grower, other_grower, specialist, settings, tmp_path
):
    mine, theirs = sighting(grower), sighting(other_grower)
    reviewed(grower, specialist, mine)
    reviewed(other_grower, specialist, theirs)
    consent(grower)
    consent(other_grower)
    out = tmp_path / "set"
    run(settings, "export-research-photos", "--out", str(out))
    rows = manifest(out)
    for row in rows:
        row["conditions"] = "outdoors, phone, daylight"
    with (out / research.MANIFEST).open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=research.COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    consent(other_grower, on=False)
    run(settings, "export-research-photos", "--out", str(out))

    rows = manifest(out)
    assert [row["file"] for row in rows] == [f"obs-{mine['id']}.jpg"]
    assert rows[0]["conditions"] == "outdoors, phone, daylight"
    assert not (out / f"obs-{theirs['id']}.jpg").exists()


def test_photos_are_never_exported_into_the_repository(grower, settings, capsys):
    consent(grower)

    assert run(settings, "export-research-photos", "--out", str(BACKEND_DIR / "research-photos")) == 1
    assert "outside the repository" in capsys.readouterr().err
    assert not (BACKEND_DIR / "research-photos").exists()


def write_set(folder, rows, photo):
    folder.mkdir()
    for row in rows:
        if row["file"]:
            (folder / row["file"]).write_bytes(photo)
    with (folder / research.MANIFEST).open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=research.COLUMNS)
        writer.writeheader()
        writer.writerows({column: row.get(column, "") for column in research.COLUMNS} for row in rows)


@pytest.fixture
def photo():
    from tests.images import jpeg

    return jpeg()


def test_the_report_measures_supported_and_unsupported_insects_separately(tmp_path, photo):
    rows = [
        {"file": "a.jpg", "category": "aphids", "checked_by": "Dr Khalid", "conditions": "indoor"},
        {"file": "b.jpg", "category": "whiteflies", "checked_by": "Dr Khalid", "conditions": "indoor"},
        {"file": "c.jpg", "category": "unsupported", "checked_by": "Dr Khalid", "conditions": "garden"},
        {"file": "d.jpg", "category": "", "conditions": "garden"},
        {"file": "e.jpg", "category": "ladybirds"},
    ]
    write_set(tmp_path / "set", rows, photo)
    # Every photo looks like aphids at 80%: accepted, so the unsupported one is wrongly accepted too.
    report = research.evaluate_collected(FakeClassifier(), [tmp_path / "set"], date(2026, 10, 27))

    assert "on 2026-10-27, with model `test-model-1`" in report
    assert "| Aphids | 1 |" in report and "| Whiteflies | 1 |" in report
    assert "| Insects outside Nabta's categories | 1 |" in report
    assert "| **Total** | **3** |" in report
    assert "Labels checked by: Dr Khalid (3)." in report
    assert "no category yet (1)" in report and "unknown category “ladybirds” (1)" in report
    assert "| Supported insects accepted | 100.0% (2 of 2) |" in report
    assert "| Accuracy of accepted results | 50.0% (1 of 2) |" in report
    assert "| Insects outside Nabta's categories shown as unclear | 0.0% (0 of 1) |" in report
    assert "| indoor | 2 | 50.0% (1 of 2) | 100.0% (2 of 2) | – |" in report
    assert "| Aphids | 0.500 | 1.000 | 0.667 | 1 |" in report
    assert "Macro F1 over the 2 categories with photos: **0.333**" in report
    assert "Fewer than 30 photos for: Aphids, Whiteflies" in report


def test_the_report_uses_nabtas_unclear_rule(tmp_path, photo):
    write_set(tmp_path / "set", [{"file": "c.jpg", "category": "unsupported"}], photo)

    report = research.evaluate_collected(
        FakeClassifier(probabilities=(0.55, 0.3, 0.15)), [tmp_path / "set"], date(2026, 10, 27)
    )

    assert "| Insects outside Nabta's categories shown as unclear | 100.0% (1 of 1) |" in report


def test_evaluating_needs_labels_and_a_model(settings, tmp_path, photo, monkeypatch, capsys):
    write_set(tmp_path / "set", [{"file": "a.jpg", "category": ""}], photo)
    monkeypatch.setattr(cli, "load_classifier", lambda model_dir: FakeClassifier())
    assert run(settings, "evaluate-collected", "--set", str(tmp_path / "set")) == 1
    assert "category column" in capsys.readouterr().err

    monkeypatch.setattr(cli, "load_classifier", lambda model_dir: None)
    assert run(settings, "evaluate-collected", "--set", str(tmp_path / "set")) == 1
    assert "No pest model" in capsys.readouterr().err


def test_the_report_is_written_where_asked(settings, tmp_path, photo, monkeypatch):
    write_set(tmp_path / "set", [{"file": "a.jpg", "category": "aphids"}], photo)
    monkeypatch.setattr(cli, "load_classifier", lambda model_dir: FakeClassifier())

    assert run(settings, "evaluate-collected", "--set", str(tmp_path / "set"), "--report", str(tmp_path / "out.md")) == 0

    assert (tmp_path / "out.md").read_text(encoding="utf-8").startswith("# Nabta pest model: growers' photos")
