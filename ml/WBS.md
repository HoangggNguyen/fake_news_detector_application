# WBS: Vietnamese Fake-News Classifier

Status legend: `Done` means implemented and verified; `Blocked` means waiting on an external prerequisite; `Pending` means not yet completed.

| WBS | Work package | Status | Evidence / next action |
|---|---|---|---|
| 1.0 | Dataset intake | Done | Primary: original VFND (github.com/thanhhocse96/vfnd-vietnamese-fake-news-datasets, GPL-3.0, commit d703bbe) converted by `ml/prepare_vfnd.py` into `apps/ai-service/vfnd_original/` (git-ignored). Authors ask to be contacted before use and cited. Older simulated sets (`vfnd_dataset_*`) are optional and absent on the current machine. |
| 2.0 | Schema, normalization, deduplication | Done | 226 rows → 225 unique (0 conflicting labels). Stratified 70/15/15 split, seed 42: train 159 (87 real / 72 fake), val 33 and test 33 (18 / 15 each); 0 val/test overlap with train. Training adds 4 finance summaries (163 rows). `domain` column is label-revealing and ignored. |
| 3.0 | EDA report | Done | `ml/artifacts/cleaned.csv`, `eda.json`, `eda.png` regenerated from the 163-row training set. |
| 4.0 | Model comparison and validation | Done | 5-fold CV: Logistic Regression 0.908 acc / 0.904 macro F1 (selected), Linear SVM same, Random Forest 0.892 / 0.886, Multinomial NB 0.854 / 0.842. Holdout 20% (33): 0.909 / 0.909. |
| 5.0 | Acceptance target and independent test | Partially met | Independent VFND val (33): 0.788 acc / 0.785 F1; test (33): 0.848 / 0.848 — just below the 85% target, with ±~3 points per sample. CV/holdout exceed 85%. Report both; do not claim the target on independent data. |
| 6.0 | Model serialization | Done | `ml/artifacts/classifier.joblib`, model version `tfidf-vfnd-original-v4` (git-ignored). |
| 7.0 | FastAPI inference | Done | Service loads every available dataset train split and the v4 artifact. Decision threshold chosen on val by a pre-registered rule (lowest threshold with ≥ 5 concluded and ≥ 90% selective accuracy): 0.70. Test, scored once: 11/33 concluded (33% coverage), 10/11 correct (90.9%); the rest go to the web-evidence layer. |
| 8.0 | Express/UI optional-signal integration | Done | Live Express -> FastAPI persistence tested. Short-input test continued through Groq and returned `classifier_signal: null`; classifier never alters credibility score. |
| 9.0 | Independent model validation | Done (small sample) | VFND val/test are non-overlapping but only 33 rows each. A larger independent set (e.g. ReINTEL) would be needed for stronger claims. |

The current Python 3.13 venv was used for local development; project metadata still targets Python 3.11/3.12. This environment check does not claim support for Python 3.13.
