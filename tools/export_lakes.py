"""Export evaluated Task 1 results only; never runs training or finalisation.

Schema: areas in km²; model change/lower/upper are proportional fractions
(expm1 of stored log ratios); classifiers' probabilities are fractions.
Metrics retain source names/units. pr_auc is average precision, not trapezoidal AUC.
History includes observed endpoints from available consecutive transitions only.
"""
from pathlib import Path
import csv
import hashlib
import json
import math
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[2]
PREDICTIONS = 'artifacts/task1/final_2024/predictions.csv'
METRICS = 'artifacts/task1/final_2024/metrics.json'
MANIFEST = 'artifacts/task1/final_2024/manifest.json'
COHORT = 'data/processed/task1_primary_cohort.csv'
HISTORY = 'data/processed/task1_all_transitions.csv'
NAMES = {
    'persistence-history': 'Persistence',
    'previous-change-history': 'Previous change',
    'ridge-history': 'Ridge regression',
    'svgp-gpr-history-matern32-256': 'Gaussian process regression',
    'xgboost-history_physical-d2_lr003': 'XGBoost',
    'logistic-history': 'Logistic regression',
    'prevalence-history': 'Prevalence baseline',
    'svgp-gpc-history_physical-matern32-256': 'Gaussian process classification',
}


def rows(path):
    with (ROOT / path).open(newline='', encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def digest(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def build():
    manifest = json.loads((ROOT / MANIFEST).read_text())
    for path in (PREDICTIONS, METRICS):
        if digest(path) != manifest['content_sha256'][Path(path).name]:
            raise ValueError(f'Sealed manifest hash mismatch: {path}')
    predictions = rows(PREDICTIONS)
    cohort = {row['row_id']: row for row in rows(COHORT)}
    grouped = defaultdict(list)
    for row in predictions:
        grouped[row['row_id']].append(row)
    histories = defaultdict(dict)
    for row in rows(HISTORY):
        for year_key, area_key in [('base_year', 'base_area'), ('target_year', 'target_area')]:
            year, area = int(row[year_key]), float(row[area_key])
            previous = histories[row['GLO_ID']].get(year)
            if previous is not None and previous != area:
                raise ValueError('Conflicting historical area observations')
            histories[row['GLO_ID']][year] = area
    lakes = []
    for row_id, results in sorted(grouped.items()):
        row = cohort[row_id]
        if int(row['target_year']) != 2024 or len(results) != len(NAMES):
            raise ValueError('Unexpected final evaluation group')
        base_area, actual_area = float(row['base_area']), float(row['target_area'])
        models, classifiers = [], []
        for result in results:
            model_id = result['candidate_id']
            item = {'id': model_id, 'name': NAMES[model_id]}
            if result['task'] == 'regression':
                if not math.isclose(math.exp(float(result['actual'])) * base_area, actual_area, rel_tol=1e-12):
                    raise ValueError('Stored actual does not match cohort area')
                item.update({key: math.expm1(float(result[source])) for key, source in
                             [('change', 'prediction'), ('lower', 'lower'), ('upper', 'upper')]})
                models.append(item)
            else:
                probability = float(result['prediction'])
                if not 0 <= probability <= 1 or int(result['actual']) != int(row['expansion']):
                    raise ValueError('Invalid classification result')
                item['probability'] = probability
                classifiers.append(item)
        lakes.append({'id': row['GLO_ID'], 'basin': row['BASIN'],
                      'lat': float(row['LATITUDE']), 'lon': float(row['LONGITUDE']),
                      'history': [{'year': year, 'area': area} for year, area in sorted(histories[row['GLO_ID']].items())],
                      'forecast': {'baseYear': int(row['base_year']), 'targetYear': int(row['target_year']),
                                   'baseArea': base_area, 'actualArea': actual_area,
                                   'actualChange': float(row['proportional_change']),
                                   'models': models, 'classifiers': classifiers}})
    metrics = []
    for row in json.loads((ROOT / METRICS).read_text())['final_metrics']:
        metrics.append({**row, 'id': row['candidate_id'], 'name': NAMES[row['candidate_id']],
                        'task': 'regression' if 'proportional_mae' in row else 'classification'})
    return {'meta': {'schemaVersion': 1, 'runId': manifest['identity_sha256'],
                     'lakeCount': len(lakes), 'predictionCount': len(predictions),
                     'baseYear': 2023, 'targetYear': 2024, 'intervalLevel': 0.9,
                     'dataset': {'name': 'Glacial Lake Observatory (GLO), Sentinel-2 v1.02',
                                 'authors': 'Rawlins et al.', 'url': 'https://doi.org/10.5281/zenodo.19370146',
                                 'paperUrl': 'https://doi.org/10.5194/essd-18-5143-2026',
                                 'license': 'CC BY 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
                                 'modifications': 'Nepal primary-cohort subset; evaluated model outputs and extracted area histories.'},
                     'units': {'area': 'km²', 'change': 'proportional fraction (multiply by 100 for %)',
                               'lowerUpper': 'proportional-change prediction interval endpoints',
                               'probability': 'fraction between 0 and 1',
                               'coordinates': 'decimal degrees', 'pr_auc': 'average precision'},
                     'sources': [{'path': path, 'sha256': digest(path)} for path in
                                 [PREDICTIONS, METRICS, MANIFEST, COHORT, HISTORY]],
                     'limitations': ['Historical sealed 2024 evaluation; no new forecasts or model training in this website.',
                                     'Persistence beats every learned regressor on 2024 proportional MAE.',
                                     'Nominal 90% intervals are not guarantees for an individual lake.',
                                     'Expansion probabilities can be miscalibrated; GP probabilities understate 2024 expansion frequency.',
                                     'Mapped lake area change is not flood risk or a hazard prediction.',
                                     'History contains available transition endpoints; missing years are not interpolated.']},
            'metrics': metrics, 'lakes': lakes}


if __name__ == '__main__':
    output = ROOT / 'website/data/lakes.json'
    payload = build()
    output.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(',', ':')), encoding='utf-8')
    print(f'Exported {len(payload["lakes"])} lakes to {output} ({output.stat().st_size:,} bytes)')
