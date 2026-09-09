import csv
import importlib.util
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('export_lakes', ROOT / 'website/tools/export_lakes.py')
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)


class LakeExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'website/data/lakes.json').read_text(encoding='utf-8'))
        cls.lakes = {lake['id']: lake for lake in cls.data['lakes']}

    def test_every_sealed_prediction_is_preserved_on_correct_scale(self):
        with (ROOT / EXPORT.PREDICTIONS).open(newline='') as handle:
            source = list(csv.DictReader(handle))
        self.assertEqual(len(source), 3824)
        self.assertEqual(len(self.lakes), 478)
        for row in source:
            lake = self.lakes[row['row_id'].split(':')[0]]
            forecast = lake['forecast']
            self.assertEqual(forecast['targetYear'], int(row['target_year']))
            key = 'models' if row['task'] == 'regression' else 'classifiers'
            model = next(item for item in forecast[key] if item['id'] == row['candidate_id'])
            if key == 'models':
                self.assertAlmostEqual(model['change'], math.exp(float(row['prediction'])) - 1, places=12)
                self.assertAlmostEqual(model['lower'], math.exp(float(row['lower'])) - 1, places=12)
                self.assertAlmostEqual(model['upper'], math.exp(float(row['upper'])) - 1, places=12)
                self.assertAlmostEqual(forecast['actualArea'] / forecast['baseArea'], math.exp(float(row['actual'])), places=12)
            else:
                self.assertEqual(model['probability'], float(row['prediction']))

    def test_metrics_agree_with_exported_per_lake_results(self):
        for metric in self.data['metrics']:
            if metric['task'] != 'regression':
                continue
            absolute_errors, covered = [], []
            for lake in self.lakes.values():
                forecast = lake['forecast']
                model = next(item for item in forecast['models'] if item['id'] == metric['id'])
                actual = forecast['actualArea'] / forecast['baseArea'] - 1
                absolute_errors.append(abs(model['change'] - actual))
                covered.append(model['lower'] <= actual <= model['upper'])
            self.assertAlmostEqual(sum(absolute_errors) / 478, metric['proportional_mae'], places=12)
            self.assertAlmostEqual(sum(covered) / 478, metric['interval_coverage'], places=12)

    def test_history_matches_actual_source_observations(self):
        expected = {}
        for row in EXPORT.rows(EXPORT.HISTORY):
            for year_key, area_key in [('base_year', 'base_area'), ('target_year', 'target_area')]:
                expected[(row['GLO_ID'], int(row[year_key]))] = float(row[area_key])
        for lake in self.lakes.values():
            self.assertEqual(len(lake['history']), len({point['year'] for point in lake['history']}))
            for point in lake['history']:
                self.assertEqual(point['area'], expected[(lake['id'], point['year'])])
            self.assertEqual(next(point['area'] for point in lake['history'] if point['year'] == 2024), lake['forecast']['actualArea'])

    def test_rebuild_is_identical_and_sources_match(self):
        self.assertEqual(EXPORT.build(), self.data)
        for source in self.data['meta']['sources']:
            self.assertEqual(EXPORT.digest(source['path']), source['sha256'])


if __name__ == '__main__':
    unittest.main()
