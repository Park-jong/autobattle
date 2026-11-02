"""삼국지 MD를 표시 데이터로 내보내고 내장 image_gen 결과를 저장·배포한다."""
import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'characters/three_kingdoms'
BOSSES = ROOT / 'characters/bosses/three_kingdoms'
MANIFEST = FOLDER / 'asset-manifest.json'
KINDS = ('illustration', 'portrait', 'sd')
COLORS = {'위': '#7198d5', '촉': '#69b997', '오': '#e98665', '동탁': '#b48ad0'}


def roster():
    characters = []
    for folder in (FOLDER, BOSSES):
        for directory in sorted(folder.iterdir()):
            if not directory.is_dir() or not re.fullmatch(r'[CUB]\d\d', directory.name):
                continue
            text = (directory / 'README.md').read_text(encoding='utf-8')
            rows = {}
            for line in text.splitlines():
                if line.startswith('| '):
                    cells = [s.strip() for s in line.split('|')[1:-1]]
                    rows[cells[0]] = cells[1]
            prompt = (directory / 'illustration.prompt.md').read_text(encoding='utf-8')
            brief = json.loads(prompt.split('CHARACTER BRIEF (Korean visual descriptions are authoritative):\n')[1].split('\n\nOUTPUT AND EXCLUSIONS:')[0])
            faction = rows['포지션·소속'].split(' · ')[1].removesuffix('군')
            skill = rows.get('기존 스킬', '').split(' — ')[0]
            if directory.name.startswith('C'):
                skill = {'C01': '도원맹약의 방진', 'C02': '강동 화전', 'C03': '패왕의 결단'}[directory.name]
            bio = text.split('## 성격·배경\n\n')[1].split('\n\n대사:')[0]
            quote = re.search(r'대사: “(.+?)”', text).group(1)
            characters.append({
                'code': directory.name, 'id': brief['runtime_id'], 'name': brief['name_ko'],
                'gender': 'female', 'age': int(re.search(r'(\d+) years', brief['sex_age']).group(1)),
                'height': brief['height_cm'], 'measurements': brief['measurements_B_W_H_cm'] + ' cm',
                'bustType': brief['bust_type'], 'cupSize': brief['cup_size'],
                'body': brief['body_ko'], 'skin': brief['skin_ko'], 'hair': brief['hair_ko'],
                'eyes': brief['eyes_ko'], 'face': brief['face_expression_ko'],
                'role': rows['포지션·소속'].split(' · ')[0], 'faction': faction, 'color': COLORS[faction],
                'equipment': brief['equipment_ko'], 'outfit': brief['outfit_ko'], 'bio': bio,
                'skillName': skill, 'quote': quote,
            })
    if len(characters) != 37:
        raise ValueError('37명 로스터가 필요합니다')
    return characters


def directory(code):
    return (BOSSES if code.startswith('B') else FOLDER) / code


def manifest():
    return json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {
        'version': 1, 'skin': 'three_kingdoms', 'assets': {},
    }


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def pending(count):
    jobs = []
    m = manifest()['assets']
    for row in roster():
        d = directory(row['code'])
        for kind in KINDS:
            key = f'{row["code"]}/{kind}'
            if key in m:
                continue
            if (d / f'{kind}.png').exists():
                raise ValueError(f'미기록 원화: {key}')
            if kind != 'illustration' and f'{row["code"]}/illustration' not in m:
                continue
            doc = (d / f'{kind}.prompt.md').read_text(encoding='utf-8')
            prompt = re.search(r'```text\n([\s\S]*?)\n```', doc).group(1)
            jobs.append({'code': row['code'], 'kind': kind, 'prompt': prompt,
                         'refs': [] if kind == 'illustration' else [str(d / 'illustration.png')]})
            if len(jobs) >= count:
                return jobs
    if not jobs:
        sync_docs()
    return jobs


