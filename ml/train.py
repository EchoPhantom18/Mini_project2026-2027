"""
ml/train.py - Model Training & District-wise Validation for JALDHRISHTI.

Compares XGBoost vs Random Forest using GroupKFold cross-validation
grouped by district. This ensures that every test fold measures performance
on completely unseen districts (spatial generalization).

Features used are strictly region-neutral physical variables:
- elevation_mean, elevation_min
- slope_mean
- dist_to_river_m
- drainage_density
- rain_7d_mm, rain_15d_mm, rain_30d_mm

Outputs:
- ml/flood_risk_model.joblib: Best calibrated model ready for API inference
- ml/model_evaluation_metrics.json: Measured cross-validation metrics
"""

import json
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import GroupKFold
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    brier_score_loss,
    classification_report
)
from xgboost import XGBClassifier

from ml.config import (
    TRAINING_DATA_PATH,
    MODEL_SAVE_PATH,
    MODEL_METRICS_PATH,
    FEATURE_COLUMNS,
    TARGET_COLUMN,
    GROUP_COLUMN
)


def load_dataset():
    """Loads and validates the engineered feature dataset."""
    if not TRAINING_DATA_PATH.exists():
        raise FileNotFoundError(f"Training dataset not found at {TRAINING_DATA_PATH}")

    df = pd.read_csv(TRAINING_DATA_PATH)
    print(f"Loaded dataset: {len(df):,} rows from {TRAINING_DATA_PATH}")
    print(f"Districts ({df[GROUP_COLUMN].nunique()}): {sorted(df[GROUP_COLUMN].unique().tolist())}")
    print(f"Target distribution: {df[TARGET_COLUMN].value_counts().to_dict()}")

    # Strict check: Ensure no spatial leakage features (lat, lon, zone_id, district) in inputs
    for forbidden in ["centroid_lat", "centroid_lon", "zone_id", "district", "event_id"]:
        if forbidden in FEATURE_COLUMNS:
            raise ValueError(f"SPATIAL LEAK DETECTED: {forbidden} must not be a model input feature!")

    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]
    groups = df[GROUP_COLUMN]

    print(f"\nModel Input Features ({len(FEATURE_COLUMNS)}):")
    for col in FEATURE_COLUMNS:
        print(f"  - {col}")

    return X, y, groups, df


def evaluate_model_cv(model, model_name, X, y, groups, n_splits=5):
    """
    Evaluates a model using GroupKFold on districts.
    Computes out-of-fold Precision, Recall, F1, ROC-AUC, and Brier calibration score.
    """
    print(f"\nEvaluating {model_name} with {n_splits}-fold District GroupKFold...")
    gkf = GroupKFold(n_splits=n_splits)

    oof_preds = np.zeros(len(y))
    oof_probs = np.zeros(len(y))

    fold_metrics = []

    for fold, (train_idx, test_idx) in enumerate(gkf.split(X, y, groups=groups), 1):
        test_districts = groups.iloc[test_idx].unique().tolist()
        X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
        X_test, y_test = X.iloc[test_idx], y.iloc[test_idx]

        # Train on training folds
        model.fit(X_train, y_train)

        # Predict probabilities on unseen test districts
        y_prob = model.predict_proba(X_test)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)

        oof_probs[test_idx] = y_prob
        oof_preds[test_idx] = y_pred

        f_prec = precision_score(y_test, y_pred, zero_division=0)
        f_rec = recall_score(y_test, y_pred, zero_division=0)
        f_f1 = f1_score(y_test, y_pred, zero_division=0)
        f_auc = roc_auc_score(y_test, y_prob)

        fold_metrics.append({
            "fold": fold,
            "held_out_districts": test_districts,
            "precision": round(f_prec, 4),
            "recall": round(f_rec, 4),
            "f1": round(f_f1, 4),
            "roc_auc": round(f_auc, 4)
        })

        print(f"  Fold {fold} (Held out: {', '.join(test_districts)}): "
              f"Precision={f_prec:.4f}, Recall={f_rec:.4f}, F1={f_f1:.4f}, ROC-AUC={f_auc:.4f}")

    # Overall Out-Of-Fold Metrics
    total_prec = precision_score(y, oof_preds)
    total_rec = recall_score(y, oof_preds)
    total_f1 = f1_score(y, oof_preds)
    total_auc = roc_auc_score(y, oof_probs)
    brier = brier_score_loss(y, oof_probs)

    print(f"\n--> {model_name} Overall Out-of-Fold Results:")
    print(f"    ROC-AUC:   {total_auc:.4f}")
    print(f"    F1-Score:  {total_f1:.4f}")
    print(f"    Precision: {total_prec:.4f}")
    print(f"    Recall:    {total_rec:.4f}")
    print(f"    Brier Score (lower is better calibration): {brier:.4f}")

    # Probability calibration check
    prob_true, prob_pred = calibration_curve(y, oof_probs, n_bins=5, strategy="uniform")
    calibration_info = {
        "bin_predicted_prob": [round(float(p), 4) for p in prob_pred],
        "bin_actual_fraction": [round(float(p), 4) for p in prob_true],
    }

    results = {
        "model_name": model_name,
        "roc_auc": round(float(total_auc), 4),
        "f1": round(float(total_f1), 4),
        "precision": round(float(total_prec), 4),
        "recall": round(float(total_rec), 4),
        "brier_score": round(float(brier), 4),
        "fold_details": fold_metrics,
        "calibration": calibration_info
    }

    return results, model


