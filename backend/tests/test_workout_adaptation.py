from types import SimpleNamespace

from app.intelligence.adaptation import build_time_equipment_draft


def ex(ex_id, name, equipment, muscles=("legs",), category="lower"):
    return SimpleNamespace(id=ex_id, name=name, equipment_required=equipment,
                           muscle_groups=list(muscles), category=category)


def item(exercise_id, sets=3, reps=10):
    return SimpleNamespace(exercise_id=exercise_id, planned_sets=sets,
                           planned_reps=reps, planned_weight_kg=None)


def test_shorter_session_produces_explained_draft_without_mutating_plan():
    plan = [item(1, 4)]
    catalogue = [ex(1, "Barbell Squat", ["barbell"])]
    draft = build_time_equipment_draft(plan, catalogue, 10, ["bodyweight"])
    assert "EQUIPMENT_MISMATCH" in {r["rule_id"] for r in draft["reasons"]}
    assert plan[0].planned_sets == 4
    assert draft["exercises"] == []  # no verified bodyweight alternative in catalogue
    assert any("removed" in change for change in draft["changes"])


def test_catalogue_substitution_preserves_focus_and_bodyweight():
    plan = [item(1, 3)]
    catalogue = [ex(1, "Dumbbell Squat", ["dumbbells"]), ex(2, "Bodyweight Squat", ["bodyweight"])]
    draft = build_time_equipment_draft(plan, catalogue, 20, ["bodyweight"])
    assert draft["exercises"][0]["name"] == "Bodyweight Squat"
    assert "EQUIPMENT_MISMATCH" in {r["rule_id"] for r in draft["reasons"]}


def test_empty_catalogue_never_invents_exercises():
    draft = build_time_equipment_draft([item(99)], [], 15, ["bodyweight"])
    assert draft["exercises"] == []