def record(code, kind, source):
    destination = directory(code) / f'{kind}.png'
    if destination.exists():
        raise ValueError(f'기존 원화 보존: {destination}')
    src = Path(source)
    with Image.open(src) as image:
        image.load()
        dimensions = image.size
    shutil.copy2(src, destination)
    m = manifest()
    m['assets'][f'{code}/{kind}'] = {
        'path': destination.relative_to(ROOT).as_posix(),
        'prompt': destination.with_suffix('.prompt.md').relative_to(ROOT).as_posix(),
        'source': str(src), 'width': dimensions[0], 'height': dimensions[1],
        'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
        'tool': 'built-in image_gen', 'generated_at': datetime.now(timezone.utc).isoformat(),
        'references': [] if kind == 'illustration' else [f'{directory(code).relative_to(ROOT).as_posix()}/illustration.png'],
    }
    write_json(MANIFEST, m)
    export_asset(code, kind, destination)
    return {'code': code, 'kind': kind, 'recorded': len(m['assets']), 'total': 111}


def export_asset(code, kind, source):
    commander = code.startswith('C')
    size = ((640, 960) if commander else (384, 576)) if kind == 'illustration' else ((512, 512) if commander and kind == 'portrait' else (256, 256))
    target = ROOT / f'public/skins/three_kingdoms/{kind}/{code}.png'
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.resize(size, Image.Resampling.LANCZOS).save(target, optimize=True)


