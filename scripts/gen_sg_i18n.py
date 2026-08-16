#!/usr/bin/env python3
import re
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'fullstack_2_3_1/snippets/resell-size-guide-content.liquid'
OUT = ROOT / 'fullstack_2_3_1/snippets/resell-size-guide-brand-text.liquid'

SECTION_IDS = {
    'nike': 'size-nike',
    'air-jordan': 'size-air-jordan',
    'adida': 'size-adida',
    'new-balance': 'size-new-balance',
    'asics': 'size-asics',
    'yeezy': 'size-yeezy',
    'ugg': 'size-ugg',
    'converse': 'size-converse',
    'salomon': 'size-salomon',
    'puma': 'size-puma',
    'veja': 'size-veja',
    'saucony': 'size-saucony',
    'essentials': 'size-essentials',
}
SECTION_IDS['adida'] = 'size-' + 'adida' + 's'


def render_tag(brand, part):
    return (
        "{% render 'resell-size-guide-brand-text', brand: '" + brand + "', part: '" + part + "', "
        "locale_base: locale_base, sg_fitting_tips: sg_fitting_tips, sg_size_tips: sg_size_tips %}"
    )


def extract_fr(text):
    fr = {}
    for brand, sid in SECTION_IDS.items():
        m = re.search(rf'<section id="{sid}" class="rl-sg__brand">(.*?)</section>', text, re.S)
        if not m:
            raise SystemExit(f'missing section {sid}')
        block = m.group(1)
        am = re.search(r'<div class="rl-sg__article">(.*?)</div>\s*<div class="rl-sg__tabs"', block, re.S)
        tm = re.search(r'<div class="rl-sg__tips">(.*?)</div>\s*$', block, re.S)
        fr[brand] = {'article': am.group(1).strip(), 'tips': tm.group(1).strip()}
    return fr


def load_tr():
    return json.loads((Path(__file__).parent / 'sg-i18n-tr.json').read_text())


def build_snippet(fr, tr):
    lines = [
        '{% comment %} Locale-specific size guide copy. Params: brand, part (article|tips), locale_base {% endcomment %}',
        '{% liquid',
        '  assign lb = locale_base | default: "fr"',
        '%}',
        '{% case brand %}',
    ]
    for brand in SECTION_IDS:
        lines.append("{% when '" + brand + "' %}")
        lines.append('  {% case part %}')
        for part in ('article', 'tips'):
            lines.append("  {% when '" + part + "' %}")
            lines.append("    {% if lb == 'en' %}")
            lines.append(tr[brand][part]['en'])
            lines.append("    {% elsif lb == 'de' %}")
            lines.append(tr[brand][part]['de'])
            lines.append('    {% else %}')
            lines.append(fr[brand][part])
            lines.append('    {% endif %}')
        lines.append('  {% endcase %}')
    lines.append('{% endcase %}')
    OUT.write_text('\n'.join(lines) + '\n')


def patch_main(text):
    for brand, sid in SECTION_IDS.items():
        rep_a = render_tag(brand, 'article')
        pat_a = (
            rf'(<section id="{sid}"[\s\S]*?<div class="rl-sg__article">)'
            rf'[\s\S]*?'
            rf'(</div>\s*<div class="rl-sg__tabs")'
        )
        text, n = re.subn(
            pat_a,
            lambda m, rep=rep_a: m.group(1) + '\n        ' + rep + '\n        ' + m.group(2),
            text,
            count=1,
        )
        if n != 1:
            raise SystemExit(f'article patch failed {brand}')

        rep_t = render_tag(brand, 'tips')
        pat_t = (
            rf'(<section id="{sid}"[\s\S]*?<div class="rl-sg__tips">)'
            rf'[\s\S]*?'
            rf'(</div>\s*</section>)'
        )
        text, n = re.subn(
            pat_t,
            lambda m, rep=rep_t: m.group(1) + '\n        ' + rep + '\n        ' + m.group(2),
            text,
            count=1,
        )
        if n != 1:
            raise SystemExit(f'tips patch failed {brand}')
    return text


if __name__ == '__main__':
    text = MAIN.read_text()
    fr = extract_fr(text)
    tr = load_tr()
    build_snippet(fr, tr)
    MAIN.write_text(patch_main(text))
    print('done:', OUT, MAIN)
