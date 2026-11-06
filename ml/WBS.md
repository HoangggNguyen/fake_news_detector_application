# WBS: Vietnamese Fake-News Classifier

Status legend: `Done` means implemented and verified; `Blocked` means waiting on an external prerequisite; `Pending` means not yet completed.

| WBS | Work package | Status | Evidence / next action |
|---|---|---|---|
| 1.0 | Dataset intake | Done (user-provided) | `apps/ai-service/vfnd_dataset_1000` was supplied locally. Its README calls it VFND-Mini; provenance/labeling was not independently verified. Raw folder and ZIP are git-ignored. |
| 2.0 | Schema, normalization, deduplication | Done | Loader accepts `text,label` and optional `title`, combines title+body, ignores `domain`, normalizes NFC/URLs/numbers, and removes invalid, duplicate, or conflicting rows. Train: 700 rows -> 80 unique texts; labels among unique texts are 60 real / 20 fake. |
| 3.0 | EDA report | Done (provided split) | `ml/artifacts/cleaned.csv`, `eda.json`, and `eda.png` generated; title+body train text spans 102-120 words (median 107). |
| 4.0 | Model comparison and validation | Done (prototype only) | Four models evaluated. All scored 100% CV and 100% on a 16-sample internal holdout after deduplication; the tiny/repetitive dataset makes this non-generalizable. |
| 5.0 | Acceptance target and independent test | Blocked | Although internal metrics exceed 85%, val/test share all 80 normalized texts with train. No independent examples remain after overlap removal; do not claim the target as validated. |
| 6.0 | Model serialization | Done (prototype) | `ml/artifacts/classifier.joblib` generated (260,637 bytes), plus comparison and training reports; all artifacts are git-ignored. |
| 7.0 | FastAPI inference | Done | Model is loaded and `/predict` returns probabilities. Inputs shorter than the minimum training length (102 words after title+body) abstain with HTTP 422. |
| 8.0 | Express/UI optional-signal integration | Done | Live Express -> FastAPI persistence tested. Short-input test continued through Groq and returned `classifier_signal: null`; classifier never alters credibility score. |
| 9.0 | Independent model validation | Blocked | Requires a non-overlapping, provenance-verified dataset. Obtain one before claiming real-world performance or using the 85% target in project conclusions. |

The current Python 3.13 venv was used for local development; project metadata still targets Python 3.11/3.12. This environment check does not claim support for Python 3.13.

The current Python 3.13 venv was used for local development; project metadata still targets Python 3.11/3.12. This environment check does not claim support for Python 3.13.