def sync_docs():
    """실제로 저장된 파일만 생성으로 표시한다. 사용자 검수는 별도다."""
    assets = manifest()['assets']
    rows = roster()
    total = len(assets)
    for row in rows:
        code = row['code']
        d = directory(code)
        completed = [kind for kind in KINDS if f'{code}/{kind}' in assets]
        doc = d / 'README.md'
        text = doc.read_text(encoding='utf-8')
        if len(completed) == 3:
            text = text.replace('상태: **콘셉트·전신/초상화/SD 프롬프트 작성 · 이미지 미생성 · 게임 미연결**.', '상태: **전신·초상화·SD 생성 · 게임 연결 · 사용자 검수 대기**.')
        for kind in completed:
            label = {'illustration': '전신', 'portrait': '초상화', 'sd': '전투 SD'}[kind]
            text = re.sub(r'\| `' + kind + r'\.png` \| \[' + label + r'\]\(' + kind + r'\.prompt\.md\) \| [^\n]+',
                          f'| [{kind}.png]({kind}.png) | [{label}]({kind}.prompt.md) | 생성 · 사용자 검수 대기 |', text)
            prompt_path = d / f'{kind}.prompt.md'
            prompt = prompt_path.read_text(encoding='utf-8')
            prompt = prompt.replace('프롬프트 작성 완료 · 이미지 미생성 · 전신 참조 대기', '이미지 생성 · 사용자 검수 대기')
            prompt = prompt.replace('프롬프트 작성 완료 · 이미지 미생성', '이미지 생성 · 사용자 검수 대기')
            prompt = prompt.replace('(현재 파일 없음)', '(생성 파일 저장됨)')
            prompt = prompt.replace('**현재 파일 없음: 전신 생성·채택 후 실제 이미지를 첨부해야 실행 가능.**', '생성 시 같은 폴더 전신을 실제 참조로 첨부했다. 검수는 사용자가 진행한다.')
            prompt = prompt.replace('참조 전신이 아직 없으므로 현재는 프롬프트 준비 상태다.', '같은 폴더 전신을 참조해 이미지를 생성했다.')
            prompt_path.write_text(prompt, encoding='utf-8', newline='\n')
        if len(completed) == 3:
            text = re.sub(r'현재 이 폴더에는 콘셉트와 3종의 생성 프롬프트 MD가 있다\.[^\n]+',
                          '전신·초상화·SD 원본과 프롬프트를 이 폴더에 보관한다. 배포용 축소본은 public/skins/three_kingdoms에 연결했다. 이미지의 실제 생성 경로·참조·해시는 스킨 asset-manifest.json에 기록한다. 원화 검수는 사용자가 진행한다.', text)
        doc.write_text(text, encoding='utf-8', newline='\n')

    lines = ['# 연화삼국 제작 진행', '', '[전체 스킨](README.md) · [공통 작화 기준](ART_DIRECTION.md) · [생성 기록](asset-manifest.json)', '',
             f'콘셉트 37명 · 프롬프트 111개 · **이미지 {total}/111장 생성**. 원본은 캐릭터 폴더, 게임용 축소본은 public/skins/three_kingdoms에 저장한다. 코드에서 연화삼국을 선택할 수 있다. **이미지·화면 검수는 사용자 진행 예정**이다.', '',
             '| 번호 | 이름 | 전신 | 초상화 | SD |', '|---|---|---|---|---|']
    for row in rows:
        code = row['code']
        prefix = f'../bosses/three_kingdoms/{code}' if code.startswith('B') else code
        cells = []
        for kind in KINDS:
            state = f'[생성]({prefix}/{kind}.png)' if f'{code}/{kind}' in assets else '미생성'
            cells.append(f'{state} · [프롬프트]({prefix}/{kind}.prompt.md)')
        lines.append(f'| [{code}]({prefix}/README.md) | {row["name"]} | ' + ' | '.join(cells) + ' |')
    (FOLDER / 'PROGRESS.md').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
    main = FOLDER / 'README.md'
    text = main.read_text(encoding='utf-8')
    text = text.replace('현재 **디렉토리·콘셉트·이미지 생성 프롬프트 MD**를 준비했다.', f'콘셉트·생성 프롬프트와 원화 {total}장을 준비하고 게임 선택 화면에 연결했다.')
    text = re.sub(r'예정 스킨 ID는 `three_kingdoms`다\.[^\n]+', '스킨 ID는 `three_kingdoms`다. 게임의 스킨 선택에서 **연화삼국**을 선택하면 지휘관·유닛·보스·카드·도감·전투 연출에 적용된다. 표시 데이터는 data/skins/three_kingdoms.json이며 원본 게임 ID와 전투 수치는 유지한다. 실제 생성 파일 기록은 [에셋 목록](asset-manifest.json)에 보관한다.', text)
    text = text.replace('현재 전신 참조 대기 상태다.', '실제 생성 때 같은 폴더의 전신을 참조했다.')
    text = re.sub(r'이미지는 생성하지 않았다\.[^\n]+', f'이미지 {total}/111장을 생성했다. 원본 illustration.png·portrait.png·sd.png는 각 인물 폴더에, 배포용 축소본은 public/skins/three_kingdoms에 저장한다. 이미지·화면 검수는 사용자가 진행한다.', text)
    main.write_text(text, encoding='utf-8', newline='\n')
    art = FOLDER / 'ART_DIRECTION.md'
    text = art.read_text(encoding='utf-8').replace('콘셉트·이미지 프롬프트 111개 작성. 이미지 미생성.', f'콘셉트·이미지 프롬프트 111개 작성. 이미지 {total}/111장 생성, 사용자 검수 대기.')
    text = text.replace('현재 파일 없음.', '원본·배포용 파일 저장.')
    text = text.replace('현재 전신은 없으므로 파생 이미지용 프롬프트는 전신 참조 대기다.', '초상화·SD 생성에는 같은 폴더의 전신을 참조했다.')
    art.write_text(text, encoding='utf-8', newline='\n')
    boss_doc = BOSSES / 'README.md'
    text = boss_doc.read_text(encoding='utf-8')
    text = text.replace('이미지·게임 연결은 없다.', '이미지를 생성해 게임에 연결했으며 사용자 검수 대기다.')
    text = text.replace('현재 이미지 제작 수는 **0/12장**이다.', f'현재 이미지 제작 수는 **{sum(k.startswith("B") for k in assets)}/12장**이다.')
    text = text.replace('현재 전신 참조 대기다.', '생성 시 같은 폴더 전신을 참조했다.')
    boss_doc.write_text(text, encoding='utf-8', newline='\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('roster', 'next', 'record', 'export', 'sync-docs'))
    parser.add_argument('--count', type=int, default=3)
    parser.add_argument('--code')
    parser.add_argument('--kind', choices=KINDS)
    parser.add_argument('--source')
    args = parser.parse_args()
    if args.action == 'roster':
        data = {'version': 1, 'id': 'three_kingdoms', 'name': '연화삼국', 'characters': roster()}
        write_json(ROOT / 'data/skins/three_kingdoms.json', data)
        print(json.dumps({'characters': len(data['characters'])}))
    elif args.action == 'next':
        print(json.dumps(pending(args.count), ensure_ascii=False))
    elif args.action == 'record':
        print(json.dumps(record(args.code, args.kind, args.source)))
    elif args.action == 'sync-docs':
        sync_docs()
    else:
        for key, asset in manifest()['assets'].items():
            export_asset(*key.split('/'), ROOT / asset['path'])


if __name__ == '__main__':
    main()