def run_training_and_comparison():
    """Trains both Random Forest and XGBoost, compares them, and saves the best model."""
    print("=" * 60)
    print("JALDHRISHTI ML TRAINING PIPELINE (Step 1)")
    print("=" * 60)

    X, y, groups, full_df = load_dataset()

    # 1. Define Candidate Models
    # Using balanced class weights or scale_pos_weight since flood events are ~20% of dataset
    neg_count = (y == 0).sum()
    pos_count = (y == 1).sum()
    scale_pos = neg_count / max(pos_count, 1)

    rf_model = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        min_samples_split=20,
        class_weight="balanced",
        n_jobs=-1,
        random_state=42
    )

    xgb_model = XGBClassifier(
        n_estimators=150,
        max_depth=6,
        learning_rate=0.08,
        scale_pos_weight=scale_pos,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        n_jobs=-1,
        random_state=42
    )

    # 2. Evaluate with GroupKFold
    rf_results, _ = evaluate_model_cv(rf_model, "Random Forest", X, y, groups, n_splits=5)
    xgb_results, _ = evaluate_model_cv(xgb_model, "XGBoost", X, y, groups, n_splits=5)

    # 3. Model Comparison & Selection
    print("\n" + "=" * 60)
    print("MODEL COMPARISON SUMMARY")
    print("=" * 60)
    print(f"Random Forest -> ROC-AUC: {rf_results['roc_auc']}, F1: {rf_results['f1']}, Brier: {rf_results['brier_score']}")
    print(f"XGBoost       -> ROC-AUC: {xgb_results['roc_auc']}, F1: {xgb_results['f1']}, Brier: {xgb_results['brier_score']}")

    # Select best model primarily based on ROC-AUC and F1
    if xgb_results["roc_auc"] >= rf_results["roc_auc"]:
        best_name = "XGBoost"
        best_base_model = xgb_model
        best_metrics = xgb_results
    else:
        best_name = "Random Forest"
        best_base_model = rf_model
        best_metrics = rf_results

    print(f"\nWinning Model: {best_name}")

    # 4. Final Fit & Probability Calibration on Full Dataset
    print(f"\nFitting final {best_name} model and calibrating probabilities...")
    # CalibratedClassifierCV ensures predicted probabilities are well-calibrated (0.0 to 1.0)
    calibrated_model = CalibratedClassifierCV(estimator=best_base_model, cv=3, method="sigmoid")
    calibrated_model.fit(X, y)

    # 5. Feature Importances (from the underlying base estimator)
    best_base_model.fit(X, y)
    importances = {}
    if hasattr(best_base_model, "feature_importances_"):
        for feat, imp in zip(FEATURE_COLUMNS, best_base_model.feature_importances_):
            importances[feat] = round(float(imp), 4)
        print("\nFeature Importances:")
        for feat, imp in sorted(importances.items(), key=lambda x: x[1], reverse=True):
            print(f"  {feat:20s}: {imp:.4f}")

    # 6. Save Artifacts
    # Save model pipeline with feature list metadata
    model_payload = {
        "model": calibrated_model,
        "base_model_name": best_name,
        "feature_columns": FEATURE_COLUMNS,
        "feature_importances": importances,
        "target_column": TARGET_COLUMN,
    }

    joblib.dump(model_payload, MODEL_SAVE_PATH)
    print(f"\nSaved calibrated model to: {MODEL_SAVE_PATH}")

    # Save evaluation report to JSON
    report = {
        "winning_model": best_name,
        "comparison": {
            "random_forest": rf_results,
            "xgboost": xgb_results
        },
        "feature_importances": importances,
        "feature_columns": FEATURE_COLUMNS,
        "total_training_samples": len(df_sample := X),
        "validation_strategy": "5-fold District GroupKFold (unseen district evaluation)"
    }

    with open(MODEL_METRICS_PATH, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Saved evaluation metrics to: {MODEL_METRICS_PATH}")

    return report


if __name__ == "__main__":
    run_training_and_comparison()
