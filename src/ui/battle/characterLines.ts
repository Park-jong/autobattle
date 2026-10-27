/** Short battle chatter, separate from simulation data and random number generation. */
export const CHARACTER_LINES = [
  { opening: '팀, 내 신호에 맞춰.', reply: '좋아. 내가 앞을 막을게.', skill: ['내 뒤에 있어!', '여긴 내가 지킨다.'], hurt: '이 정도로는 안 무너져.', win: '작전 종료. 모두 수고했어.' },
  { opening: '준비됐지? 달린다!', reply: '벌써 몸 다 풀었는데?', skill: ['이제 내 차례야!', '한 번에 돌파한다!'], hurt: '아직 시작도 안 했어!', win: '끝! 야식 먹으러 갈까?' },
  { opening: '채널 연결. 다들 들려?', reply: '응. 상대 신호도 잡았어.', skill: ['접속 완료. 잘 가!', '네 패턴, 다 읽었어.'], hurt: '잠깐, 다시 계산할게.', win: '작전 로그, 저장 완료.' },
  { opening: '뒤쪽은 내가 볼게.', reply: '확인. 빈틈은 내게 맡겨.', skill: ['거기, 움직이지 마!', '엄호 들어간다!'], hurt: '괜찮아. 계속 움직여!', win: '전원 확인. 이제 돌아가자.' },
  { opening: '시야 확보. 준비 끝.', reply: '응. 한 발이면 충분해.', skill: ['조준 완료.', '내 시야에 들어왔네.'], hurt: '집중… 아직 할 수 있어.', win: '깨끗하게 정리됐네.' },
  { opening: '조용히. 내가 먼저 갈게.', reply: '이미 뒤로 돌아왔어.', skill: ['늦었어. 내 뒤야.', '눈 깜빡이지 마.'], hurt: '잡았다고 생각했어?', win: '흔적 없이. 늘 하던 대로.' },
] as const;

export const BANTER = [
  ['너무 앞서가지 마.', '걱정 마. 네 엄호 믿으니까.'],
  ['끝나고 야식, 콜?', '좋아. 이번엔 네가 사는 거다.'],
  ['뒤쪽은 내가 볼게.', '그럼 정면은 내 차례네.'],
  ['다들 무사하지?', '아직 한참 더 뛸 수 있어.'],
] as const;
