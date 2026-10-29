"""현대전 원화 작업 큐·프롬프트·검증 기록. 이미지 제작은 내장 image_gen만 사용한다."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'characters/modern'
MANIFEST = FOLDER / 'asset-manifest.json'
KINDS = ['illustration', 'portrait', 'sd']


def roster():
    return json.loads((ROOT / 'data/skins/modern.json').read_text(encoding='utf-8'))['characters']


def manifest():
    return json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {'version': 1, 'skin': 'modern', 'tool': 'built-in image_gen', 'assets': {}}


def order():
    pilot = ['U01', 'U03', 'U06', 'C01', 'C02', 'C03']
    return pilot + [r['code'] for r in roster() if r['code'] not in pilot]


def progress():
    m = manifest()['assets']
    lines = ['# 시티 오퍼레이션 원화 제작 진행', '', f'선택 원화 {len(m)}/99장. 내장 이미지 생성 도구로 개별 제작한다.', '', '| 번호 | 전신 | 초상화 | SD |', '|---|---|---|---|']
    for r in roster():
        code = r['code']
        cells = [f'[완료]({code}/{kind}.png)' if f'{code}/{kind}' in m else '대기' for kind in KINDS]
        lines.append('| ' + f'[{code}]({code}/README.md)' + ' | ' + ' | '.join(cells) + ' |')
    (FOLDER / 'PROGRESS.md').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')


def prepare(code_filter=None, kind_filter=None, replace=False):
    m = manifest()['assets']
    rows = {r['code']: r for r in roster()}
    for code in order():
        if code_filter and code != code_filter:
            continue
        for kind in KINDS:
            if kind_filter and kind != kind_filter:
                continue
            if f'{code}/{kind}' in m and not replace:
                continue
            dest = FOLDER / code / f'{kind}.png'
            if dest.exists() and not replace:
                raise ValueError(f'기록되지 않은 원화가 있습니다. 재생성 전에 복구하세요: {dest}')
            r = rows[code]
            common = ('Use case: stylized-concept. Production artwork for CITY OPERATION, an original modern urban tactical anime strategy game. '
                      'One clearly ADULT woman only, an experienced professional aged ' + str(r['age']) + '. '
                      'Premium clean anime game art, luminous but controlled cel shading, precise elegant linework, believable modern fabric, matte armor and metal, soft neutral upper-left lighting. '
                      'Bright sophisticated modern-city military character design. Opaque securely fitted tactical fashion; complete coverage of the bust and pelvis, no transparent clothing or underwear styling. '
                      'Shoulders, a small waist band and legs may be visible according to the outfit. Confident non-erotic pose. '
                      'Exactly two arms and two hands, anatomically connected, natural ownership of each prop. '
                      'Genuine transparent PNG alpha, no scenery, no floor, no shadow plane, no vignette or colored backdrop, no checkerboard. No labels, writing, logo, watermark, border, halo or school insignia. '
                      'She is a human adult, no animal ears or tail or fantasy limbs. Headsets and metal insignia reinterpret former fantasy accessories. ')
            if kind == 'illustration':
                refs = [] if code == 'U01' else ['characters/modern/U01/illustration.png']
                spec = ('Create a NEW single complete full-body illustration, vertical 2:3 canvas, natural mature adult anatomy about 7.3 heads tall, eye-level near-front three-quarter view. '
                        'Entire head ornaments, hair, boots and weapon visible inside clean margins. A compact believable modern weapon, not an oversized fantasy gun. '
                        'If a style reference is supplied, it is STYLE ONLY: do not copy her face, brown bob, blue ribbon, shield or body type. '
                        'Use this character identity and unique equipment: ')
                brief = {k: r[k] for k in ['name', 'role', 'faction', 'height', 'body', 'skin', 'hair', 'eyes', 'face', 'outfit', 'equipment']}
                if code == 'C01':
                    spec += 'CRITICAL: genuinely slender adult woman, small understated chest, narrow hips and shoulders, long thin limbs. '
                elif code in ['C02', 'C03']:
                    spec += 'A mature curvy adult figure, full torso and broad hips, clearly contrasting with slender Harten, expressed through securely fitted opaque clothing. '
            elif kind == 'portrait':
                refs = [f'characters/modern/{code}/illustration.png']
                spec = ('Create a square 1:1 head-and-upper-torso portrait of the SAME ADULT WOMAN in the reference. '
                        'Reference fixes her exact identity, mature face, hair, eyes, skin, outfit and body shape. Keep head ornaments inside the frame with breathing room. '
                        'A natural confident expression, readable at small card size. Preserve clothing coverage and anatomy. ')
                brief = {k: r[k] for k in ['name', 'role', 'hair', 'eyes', 'outfit', 'equipment']}
            else:
                refs = [f'characters/modern/{code}/illustration.png']
                spec = ('Create ONE full-body SUPER DEFORMED battle token of the SAME ADULT WOMAN from the reference, square canvas. '
                        'Use genuinely compact 2.8 to 3 HEADS TALL proportions: a very large head about ONE THIRD of the whole figure, tiny compact torso and short compact legs. '
                        'Chin to boot soles is approximately TWO head heights. This is a stylized adult professional game token, not a younger version. '
                        'Preserve adult character identity and expression; simplify buckles and patterns into readable shapes. Opaque tactical outfit with secure coverage, no erotic posing. '
                        'Weapon should point to IMAGE RIGHT at torso height, side-readable muzzle on the right edge of the silhouette for gameplay effects. '
                        'For shields, left arm holds the shield slightly outward without hiding the entire body; right hand holds the compact firearm. '
                        'For drone specialists, the compact drone sits at upper-right shoulder level, with a small forward-facing device; hands operate a tablet or supported compact carbine. '
                        'If there is one long weapon, right hand grips it and left hand supports the fore-end. For dual pistols, one pistol in each hand. '
                        'No shooting effects or muzzle flash baked into the sprite. Complete boots and weapon within wide margins; no platform. ')
                brief = {k: r[k] for k in ['name', 'role', 'hair', 'eyes', 'outfit', 'equipment']}
                spec += 'Narrow slim body silhouette. ' if code == 'C01' else 'Maintain a broader adult torso and hip silhouette. ' if code in ['C02', 'C03'] else ''
            prompt = common + spec + '\nCHARACTER BRIEF (Korean):\n' + json.dumps(brief, ensure_ascii=False, indent=2)
            prompt = '\n'.join(line.rstrip() for line in prompt.splitlines())
            doc = f'# {code} {r["name"]} — {kind} 생성 프롬프트\n\n내장 image_gen 도구. 참조: {", ".join(refs) or "없음 — 신규 디자인"}\n\n```text\n{prompt}\n```\n'
            prompt_name = f'{kind}.refinement.prompt.md' if replace else f'{kind}.prompt.md'
            (FOLDER / code / prompt_name).write_text(doc, encoding='utf-8', newline='\n')
            return {'code': code, 'kind': kind, 'prompt': prompt, 'refs': [str(ROOT / p) for p in refs], 'destination': str(dest)}
    return None


def record(code, kind, source, replace=False):
    src = Path(source)
    dest = FOLDER / code / f'{kind}.png'
    if dest.exists() and not replace:
        raise ValueError(f'기존 원화를 덮어쓰지 않습니다: {dest}')
    im = Image.open(src)
    im.load()
    if im.format != 'PNG' or im.mode != 'RGBA':
        raise ValueError('투명 RGBA PNG가 필요합니다')
    w, h = im.size
    alpha = im.getchannel('A')
    if min(w, h) < 512 or alpha.getextrema()[0] != 0 or alpha.getextrema()[1] < 250:
        raise ValueError('크기·알파 검증 실패')
    if not (0.6 < w / h < 0.75 if kind == 'illustration' else 0.95 < w / h < 1.05):
        raise ValueError('원화 비율 검증 실패')
    transparent = alpha.histogram()[0] / (w * h)
    if transparent < 0.15:
        raise ValueError('충분한 투명 여백이 없습니다')
    if dest.exists():
        backup = dest.with_name(f'{kind}_v01.png')
        if not backup.exists():
            shutil.copy2(dest, backup)
    shutil.copy2(src, dest)
    m = manifest()
    m['assets'][f'{code}/{kind}'] = {'path': dest.relative_to(ROOT).as_posix(), 'prompt': dest.with_suffix('.prompt.md').relative_to(ROOT).as_posix(), 'width': w, 'height': h, 'mode': im.mode, 'alpha_range': list(alpha.getextrema()), 'transparent_fraction': round(transparent, 4), 'bytes': dest.stat().st_size, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(), 'tool': 'built-in image_gen'}
    if replace:
        m['assets'][f'{code}/{kind}']['prompt'] = (dest.parent / f'{kind}.refinement.prompt.md').relative_to(ROOT).as_posix()
        m['assets'][f'{code}/{kind}']['original_prompt'] = dest.with_suffix('.prompt.md').relative_to(ROOT).as_posix()
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    readme = dest.parent / 'README.md'
    row = f'| [{kind}.png]({kind}.png) | 완료 · {w}×{h} 투명 PNG |'
    s = re.sub(rf'^\| (?:{kind}\.png|\[{kind}\.png\]\({kind}\.png\)) \| .* \|$', row, readme.read_text(encoding='utf-8'), flags=re.MULTILINE)
    readme.write_text(s, encoding='utf-8', newline='\n')
    progress()
    return {'saved': dest.relative_to(ROOT).as_posix(), 'completed': len(m['assets']), 'total': 99}


def audit():
    m = manifest()['assets']
    expected = {f'{r["code"]}/{k}' for r in roster() for k in KINDS}
    problems = []
    for key in sorted(expected):
        a = m.get(key)
        if not a:
            problems.append(f'미완료: {key}')
            continue
        p = ROOT / a['path']
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != a['sha256']:
            problems.append(f'해시 불일치: {key}')
        if not (ROOT / a['prompt']).is_file():
            problems.append(f'프롬프트 누락: {key}')
    return {'completed': len(m), 'total': 99, 'problems': problems, 'ok': not problems and set(m) == expected}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['prepare', 'record', 'progress', 'audit'])
    parser.add_argument('--code')
    parser.add_argument('--kind', choices=KINDS)
    parser.add_argument('--source')
    parser.add_argument('--replace', action='store_true')
    args = parser.parse_args()
    if args.command == 'prepare':
        result = prepare(args.code, args.kind, args.replace)
    elif args.command == 'record':
        result = record(args.code, args.kind, args.source, args.replace)
    elif args.command == 'audit':
        result = audit()
    else:
        progress()
        result = {'completed': len(manifest()['assets']), 'total': 99}
    print(json.dumps(result, ensure_ascii=False))
