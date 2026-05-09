<!--
  과제 제출 코드 AI 비교 분석 리포트 — 작성 예시(참고용).

  - 제출 참조는 반드시 `[[SUBMISSION:<uuid>]]` 형태(본문 예시의 A, B, C는 설명용 호칭).
  - 자동 파이프라인을 쓸 때는 추가로 design/api-spec.md의 regions, `##` 축, 앵커 규약을 맞출 것.
  - 아래 목차 문구(예: 「이하에서는 차례대로 전처리, 반복문, …」)·번호 목차(1~4)·절 제목은 **문체·비교 서술 뉘앙스**만 보여 주는 샘플이다. **동일 문구·동일 순서·동일 축 개수를 따라 하라는 의미가 아니다.** 실제 LLM 출력은 문제·제출 코드에 맞게 도입부와 `##` 축을 새로 짓는다. 자동 파이프라인에서는 개요 로드맵과 JSON regions·각 절 펜스가 같은 기준으로만 일치하면 된다.
  - 표는 사용하지 않는다(Markdown 파이프 표·원시 HTML `<table>` 모두 금지). 비교는 소제목·목록·단락으로만.
  - 아래 UUID는 예시이며, 저장 시 실제 submissionId로 바꾼다.
-->

# 과제 제출 코드 AI 비교 분석 리포트 (예시)

### 개요

이번 리포트는 **유연근무제 통과 인원**을 세는 문제에 대해, 아래 **세 건**의 제출을 비교 및 분석한 결과입니다.

- **제출 A:** [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]
- **제출 B:** [[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]]
- **제출 C:** [[SUBMISSION:cccccccc-cccc-4ccc-8ccc-cccccccccccc]]

<!-- 예시 문장(LLM은 동일 문구·목차 순서 복붙 금지). 실제 리포트는 코드 구조에 맞게 재작성. -->

이하에서는 차례대로 **전처리**, **반복문**, **자료구조와 판정**, **정리** 순으로 살펴보겠습니다.

다음 순서에 따라 분석을 이어가겠습니다.

1. 전처리 및 초기화
2. 주요 반복문
3. 자료구조와 통과 판정
4. 정리

<br />

### 1. 전처리 및 초기화

[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]] 제출을 보면, 출퇴근 시각을 **분 단위 정수**로 바꾼 뒤 주 단위로 묶기 위해 맵과 누적 변수를 한꺼번에 준비하는 형태로 구현되었습니다.

```javascript
const byDay = new Map();
let streak = 0;

function toMinutes(t) {
  return Math.floor(t / 100) * 60 + (t % 100);
}
```

하지만 [[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]] 제출을 보면 [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]와 다르게, 먼저 **원본 배열을 복사해 두고** 이후에는 인덱스만 움직이며 읽는 방식으로 구현된 것을 확인할 수 있습니다.

```python
logs = [tuple(row) for row in timelogs]
base = schedules[:]

def to_minutes(t: int) -> int:
    return (t // 100) * 60 + (t % 100)
```

[[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]]에서는 Python의 **리스트 컴프리헨션**과 **슬라이스 복사(`[:]`)**를 사용해서 입력을 고정해 두었습니다.

```python
week_flags = [[False] * 7 for _ in range(len(schedules))]
```

위와 같이 "불변에 가깝게 잡아 두고 나중에 채운다"는 뉘앙스로 나타냈다고 할 수 있습니다.

한편, C++로 제출된 [[SUBMISSION:cccccccc-cccc-4ccc-8ccc-cccccccccccc]]를 보면 앞의 두 제출과 **시각 정규화 로직은 같은 맥락**이라는 공통점이 있지만, **자료를 한 번에 모으는지와 행 단위로 풀지**에서는 다음과 같은 차이로 구현되었습니다.

```cpp
static int toMin(int t) {
  return (t / 100) * 60 + (t % 100);
}
```

[[SUBMISSION:cccccccc-cccc-4ccc-8ccc-cccccccccccc]]는 헬퍼를 정적 함수로 두고, 이후 루프에서 일 단위로 소비하는 쪽에 무게를 둡니다.

<br />

### 2. 주요 반복문

이 문제의 핵심인 반복문을 보겠습니다.

다음은 각 제출이 반복문을 어떻게 쓰는지에 대한 요약입니다. 제출마다 **순회 방식**과 **갱신·판정 요약**을 같은 틀로 짧게 맞춰 비교합니다.

#### [[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]

- **순회 방식.** 직원 바깥 `for` × 요일 안쪽 `for`.
- **갱신 및 판정 요약.** 연속 출근과 지각을 따져 스트릭을 갱신합니다.

#### [[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]]

- **순회 방식.** 사람 × 요일 이중 `for`.
- **갱신 및 판정 요약.** 매일 지각 여부를 쌓은 뒤 주 단위로 판정합니다.

#### [[SUBMISSION:cccccccc-cccc-4ccc-8ccc-cccccccccccc]]

- **순회 방식.** 일 단위 단일 `for`.
- **갱신 및 판정 요약.** 플래그 배열로 주 단위로 잘라 판정합니다.

[[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]]에서는 특이하게도, 이중 루프 안에서 **불리언 격자**를 직접 채우는 방식을 택했습니다.

```python
for i in range(len(schedules)):
    for d in range(7):
        week_flags[i][d] = not is_late(timelogs[i][d], schedules[i])
```

위에서 요약한 "주 단위 판정"은 이 격자를 모두 채운 뒤 한 줄로 요약하는 흐름과 맞물립니다.

[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]의 자바스크립트 이중 루프는 바깥을 사람과 안쪽을 요일에 두는 형태로, 읽는 순서가 위 파이썬과 비슷하지만 **데이터를 맵에 붙이느냐와 2차원 배열에 두느냐**에서 갈립니다.

```javascript
for (let i = 0; i < schedules.length; i++) {
  let okWeek = true;
  for (let d = 0; d < 7; d++) {
    // ...
  }
}
```

<br />

### 3. 자료구조와 통과 판정

[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]와 [[SUBMISSION:cccccccc-cccc-4ccc-8ccc-cccccccccccc]]를 나란히 보면, **"지각 횟수와 출근일수 조건을 한 번에 묶는"** if 형태가 비슷하게 읽힙니다.

```cpp
if (lateCnt <= 0 && attendCnt >= need) {
  ++answer;
}
```

반면 [[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]]는 같은 질문을 **플래그 배열을 줄 단위로 줄여 가며** 풀기 때문에, 여기서는 앞의 두 제출과 조건식을 줄줄이 놓고 비교하기보다는 **2절의 순회 요약**과 **위 파이썬 루프**로 근거를 대는 편이 낫습니다.

<br />

### 4. 정리

[[SUBMISSION:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]], [[SUBMISSION:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]], [[SUBMISSION:cccccccc-cccc-4ccc-8ccc-cccccccccccc]]의 코드를 살펴보았을 때, **시각을 분 단위로 정규화한 뒤 주 단위로 자른다**는 공통점이 있었고, **맵, 2차원 배열, 단일 루프**처럼 자료를 어디에 올려 두고 도는지에서 차이가 있음을 확인할 수 있었습니다.