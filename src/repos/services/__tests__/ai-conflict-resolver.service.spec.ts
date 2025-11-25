import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  AIConflictResolverService,
  AIResolutionResult,
  ConfidenceLevel,
  ConflictContext,
} from '../ai-conflict-resolver.service';
import { testCases } from './conflict-test-cases';

describe('AIConflictResolverService', () => {
  let service: AIConflictResolverService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIConflictResolverService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'CLAUDE_API_KEY') {
                return process.env.CLAUDE_API_KEY || 'test-api-key';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AIConflictResolverService>(AIConflictResolverService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('기본 기능 테스트', () => {
    it('서비스가 정의되어야 함', () => {
      expect(service).toBeDefined();
    });

    it('isConfigured()가 API 키 설정 여부를 반환해야 함', () => {
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('프롬프트 빌드 테스트 (유닛)', () => {
    it('파일 확장자에 따라 올바른 언어를 감지해야 함', () => {
      // private 메서드 접근을 위한 타입 캐스팅
      const serviceAny = service as any;

      expect(serviceAny.getLanguage('ts')).toBe('TypeScript');
      expect(serviceAny.getLanguage('tsx')).toBe('TypeScript (React)');
      expect(serviceAny.getLanguage('js')).toBe('JavaScript');
      expect(serviceAny.getLanguage('py')).toBe('Python');
      expect(serviceAny.getLanguage('unknown')).toBe('Unknown');
    });

    it('신뢰도 점수를 올바른 레벨로 변환해야 함', () => {
      const serviceAny = service as any;

      expect(serviceAny.getConfidenceLevel(95)).toBe(ConfidenceLevel.VERY_HIGH);
      expect(serviceAny.getConfidenceLevel(90)).toBe(ConfidenceLevel.VERY_HIGH);
      expect(serviceAny.getConfidenceLevel(85)).toBe(ConfidenceLevel.HIGH);
      expect(serviceAny.getConfidenceLevel(70)).toBe(ConfidenceLevel.HIGH);
      expect(serviceAny.getConfidenceLevel(60)).toBe(ConfidenceLevel.MEDIUM);
      expect(serviceAny.getConfidenceLevel(50)).toBe(ConfidenceLevel.MEDIUM);
      expect(serviceAny.getConfidenceLevel(40)).toBe(ConfidenceLevel.LOW);
      expect(serviceAny.getConfidenceLevel(30)).toBe(ConfidenceLevel.LOW);
      expect(serviceAny.getConfidenceLevel(20)).toBe(ConfidenceLevel.VERY_LOW);
      expect(serviceAny.getConfidenceLevel(0)).toBe(ConfidenceLevel.VERY_LOW);
    });
  });

  describe('응답 파싱 테스트', () => {
    it('올바른 형식의 응답을 파싱해야 함', () => {
      const serviceAny = service as any;

      const mockResponse = `MERGED_CODE:
\`\`\`ts
const API_TIMEOUT = 10000;
\`\`\`

EXPLANATION:
타임아웃 값 충돌입니다. feature 브랜치의 더 긴 타임아웃을 선택했습니다.

CONFIDENCE: 95`;

      const originalConflict = `<<<<<<< HEAD
const API_TIMEOUT = 5000;
=======
const API_TIMEOUT = 10000;
>>>>>>> feature`;

      const result = serviceAny.parseResponse(mockResponse, originalConflict);

      expect(result.resolvedCode).toBe('const API_TIMEOUT = 10000;');
      expect(result.explanation).toContain('타임아웃');
      expect(result.confidence).toBe(0.95);
      expect(result.confidenceLevel).toBe(ConfidenceLevel.VERY_HIGH);
      expect(result.requiresReview).toBe(false);
    });

    it('낮은 신뢰도 응답에 대해 requiresReview를 true로 설정해야 함', () => {
      const serviceAny = service as any;

      const mockResponse = `MERGED_CODE:
\`\`\`ts
function calculate() { return 0; }
\`\`\`

EXPLANATION:
복잡한 충돌로 확신이 낮습니다.

CONFIDENCE: 45`;

      const originalConflict = `<<<<<<< HEAD
function calculate() { return 1; }
=======
function calculate() { return 2; }
>>>>>>> feature`;

      const result = serviceAny.parseResponse(mockResponse, originalConflict);

      expect(result.confidence).toBe(0.45);
      expect(result.confidenceLevel).toBe(ConfidenceLevel.LOW);
      expect(result.requiresReview).toBe(true);
    });

    it('충돌 마커가 남아있으면 에러를 발생시켜야 함', () => {
      const serviceAny = service as any;

      const mockResponse = `MERGED_CODE:
\`\`\`ts
<<<<<<< HEAD
const a = 1;
=======
const a = 2;
>>>>>>> feature
\`\`\`

EXPLANATION:
해결 실패

CONFIDENCE: 50`;

      expect(() => serviceAny.parseResponse(mockResponse, '')).toThrow(
        'AI가 생성한 코드에 여전히 충돌 마커가 포함되어 있습니다'
      );
    });

    it('빈 코드 응답에 대해 에러를 발생시켜야 함', () => {
      const serviceAny = service as any;

      const mockResponse = `MERGED_CODE:
\`\`\`ts
\`\`\`

EXPLANATION:
설명

CONFIDENCE: 50`;

      expect(() => serviceAny.parseResponse(mockResponse, '')).toThrow(
        'AI가 유효한 해결 코드를 생성하지 못했습니다'
      );
    });
  });

  describe('코드 보존 검증 테스트', () => {
    it('핵심 식별자가 보존되었는지 확인해야 함', () => {
      const serviceAny = service as any;
      const logSpy = jest.spyOn(serviceAny.logger, 'warn');

      const originalConflict = `<<<<<<< HEAD
const myVariable = 1;
function myFunction() {}
=======
const myVariable = 2;
function myFunction() {}
>>>>>>> feature`;

      // 모든 식별자가 보존된 경우
      const resolvedCode = `const myVariable = 2;
function myFunction() {}`;

      serviceAny.validateCodePreservation(resolvedCode, originalConflict);
      expect(logSpy).not.toHaveBeenCalled();

      // 식별자가 누락된 경우
      const incompleteCode = `const otherVariable = 2;`;
      serviceAny.validateCodePreservation(incompleteCode, originalConflict);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('일부 식별자가 해결된 코드에서 누락됨')
      );
    });
  });

  // E2E 테스트 (실제 API 호출 - CI에서는 스킵)
  describe('E2E 테스트 (실제 API 호출)', () => {
    const shouldRunE2E = process.env.RUN_E2E_TESTS === 'true';

    // 간단한 테스트 케이스만 E2E로 실행
    const simpleTestCases = testCases.filter(
      tc => tc.difficulty === 'easy' && tc.type === 'simple_value'
    ).slice(0, 2);

    (shouldRunE2E ? describe : describe.skip)('실제 충돌 해결', () => {
      jest.setTimeout(60000); // 60초 타임아웃

      simpleTestCases.forEach(testCase => {
        it(`${testCase.id}: ${testCase.description}`, async () => {
          const result = await service.suggestResolution(
            testCase.conflict,
            testCase.filePath,
            testCase.context
          );

          // 기본 검증
          expect(result.resolvedCode).toBeTruthy();
          expect(result.resolvedCode).not.toContain('<<<<<<<');
          expect(result.resolvedCode).not.toContain('=======');
          expect(result.resolvedCode).not.toContain('>>>>>>>');

          // 신뢰도 검증
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);

          // 최소 신뢰도 검증
          expect(result.confidence).toBeGreaterThanOrEqual(
            testCase.minConfidence / 100
          );

          // 키워드 보존 검증
          for (const keyword of testCase.keywords) {
            expect(result.resolvedCode).toContain(keyword);
          }

          console.log(`  ✅ ${testCase.id} 통과`);
          console.log(`     신뢰도: ${(result.confidence * 100).toFixed(1)}%`);
          console.log(`     레벨: ${result.confidenceLevel}`);
        });
      });
    });
  });
});

// 테스트 케이스 데이터 검증
describe('테스트 케이스 데이터 검증', () => {
  it('모든 테스트 케이스가 필수 필드를 가져야 함', () => {
    for (const tc of testCases) {
      expect(tc.id).toBeTruthy();
      expect(tc.type).toBeTruthy();
      expect(tc.language).toBeTruthy();
      expect(tc.difficulty).toBeTruthy();
      expect(tc.filePath).toBeTruthy();
      expect(tc.conflict).toBeTruthy();
      expect(tc.expectedResolution).toBeTruthy();
      expect(tc.keywords).toBeDefined();
      expect(Array.isArray(tc.keywords)).toBe(true);
    }
  });

  it('모든 테스트 케이스의 충돌 내용에 마커가 있어야 함', () => {
    for (const tc of testCases) {
      expect(tc.conflict).toContain('<<<<<<<');
      expect(tc.conflict).toContain('=======');
      expect(tc.conflict).toContain('>>>>>>>');
    }
  });

  it('기대 결과에 충돌 마커가 없어야 함', () => {
    for (const tc of testCases) {
      expect(tc.expectedResolution).not.toContain('<<<<<<<');
      expect(tc.expectedResolution).not.toContain('=======');
      expect(tc.expectedResolution).not.toContain('>>>>>>>');
    }
  });
});