"""내장 이미지 생성 도구로 만든 캐릭터 원화의 계획·기록·검증을 관리한다."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'characters'
KINDS = ('illustration', 'portrait', 'sd')
MANIFEST = BASE / 'asset-manifest.json'


def read_manifest():
    return json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {'assets': {}}


def inspect(path):
    with Image.open(path) as image:
        image.load()
        alpha = image.getchannel('A').getextrema() if 'A' in image.getbands() else None
        if image.format != 'PNG' or alpha is None or alpha[0] != 0:
            raise ValueError(f'Expected transparent PNG: {path}')
        width, height = image.size
        if min(width, height) < 512:
            raise ValueError(f'Image too small: {path}')
        return {'width': width, 'height': height, 'mode': image.mode,
                'alpha_range': list(alpha), 'bytes': path.stat().st_size,
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def plan(uid, kind):
    profile = (BASE / uid / 'README.md').read_text(encoding='utf-8')
    # 이미지 저장 상태와 관계 링크는 생성용 캐릭터 설정에서 제외한다.
    brief = profile.split('## 일러스트 저장')[0]
    brief = re.sub(r'## 캐릭터 관계[\s\S]*', '', brief)
    brief = re.sub(r'^\[.*$', '', brief, flags=re.M)
    name = re.search(r'^\| 이름 \| (.+?) \|$', profile, re.M)[1]
    common = (
        'Use case: stylized-concept. Production game asset for a coherent roster of 30 adult women. '
        'The setting is an adult postsecondary magical academy fantasy game for adult audiences. '
        'All characters are explicitly adult women age 20 or older, including adult female spirits. '
        'Use attractive mature anime character design, crisp elegant linework, refined controlled cel shading, '
        'detailed metal and cloth, consistent soft neutral upper-left lighting, a clear silhouette. '
        'Follow the revealing opaque fantasy fashion specified in the character brief: adult shoulders, '
        'collarbones, waist or thighs visible as described. Preserve role-specific equipment and faction palette. '
        'Natural proportions, fully opaque clothing covering intimate areas, no sexual action. '
        'Anatomy: exactly two arms and exactly two hands, each visibly connected to its own shoulder. '
        'If holding two props, use one hand per prop and do not add a third resting arm or hand. '
        'Real transparent PNG alpha; no background, scenery, floor, vignette, glow outside the silhouette, '
        'painted checkerboard, text, labels, frames, UI, watermark or extra characters. '
    )
    if kind == 'illustration':
        spec = (
            f'Create {uid} {name}: ONE finished full-body character illustration, portrait 2:3 canvas. '
            'Reference image is STYLE ONLY: match rendering polish and linework, but create this DIFFERENT '
            'character with her own face, hair, costume, equipment, palette and pose from the brief. '
            'Do not copy Rine, her brown bob, blue ribbon, shield or notebook unless explicitly in this brief. '
            'Adult full-size anatomy about 7–8 heads tall, eye-level near-front three-quarter view, '
            'complete head-to-boot-soles framing, include all hair ornaments and primary equipment with margins. '
            'Pose and expression reflect her personality. No alternate views or prop sheet. '
        )
        references = ['characters/U01/illustration.png']
    elif kind == 'portrait':
        spec = (
            f'Create {uid} {name}: ONE square 1:1 head-and-upper-torso portrait of the SAME ADULT WOMAN '
            'in the reference full-body illustration. Reference is the identity, outfit and rendering target. '
            'Preserve exact face, hair color/style, eye color, ears, accessories, skin, neckline, costume details '
            'and expression. Frame complete hair and head ornaments with breathing room, show head, shoulders '
            'and upper torso, center the face prominently. Keep primary equipment only if it naturally enters '
            'the bust crop without blocking the face. Match the full-body drawing style and lighting. '
            'This is an isolated transparent game roster portrait, not a card layout. '
        )
        references = [f'characters/{uid}/illustration.png']
    else:
        spec = (
            f'Create {uid} {name}: ONE full-body SUPER-DEFORMED battle game character of the SAME ADULT WOMAN '
            'from the reference full-body illustration. Reference is the identity, outfit and equipment target. '
            'Use clear stylized SD proportions about 3 heads tall as a GAME TOKEN, not a child or younger version. '
            'Preserve adult character identity, hair shape/color, eye color, skin, outfit design and its exposed '
            'shoulders/waist/thighs where specified, key accessories and the single main weapon or tool. '
            'Simplify tiny details for readability at 104px board-cell size. Bold clean silhouette, crisp linework, '
            'two or three cel-shadow values, saturated restrained faction accent, no visual clutter. '
            'Square 1:1 canvas, eye-level near-front three-quarter battle-ready stance, both feet and all primary '
            'equipment fully visible with clean margins. Match identity faithfully; no text or base/platform. '
        )
        references = [f'characters/{uid}/illustration.png']
    return {'uid': uid, 'name': name, 'kind': kind, 'prompt': (common + spec).rstrip() + '\n\nCHARACTER BRIEF (Korean):\n' + brief,
            'references': references, 'destination': f'characters/{uid}/{kind}.png'}


def progress():
    rows = []
    count = 0
    completed = []
    for n in range(1, 31):
        uid = f'U{n:02d}'
        profile = (BASE / uid / 'README.md').read_text(encoding='utf-8')
        name = re.search(r'^\| 이름 \| (.+?) \|$', profile, re.M)[1]
        flags = [(BASE / uid / f'{kind}.png').exists() for kind in KINDS]
        count += sum(flags)
        if all(flags):
            completed.append(uid)
        rows.append(f"| [{uid} {name}]({uid}/README.md) | " + ' | '.join('완료' if ok else '대기' for ok in flags) + ' |')
    doc = '# 캐릭터 이미지 제작 진행\n\n'
    doc += '성인 대상 게임 지향. 전원 성인 여성·노출 있는 불투명 판타지 의상. 내장 이미지 생성 도구로 한 캐릭터씩 전신 → 초상화 → SD 순서로 제작한다.\n\n'
    doc += f'대표 이미지 **{count}/90개**, 캐릭터 **{len(completed)}/30명** 완료.\n\n'
    doc += '| 캐릭터 | 전신 | 초상화 | 전투 SD |\n|---|---|---|---|\n' + '\n'.join(rows) + '\n'
    (BASE / 'PROGRESS.md').write_text(doc, encoding='utf-8', newline='\n')
    return {'images': count, 'total_images': 90, 'completed_characters': completed}


def record(uid, kind, source=None):
    destination = BASE / uid / f'{kind}.png'
    if source:
        if destination.exists():
            raise FileExistsError(destination)
        source = Path(source)
        metadata = inspect(source)
        shutil.copy2(source, destination)
    else:
        metadata = inspect(destination)
    spec = plan(uid, kind)
    prompt_file = destination.with_suffix('.prompt.md')
    if not prompt_file.exists():
        prompt_file.write_text(f'# {uid} {spec["name"]} — {kind} 생성 프롬프트\n\n성인 게임 지향. 내장 이미지 생성 도구 사용.\n\n'
                               + '참조: ' + ', '.join(spec['references']) + '\n\n```text\n' + spec['prompt'] + '\n```\n', encoding='utf-8', newline='\n')
    manifest = read_manifest()
    manifest['assets'][f'{uid}/{kind}'] = {**metadata, 'path': spec['destination'], 'tool': 'built-in image_gen',
                                         'prompt': str(prompt_file.relative_to(ROOT)).replace('\\', '/')}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    profile_path = BASE / uid / 'README.md'
    profile = profile_path.read_text(encoding='utf-8')
    # 캐릭터 설정과 관계를 유지하고 이미지 저장 상태만 갱신한다.
    storage = '## 일러스트 저장\n\n성인 대상 게임의 노출 있는 의상 방향을 적용한다. 대표 PNG는 투명 배경이며, 내장 이미지 생성 도구로 제작했다.\n\n'
    storage += '| 파일 | 상태·용도 |\n|---|---|\n'
    for k, label in zip(KINDS, ('전신', '초상화', '전투용 SD')):
        file = BASE / uid / f'{k}.png'
        storage += f'| [{k}.png]({k}.png) | 완료 · {label} |\n' if file.exists() else f'| `{k}.png` | 제작 대기 · {label} |\n'
    storage += '\n프롬프트는 같은 이름의 `*.prompt.md`에 보관한다.\n'
    if (BASE / uid / 'illustration_v01.png').exists():
        storage += '\n이전 전신은 [v01](illustration_v01.png), 현재 전신 보관본은 [v02](illustration_v02.png)로 유지한다.\n'
    profile_path.write_text(profile.split('## 일러스트 저장')[0] + storage, encoding='utf-8', newline='\n')
    return {**spec, 'prompt': '(saved in prompt markdown)', 'metadata': metadata, 'progress': progress()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('plan', 'record', 'progress', 'audit'))
    parser.add_argument('uid', nargs='?')
    parser.add_argument('kind', nargs='?', choices=KINDS)
    parser.add_argument('source', nargs='?')
    args = parser.parse_args()
    if args.uid and not re.fullmatch(r'U(?:0[1-9]|[12][0-9]|30)', args.uid):
        parser.error('Invalid character number')
    if args.action == 'plan':
        result = plan(args.uid, args.kind)
    elif args.action == 'record':
        result = record(args.uid, args.kind, args.source)
    elif args.action == 'audit':
        manifest = read_manifest()
        qa_path = BASE / 'qa-notes.json'
        if qa_path.exists():
            assert not json.loads(qa_path.read_text(encoding='utf-8')).get('pending'), 'Unresolved visual QA issues'
        hashes = set()
        for n in range(1, 31):
            for kind in KINDS:
                uid = f'U{n:02d}'
                metadata = inspect(BASE / uid / f'{kind}.png')
                assert manifest['assets'][f'{uid}/{kind}']['sha256'] == metadata['sha256']
                ratio = metadata['width'] / metadata['height']
                assert 0.6 < ratio < 0.75 if kind == 'illustration' else 0.95 < ratio < 1.05
                assert metadata['sha256'] not in hashes, f'Duplicate artwork: {uid}/{kind}'
                hashes.add(metadata['sha256'])
        result = {'audit': 'passed', **progress()}
    else:
        result = progress()
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    main()
