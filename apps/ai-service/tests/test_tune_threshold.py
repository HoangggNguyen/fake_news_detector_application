from app.tune_threshold import select_threshold, summarize


def test_lowest_threshold_meeting_precision_and_count_is_selected() -> None:
    predictions = [(0.95, True)] * 6 + [(0.72, True)] * 4 + [(0.62, False)] * 3 + [(None, None)]
    threshold, met, table = select_threshold(predictions, [0.6, 0.7, 0.9], min_precision=0.9, min_concluded=5)
    assert (threshold, met) == (0.7, True)
    assert table[0]["selective_accuracy"] == 10 / 13


def test_fallback_when_no_threshold_qualifies() -> None:
    threshold, met, _ = select_threshold([(0.6, False)] * 10, [0.5, 0.6], min_precision=0.9, min_concluded=5)
    assert (threshold, met) == (0.9, False)


def test_summary_counts_abstentions_as_not_concluded() -> None:
    row = summarize([(None, None), (0.8, True), (0.5, False)], 0.7)
    assert (row["samples"], row["concluded"], row["correct"]) == (3, 1, 1)
    assert row["coverage"] == 1 / 3
