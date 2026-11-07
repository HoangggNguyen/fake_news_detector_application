# WBS: Vietnamese Fake-News Classifier

Status legend: `Done` means implemented and verified; `Blocked` means waiting on an external prerequisite; `Pending` means not yet completed.

| WBS | Work package | Status | Evidence / next action |
|---|---|---|---|
| 1.0 | Dataset intake | Done (user-provided) | `vfnd_dataset_1000` (README: VFND-Mini) and `vfnd_dataset_deduplicated` were supplied locally. Source and labeling for both are not independently verified. The new set has 20 rows (10 real / 10 fake); its train split has 14 rows (7 per label). Dataset folders and ZIPs are git-ignored. |
| 2.0 | Schema, normalization, deduplication | Done | Loader accepts `text,label` and optional `title`, combines title+body, ignores `domain`, normalizes NFC/URLs/numbers, and removes invalid, duplicate, or conflicting rows across every training input. Existing train contributes 80 unique texts (60 real / 20 fake); new train adds 14 non-overlapping texts (7 real / 7 fake); combined training set: 94 texts (67 real / 27 fake). |
| 3.0 | EDA report | Done (provided splits) | `ml/artifacts/cleaned.csv`, `eda.json`, and `eda.png` regenerated from the combined 94-row training set. |
| 4.0 | Model comparison and validation | Done (prototype only) | Four models evaluated. The internal CV/19-sample holdout scored up to 100%; the new validation and test splits each scored 100% on only 3 examples. These tiny, unverified samples do not establish generalization. |
| 5.0 | Acceptance target and independent test | Blocked | The 3-row validation and 3-row test scores are too small and their provenance/labels are unverified. Do not claim real-world accuracy or acceptance-target validation; obtain a larger authorized, provenance-verified, non-overlapping test set. |
| 6.0 | Model serialization | Done (prototype) | `ml/artifacts/classifier.joblib` regenerated from the combined training inputs, alongside comparison, EDA, and training reports; artifacts are git-ignored. |
| 7.0 | FastAPI inference | Done | The regenerated artifact supports `/predict` probabilities and abstains for inputs shorter than its minimum training length (55 words). FastAPI is not currently reachable; start it or restart an existing process to load this artifact. |
| 8.0 | Express/UI optional-signal integration | Done | Live Express -> FastAPI persistence tested. Short-input test continued through Groq and returned `classifier_signal: null`; classifier never alters credibility score. |
| 9.0 | Independent model validation | Blocked | Requires a non-overlapping, provenance-verified dataset. Obtain one before claiming real-world performance or using the 85% target in project conclusions. |

The current Python 3.13 venv was used for local development; project metadata still targets Python 3.11/3.12. This environment check does not claim support for Python 3.13.

The current Python 3.13 venv was used for local development; project metadata still targets Python 3.11/3.12. This environment check does not claim support for Python 3.13.