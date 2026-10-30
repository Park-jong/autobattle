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


def design_revision(row):
    brief = {key: row[key] for key in ['measurements', 'bustType', 'body', 'outfit']}
    return hashlib.sha256(json.dumps(brief, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()


def progress():
    m = manifest()['assets']
    revised = sum(m.get(f'{r["code"]}/{kind}', {}).get('design_revision') == design_revision(r) for r in roster() for kind in KINDS)
    lines = ['# 시티 오퍼레이션 원화 제작 진행', '', f'선택 원화 {len(m)}/99장. **현재 체형·복식 개정 원화 {revised}/99장.** 내장 이미지 생성 도구로 개별 제작한다.', '', '| 번호 | 전신 | 초상화 | SD |', '|---|---|---|---|']
    for r in roster():
        code = r['code']
        cells = [f'[{"개정 완료" if m[f"{code}/{kind}"].get("design_revision") == design_revision(r) else "기존 원화"}]({code}/{kind}.png)' if f'{code}/{kind}' in m else '대기' for kind in KINDS]
        lines.append('| ' + f'[{code}]({code}/README.md)' + ' | ' + ' | '.join(cells) + ' |')
        profile = FOLDER / code / 'README.md'
        if profile.is_file():
            count = sum(m.get(f'{code}/{kind}', {}).get('design_revision') == design_revision(r) for kind in KINDS)
            status = f'현재 체형·복식에 맞춘 원화 **{count}/3종 개정 완료**. 전신·초상화·SD의 개별 상태는 [제작 진행](../PROGRESS.md)을 따른다. 기존 생성 프롬프트는 이전 제작 기록으로 보존하고, 개정 프롬프트는 `*.refinement.prompt.md`에 기록한다.'
            text = re.sub(r'(?<=## 원화 개정 상태\n\n).*?(?=\n\n## 이미지 저장)', status, profile.read_text(encoding='utf-8'), flags=re.DOTALL)
            profile.write_text(text, encoding='utf-8', newline='\n')
    (FOLDER / 'PROGRESS.md').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
    index = FOLDER / 'README.md'
    if index.is_file():
        text = index.read_text(encoding='utf-8')
        status = f'**현재 체형·복식 개정 원화 {revised}/99장 완료.** [제작 진행](PROGRESS.md)에서 캐릭터별 상태를 확인한다. 개정 전 PNG는 버전별로 보존하며, 새 제작 프롬프트는 `*.refinement.prompt.md`에 기록한다.'
        text = re.sub(r'^(?:현재 PNG 99장과 기존 `\*\.prompt\.md`.*|\*\*현재 체형·복식 개정 원화 .*완료\.\*\*.*)$', status, text, flags=re.MULTILINE)
        index.write_text(text, encoding='utf-8', newline='\n')


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
                      'Bright sophisticated modern-city military character design. Opaque securely fitted tactical fashion with slightly more open necklines and cropped hems as specified in the brief. '
                      'Show collarbones, shoulders, a modest midriff band and upper thighs according to the individual outfit; tasteful upper cleavage only where specified. '
                      'Keep nipples, underbust and pelvis covered with opaque fabric, no transparent clothing or underwear styling. Confident non-erotic pose. '
                      'Exactly two arms and two hands, anatomically connected, natural ownership of each prop. '
                      'Genuine transparent PNG alpha, no scenery, no floor, no shadow plane, no vignette or colored backdrop, no checkerboard. No labels, writing, logo, watermark, border, halo or school insignia. '
                      'She is a human adult, no animal ears or tail or fantasy limbs. Headsets and metal insignia reinterpret former fantasy accessories. ')
            common += {
                'small': 'Body design: distinctly small-busted adult woman with an almost flat chest silhouette; do not add padding or enlarge her bust. ',
                'medium': 'Body design: medium-busted adult woman with a natural moderate chest silhouette, clearly fuller than the small category and less voluminous than the large category; do not flatten or exaggerate her bust. ',
                'large': 'Body design: distinctly very large-busted adult woman, with a pronounced full bust silhouette supported by tailored opaque clothing. ',
            }[r['bustType']]
            common += ('Follow her individual shoulders, muscle tone, waist and hips from the brief; bust category does not determine those features. '
                       'Keep the assigned bust category and outfit consistent across full-body, portrait and SD artwork. '
                       'If an older identity reference conflicts with the current body or outfit brief, use the current brief for those features while preserving face, hair, eyes and equipment. ')
            if kind == 'illustration':
                refs = [f'characters/modern/{code}/illustration.png'] if replace else ([] if code == 'U01' else ['characters/modern/U01/illustration.png'])
                spec = ('Create a NEW single complete full-body illustration, vertical 2:3 canvas, natural mature adult anatomy about 7.3 heads tall, eye-level near-front three-quarter view. '
                        'Entire head ornaments, hair, boots and weapon visible inside clean margins. A compact believable modern weapon, not an oversized fantasy gun. '
                        'Use this character identity and unique equipment: ')
                spec += ('The reference is this SAME adult character before redesign: preserve her exact face, hair, eyes, palette, equipment and art style; update her body category and outfit to the current brief. '
                         if replace else 'If a style reference is supplied, it is STYLE ONLY: do not copy her face, brown bob, blue ribbon, shield or body type. ')
                brief = {k: r[k] for k in ['name', 'role', 'faction', 'height', 'measurements', 'bustType', 'body', 'skin', 'hair', 'eyes', 'face', 'outfit', 'equipment']}
            elif kind == 'portrait':
                refs = [f'characters/modern/{code}/illustration.png']
                spec = ('Create a square 1:1 head-and-upper-torso portrait of the SAME ADULT WOMAN in the reference. '
                        'Reference fixes her mature face, hair, eyes and skin; body shape and outfit follow the current brief. Keep head ornaments inside the frame with breathing room. '
                        'A natural confident expression, readable at small card size. Preserve the assigned bust silhouette, neckline and anatomy. ')
                brief = {k: r[k] for k in ['name', 'role', 'measurements', 'bustType', 'body', 'hair', 'eyes', 'outfit', 'equipment']}
            else:
                refs = [f'characters/modern/{code}/illustration.png']
                spec = ('Create ONE full-body SUPER DEFORMED battle token of the SAME ADULT WOMAN from the reference, square canvas. '
                        'Use genuinely compact 2.8 to 3 HEADS TALL proportions: a very large head about ONE THIRD of the whole figure, tiny compact torso and short compact legs. '
                        'Chin to boot soles is approximately TWO head heights. This is a stylized adult professional game token, not a younger version. '
                        'Preserve adult character identity and expression; simplify buckles and patterns into readable shapes. Opaque tactical outfit with secure coverage, no erotic posing. '
                        'CRITICAL gameplay orientation: face and firearm aim toward IMAGE RIGHT. The firearm muzzle must be on the RIGHT edge at torso height, never on the left. Do not preserve the reference pose if it points left. '
                        'For shield users specifically: place the shield on IMAGE LEFT and the firing hand and handgun on IMAGE RIGHT; keep both arms anatomically connected. '
                        'For shields, left arm holds the shield slightly outward without hiding the entire body; right hand holds the compact firearm. '
                        'For drone specialists, the compact drone sits at upper-right shoulder level, with a small forward-facing device; hands operate a tablet or supported compact carbine. '
                        'If there is one long weapon, right hand grips it and left hand supports the fore-end. For dual pistols, one pistol in each hand. '
                        'No shooting effects or muzzle flash baked into the sprite. Complete boots and weapon within wide margins; no platform. ')
                brief = {k: r[k] for k in ['name', 'role', 'measurements', 'bustType', 'body', 'hair', 'eyes', 'outfit', 'equipment']}
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
        version = 1
        backup = dest.with_name(f'{kind}_v{version:02d}.png')
        while backup.exists():
            version += 1
            backup = dest.with_name(f'{kind}_v{version:02d}.png')
        shutil.copy2(dest, backup)
    shutil.copy2(src, dest)
    m = manifest()
    m['assets'][f'{code}/{kind}'] = {'path': dest.relative_to(ROOT).as_posix(), 'prompt': dest.with_suffix('.prompt.md').relative_to(ROOT).as_posix(), 'width': w, 'height': h, 'mode': im.mode, 'alpha_range': list(alpha.getextrema()), 'transparent_fraction': round(transparent, 4), 'bytes': dest.stat().st_size, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(), 'tool': 'built-in image_gen'}
    if replace:
        row = next(r for r in roster() if r['code'] == code)
        m['assets'][f'{code}/{kind}']['design_revision'] = design_revision(row)
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
