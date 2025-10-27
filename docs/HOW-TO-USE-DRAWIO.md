# 📐 How to Use the Architecture Diagram

이 가이드는 `system-architecture.drawio` 파일을 draw.io에서 열고 편집하는 방법을 설명합니다.

---

## 🚀 빠른 시작

### 1️⃣ **온라인에서 열기** (추천)

**방법 1: 직접 업로드**
1. https://app.diagrams.net/ 접속
2. 왼쪽 상단 **"Open Existing Diagram"** 클릭
3. `docs/system-architecture.drawio` 파일 선택
4. 다이어그램이 바로 열립니다! 🎉

**방법 2: 드래그 앤 드롭**
1. https://app.diagrams.net/ 접속
2. `system-architecture.drawio` 파일을 브라우저로 드래그
3. 즉시 열립니다!

---

## ✏️ 편집하기

### 기본 조작법

- **이동**: 요소를 클릭하고 드래그
- **크기 조절**: 요소 선택 후 모서리 핸들 드래그
- **삭제**: 요소 선택 후 `Delete` 키
- **복사**: `Ctrl+C` / `Ctrl+V` (Mac: `Cmd+C` / `Cmd+V`)
- **텍스트 수정**: 요소 더블클릭

### 색상 변경

1. 요소 선택
2. 오른쪽 패널에서 **"Fill"** (채우기 색상) 변경
3. **"Line"** (테두리 색상) 변경

### 화살표 추가

1. 도구바에서 화살표 아이콘 선택
2. 시작점 클릭 → 끝점 클릭
3. 오른쪽 패널에서 선 스타일 변경

### 새 요소 추가

1. 왼쪽 사이드바에서 도형 검색
   - "rectangle" (사각형)
   - "cylinder" (실린더/데이터베이스)
   - "actor" (사용자)
2. 드래그 앤 드롭으로 배치

---

## 💾 저장하기

### PNG 이미지로 내보내기

1. **File** → **Export as** → **PNG**
2. 설정:
   - ✅ **Transparent Background** (투명 배경)
   - **Border Width**: 10
   - **Zoom**: 100%
3. **Export** 클릭
4. `docs/architecture.png` 로 저장

### SVG로 내보내기 (벡터 이미지)

1. **File** → **Export as** → **SVG**
2. **Export** 클릭
3. 확대해도 깨지지 않는 고품질 이미지!

### PDF로 내보내기 (발표용)

1. **File** → **Export as** → **PDF**
2. 발표 자료에 삽입하기 좋음

---

## 📸 README에 이미지 추가하기

### 1. PNG로 내보내기
```bash
# docs/architecture.png로 저장했다면
```

### 2. README.md에 추가
```markdown
## System Architecture

![Architecture Diagram](./docs/architecture.png)
```

### 3. 커밋 & 푸시
```bash
git add docs/architecture.png
git commit -m "Add architecture diagram"
git push
```

GitHub에서 바로 이미지가 보입니다! ✨

---

## 🎨 스타일 팁

### 추천 색상 조합

**NestJS 테마**
- Primary: `#e0234e` (빨강)
- Secondary: `#ffffff` (흰색)

**PostgreSQL**
- Database: `#336791` (파랑)

**React**
- Frontend: `#61dafb` (하늘색)

**Git**
- Storage: `#f05032` (주황)

### 레이어 구조

현재 다이어그램은 다음 레이어로 구성:
1. **Client Layer** (파랑 배경)
2. **API Gateway Layer** (노랑 배경)
3. **Controller Layer** (초록 배경)
4. **Service Layer** (주황 배경)
5. **Data Access Layer** (보라 배경)
6. **External Services** (회색 배경)

---

## 🔄 Git에서 관리하기

### .drawio 파일의 장점

- ✅ 텍스트 기반 XML 형식
- ✅ Git diff로 변경사항 추적 가능
- ✅ 팀원과 버전 관리 가능
- ✅ GitHub에서 직접 볼 수 있음 (GitHub 플러그인 사용 시)

### 브랜치 전략

```bash
# 다이어그램 수정용 브랜치 생성
git checkout -b docs/update-architecture

# 수정 후 커밋
git add docs/system-architecture.drawio
git commit -m "Update architecture: add new service layer"

# PR 생성
git push origin docs/update-architecture
```

---

## 💡 고급 기능

### 1. 레이어 사용하기

**File** → **Layers**로 복잡한 다이어그램을 레이어로 분리

### 2. 템플릿 적용

왼쪽 사이드바 → **More Shapes** → "AWS", "Azure", "GCP" 선택

### 3. 자동 레이아웃

**Arrange** → **Layout** → "Horizontal Flow" 선택

### 4. 실시간 협업 (Google Drive 연동)

1. draw.io에서 **File** → **Save as**
2. **Google Drive** 선택
3. 팀원과 실시간 공동 편집 가능!

---

## 🆘 문제 해결

### Q: 파일이 안 열려요
**A**: 파일 확장자가 `.drawio`인지 확인하세요. `.xml`로 되어있다면 `.drawio`로 변경

### Q: 한글이 깨져요
**A**: 폰트를 "Arial", "맑은 고딕", "Noto Sans KR"로 변경

### Q: 이미지 품질이 낮아요
**A**: PNG 내보내기 시 **Zoom을 200%**로 설정

### Q: GitHub에서 미리보기가 안 돼요
**A**: PNG/SVG로 내보낸 이미지를 README에 삽입하세요

---

## 📚 추가 리소스

- **draw.io 공식 문서**: https://www.drawio.com/doc/
- **단축키 목록**: `Ctrl+Shift+K` (Mac: `Cmd+Shift+K`)
- **튜토리얼**: https://www.youtube.com/c/drawio

---

## ✨ 다음 단계

이제 다이어그램을 자유롭게 수정하고, 팀원들과 공유해보세요!

**추천 작업:**
- [ ] 색상을 프로젝트 브랜드에 맞게 커스터마이즈
- [ ] PNG로 내보내서 README에 추가
- [ ] 추가 다이어그램 생성 (ER Diagram, Deployment Diagram)
- [ ] 발표 자료용 PDF 생성

Happy Diagramming! 🎨