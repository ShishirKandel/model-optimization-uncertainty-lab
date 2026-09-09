"""Bundle the Nepal outline from a pinned public-domain Natural Earth release."""
from pathlib import Path
import hashlib
import json
import urllib.request

COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19'
URL = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{COMMIT}/geojson/ne_50m_admin_0_countries.geojson'

def export():
    with urllib.request.urlopen(URL, timeout=45) as response:
        raw = response.read()
    collection = json.loads(raw)
    nepal = [feature for feature in collection['features'] if feature['properties']['ADM0_A3'] == 'NPL']
    if len(nepal) != 1:
        raise ValueError('Expected exactly one Nepal feature')
    output = {
        'type': 'Feature',
        'properties': {
            'name': 'Nepal', 'source': 'Natural Earth, 1:50m Admin 0 Countries',
            'license': 'Public domain', 'sourceUrl': URL,
            'sourceSha256': hashlib.sha256(raw).hexdigest(),
            'note': 'Generalised national outline; lake points come from the evaluated inventory.'
        },
        'geometry': nepal[0]['geometry'],
    }
    destination = Path(__file__).resolve().parents[1] / 'data/nepal.geojson'
    destination.write_text(json.dumps(output, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    print(f'Exported {destination.name}: {destination.stat().st_size} bytes, {output["geometry"]["type"]}')

if __name__ == '__main__':
    export()
