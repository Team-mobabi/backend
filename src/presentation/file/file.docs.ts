// Swagger 설명문. 컨트롤러 가독성을 위해 분리

export const CREATE_OR_UPLOAD_DESCRIPTION = `Content-Type에 따라 다르게 동작합니다.

**방법 1: 텍스트 파일 생성 (application/json)**
\`\`\`json
POST /repos/:repoId/files
Content-Type: application/json

{
  "filename": "README.md",
  "content": "# Hello World",
  "path": "docs",
  "overwrite": false
}
\`\`\`

**방법 2: 파일 업로드 (multipart/form-data)**

📤 **단일 파일 업로드**
\`\`\`bash
curl -X POST "http://localhost:6101/repos/:repoId/files" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "files=@/path/to/image.png" \\
  -F "path=uploads" \\
  -F "overwrite=false"
\`\`\`

📤 **여러 파일 동시 업로드 (최대 100개)**
\`\`\`bash
curl -X POST "http://localhost:6101/repos/:repoId/files" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "files=@/path/to/file1.png" \\
  -F "files=@/path/to/file2.pdf" \\
  -F "files=@/path/to/file3.zip" \\
  -F "path=uploads" \\
  -F "overwrite=false"
\`\`\`

📮 **Postman에서 사용법:**
1. Body 탭 선택
2. form-data 선택
3. Key: "files", Type: File 선택 후 파일 선택
4. 여러 파일: 같은 Key "files"로 여러 행 추가
5. Key: "path" (선택), Value: "uploads"
6. Key: "overwrite" (선택), Value: "false"

🌐 **JavaScript (Fetch API)**
\`\`\`javascript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);  // 같은 키로 여러 개 추가
formData.append('files', file3);
formData.append('path', 'uploads');
formData.append('overwrite', 'false');

fetch('/repos/:repoId/files', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
  body: formData
});
\`\`\`

**제한:**
- 최대 100개 파일 동시 업로드
- 각 파일 최대 10MB
- .gitignore 패턴에 매칭되는 파일은 자동 제외
- 모든 파일 형식 지원 (이미지, PDF, ZIP 등)
`;

export const DOWNLOAD_FILE_DESCRIPTION = `저장소의 파일을 다운로드합니다. 텍스트/바이너리 모든 파일 지원

**사용 예시:**
\`\`\`bash
# curl
curl -X GET "http://localhost:6101/repos/:repoId/files/download?path=README.md" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -o README.md

# JavaScript
fetch('/repos/:repoId/files/download?path=uploads/image.png', {
  headers: { 'Authorization': 'Bearer TOKEN' }
})
.then(res => res.blob())
.then(blob => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'image.png';
  a.click();
});
\`\`\`
`;

export const DOWNLOAD_REPOSITORY_DESCRIPTION = `저장소 전체를 zip 파일로 다운로드합니다. .git 폴더는 제외됩니다.

**사용 예시:**
\`\`\`bash
# curl
curl -X GET "http://localhost:6101/repos/:repoId/download" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -o repository.zip

# JavaScript
fetch('/repos/:repoId/download', {
  headers: { 'Authorization': 'Bearer TOKEN' }
})
.then(res => res.blob())
.then(blob => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-project.zip';
  a.click();
});
\`\`\`

**특징:**
- .git 폴더 제외 (순수 소스 코드만)
- 파일 구조 유지
- 저장소 이름으로 zip 파일명 자동 생성
`;
