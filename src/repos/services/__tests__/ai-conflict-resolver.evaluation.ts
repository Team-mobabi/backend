/**
 * AI 충돌 해결 시스템 평가 스크립트
 *
 * 평가 지표:
 * 1. 정확도 (Accuracy) - 올바른 해결책 비율
 * 2. 신뢰도 보정 오차 (ECE) - 예측 신뢰도 vs 실제 정확도
 * 3. 문법 유효성 (Syntactic Validity) - 파싱 성공률
 * 4. 의미 보존율 (Semantic Preservation) - 핵심 키워드 보존 비율
 */

import { AIConflictResolverService, AIResolutionResult, ConfidenceLevel } from '../ai-conflict-resolver.service';
import { testCases, ConflictTestCase, testCaseStats } from './conflict-test-cases';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 타입 정의
// ============================================

interface EvaluationResult {
  testCaseId: string;
  type: string;
  difficulty: string;
  language: string;

  // AI 결과
  aiResolution: string;
  aiConfidence: number;
  aiConfidenceLevel: ConfidenceLevel;
  aiExplanation: string;

  // 평가 결과
  isCorrect: boolean;
  isAlternativeAccepted: boolean;
  syntaxValid: boolean;
  keywordsPreserved: number; // 보존된 키워드 비율 (0-1)
  executionTimeMs: number;

  // 에러 정보
  error?: string;
}

interface AggregatedMetrics {
  // 기본 통계
  totalCases: number;
  successfulCases: number;
  failedCases: number;

  // 정확도
  accuracy: number;
  accuracyByType: Record<string, number>;
  accuracyByDifficulty: Record<string, number>;

  // 신뢰도 보정 (ECE)
  expectedCalibrationError: number;
  calibrationByBin: CalibrationBin[];

  // 문법 유효성
  syntaxValidityRate: number;

  // 의미 보존
  averageKeywordPreservation: number;

  // 신뢰도 분포
  confidenceDistribution: Record<ConfidenceLevel, number>;

  // 성능
  averageExecutionTimeMs: number;
  totalExecutionTimeMs: number;
}

interface CalibrationBin {
  binStart: number;
  binEnd: number;
  averageConfidence: number;
  actualAccuracy: number;
  count: number;
}

// ============================================
// 평가 클래스
// ============================================

export class ConflictResolverEvaluator {
  private resolver: AIConflictResolverService;
  private results: EvaluationResult[] = [];

  constructor(resolver: AIConflictResolverService) {
    this.resolver = resolver;
  }

  /**
   * 전체 테스트 케이스 실행
   */
  async runFullEvaluation(): Promise<AggregatedMetrics> {
    console.log('========================================');
    console.log('AI 충돌 해결 시스템 평가 시작');
    console.log(`총 테스트 케이스: ${testCases.length}개`);
    console.log('========================================\n');

    this.results = [];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`[${i + 1}/${testCases.length}] ${testCase.id}: ${testCase.description}`);

      const result = await this.evaluateSingleCase(testCase);
      this.results.push(result);

      // 결과 출력
      const status = result.isCorrect ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} | Confidence: ${(result.aiConfidence * 100).toFixed(1)}% | Syntax: ${result.syntaxValid ? 'OK' : 'ERROR'}`);

      if (result.error) {
        console.log(`  ⚠️ Error: ${result.error}`);
      }
      console.log('');
    }

    const metrics = this.calculateMetrics();
    this.printReport(metrics);

    return metrics;
  }

  /**
   * 단일 테스트 케이스 평가
   */
  async evaluateSingleCase(testCase: ConflictTestCase): Promise<EvaluationResult> {
    const startTime = Date.now();

    try {
      const aiResult = await this.resolver.suggestResolution(
        testCase.conflict,
        testCase.filePath,
        testCase.context
      );

      const executionTime = Date.now() - startTime;

      // 정확도 평가
      const { isCorrect, isAlternative } = this.evaluateCorrectness(
        aiResult.resolvedCode,
        testCase.expectedResolution,
        testCase.acceptableAlternatives
      );

      // 문법 검사
      const syntaxValid = this.checkSyntax(aiResult.resolvedCode, testCase.language);

      // 키워드 보존 검사
      const keywordsPreserved = this.checkKeywordPreservation(
        aiResult.resolvedCode,
        testCase.keywords
      );

      return {
        testCaseId: testCase.id,
        type: testCase.type,
        difficulty: testCase.difficulty,
        language: testCase.language,
        aiResolution: aiResult.resolvedCode,
        aiConfidence: aiResult.confidence,
        aiConfidenceLevel: aiResult.confidenceLevel,
        aiExplanation: aiResult.explanation,
        isCorrect,
        isAlternativeAccepted: isAlternative,
        syntaxValid,
        keywordsPreserved,
        executionTimeMs: executionTime,
      };
    } catch (error) {
      return {
        testCaseId: testCase.id,
        type: testCase.type,
        difficulty: testCase.difficulty,
        language: testCase.language,
        aiResolution: '',
        aiConfidence: 0,
        aiConfidenceLevel: ConfidenceLevel.VERY_LOW,
        aiExplanation: '',
        isCorrect: false,
        isAlternativeAccepted: false,
        syntaxValid: false,
        keywordsPreserved: 0,
        executionTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 정확도 평가 - 기대 결과와 비교
   */
  private evaluateCorrectness(
    aiResult: string,
    expected: string,
    alternatives?: string[]
  ): { isCorrect: boolean; isAlternative: boolean } {
    // 공백 정규화
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

    const normalizedAi = normalize(aiResult);
    const normalizedExpected = normalize(expected);

    // 정확히 일치
    if (normalizedAi === normalizedExpected) {
      return { isCorrect: true, isAlternative: false };
    }

    // 대안 중 일치하는 것이 있는지 확인
    if (alternatives) {
      for (const alt of alternatives) {
        if (normalize(alt) === normalizedAi) {
          return { isCorrect: true, isAlternative: true };
        }
      }
    }

    // 유사도 기반 평가 (80% 이상이면 정답으로 간주)
    const similarity = this.calculateSimilarity(normalizedAi, normalizedExpected);
    if (similarity >= 0.8) {
      return { isCorrect: true, isAlternative: false };
    }

    return { isCorrect: false, isAlternative: false };
  }

  /**
   * Jaccard 유사도 계산
   */
  private calculateSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.split(/\s+/));
    const tokensB = new Set(b.split(/\s+/));

    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }

  /**
   * 문법 검사
   */
  private checkSyntax(code: string, language: string): boolean {
    try {
      switch (language.toLowerCase()) {
        case 'typescript':
        case 'javascript':
        case 'javascript (react)':
        case 'typescript (react)':
          return this.checkTsSyntax(code);
        case 'json':
          JSON.parse(code);
          return true;
        case 'python':
          // Python 문법 검사는 간단한 휴리스틱 사용
          return this.checkPythonSyntax(code);
        case 'css':
          return this.checkCssSyntax(code);
        default:
          // 알 수 없는 언어는 기본적인 괄호 매칭만 확인
          return this.checkBracketMatching(code);
      }
    } catch {
      return false;
    }
  }

  private checkTsSyntax(code: string): boolean {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      code,
      ts.ScriptTarget.Latest,
      true
    );

    // 파싱 에러 확인
    const diagnostics = (sourceFile as any).parseDiagnostics || [];
    return diagnostics.length === 0;
  }

  private checkPythonSyntax(code: string): boolean {
    // 간단한 휴리스틱: 들여쓰기, 콜론, 괄호 매칭
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // def/class/if/for/while 뒤에 콜론이 있어야 함
      if (/^(def|class|if|elif|else|for|while|try|except|finally|with)\s/.test(trimmed)) {
        if (!trimmed.endsWith(':')) {
          return false;
        }
      }
    }

    return this.checkBracketMatching(code);
  }

  private checkCssSyntax(code: string): boolean {
    // 간단한 CSS 문법 검사: 중괄호 매칭 및 속성:값 형식
    if (!this.checkBracketMatching(code)) return false;

    // 각 규칙 블록 내부에 속성:값; 형식이 있는지 확인
    const propertyPattern = /[\w-]+\s*:\s*[^;{}]+;/;
    const blocks = code.match(/\{[^{}]*\}/g) || [];

    for (const block of blocks) {
      const content = block.slice(1, -1).trim();
      if (content && !propertyPattern.test(content)) {
        return false;
      }
    }

    return true;
  }

  private checkBracketMatching(code: string): boolean {
    const stack: string[] = [];
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

    for (const char of code) {
      if ('([{'.includes(char)) {
        stack.push(char);
      } else if (')]}}'.includes(char)) {
        if (stack.pop() !== pairs[char]) {
          return false;
        }
      }
    }

    return stack.length === 0;
  }

  /**
   * 키워드 보존 검사
   */
  private checkKeywordPreservation(code: string, keywords: string[]): number {
    if (keywords.length === 0) return 1;

    let preserved = 0;
    for (const keyword of keywords) {
      if (code.includes(keyword)) {
        preserved++;
      }
    }

    return preserved / keywords.length;
  }

  /**
   * 집계 메트릭 계산
   */
  private calculateMetrics(): AggregatedMetrics {
    const successful = this.results.filter(r => !r.error);
    const failed = this.results.filter(r => r.error);

    // 정확도
    const correct = successful.filter(r => r.isCorrect);
    const accuracy = correct.length / this.results.length;

    // 유형별 정확도
    const accuracyByType: Record<string, number> = {};
    const types = [...new Set(this.results.map(r => r.type))];
    for (const type of types) {
      const typeResults = this.results.filter(r => r.type === type);
      const typeCorrect = typeResults.filter(r => r.isCorrect);
      accuracyByType[type] = typeCorrect.length / typeResults.length;
    }

    // 난이도별 정확도
    const accuracyByDifficulty: Record<string, number> = {};
    const difficulties = ['easy', 'medium', 'hard'];
    for (const diff of difficulties) {
      const diffResults = this.results.filter(r => r.difficulty === diff);
      const diffCorrect = diffResults.filter(r => r.isCorrect);
      accuracyByDifficulty[diff] = diffResults.length > 0
        ? diffCorrect.length / diffResults.length
        : 0;
    }

    // ECE (Expected Calibration Error) 계산
    const calibrationByBin = this.calculateCalibrationBins(successful);
    const ece = this.calculateECE(calibrationByBin);

    // 문법 유효성
    const syntaxValid = successful.filter(r => r.syntaxValid);
    const syntaxValidityRate = syntaxValid.length / successful.length;

    // 키워드 보존율
    const avgKeywordPreservation = successful.reduce((sum, r) => sum + r.keywordsPreserved, 0) / successful.length;

    // 신뢰도 분포
    const confidenceDistribution: Record<ConfidenceLevel, number> = {
      [ConfidenceLevel.VERY_HIGH]: 0,
      [ConfidenceLevel.HIGH]: 0,
      [ConfidenceLevel.MEDIUM]: 0,
      [ConfidenceLevel.LOW]: 0,
      [ConfidenceLevel.VERY_LOW]: 0,
    };
    for (const r of successful) {
      confidenceDistribution[r.aiConfidenceLevel]++;
    }

    // 실행 시간
    const totalTime = this.results.reduce((sum, r) => sum + r.executionTimeMs, 0);
    const avgTime = totalTime / this.results.length;

    return {
      totalCases: this.results.length,
      successfulCases: successful.length,
      failedCases: failed.length,
      accuracy,
      accuracyByType,
      accuracyByDifficulty,
      expectedCalibrationError: ece,
      calibrationByBin,
      syntaxValidityRate,
      averageKeywordPreservation: avgKeywordPreservation,
      confidenceDistribution,
      averageExecutionTimeMs: avgTime,
      totalExecutionTimeMs: totalTime,
    };
  }

  /**
   * 신뢰도 구간별 보정 계산
   */
  private calculateCalibrationBins(results: EvaluationResult[]): CalibrationBin[] {
    const bins: CalibrationBin[] = [];
    const binSize = 0.1; // 10% 단위

    for (let binStart = 0; binStart < 1; binStart += binSize) {
      const binEnd = binStart + binSize;
      const binResults = results.filter(
        r => r.aiConfidence >= binStart && r.aiConfidence < binEnd
      );

      if (binResults.length === 0) {
        bins.push({
          binStart,
          binEnd,
          averageConfidence: 0,
          actualAccuracy: 0,
          count: 0,
        });
        continue;
      }

      const avgConfidence = binResults.reduce((sum, r) => sum + r.aiConfidence, 0) / binResults.length;
      const actualAccuracy = binResults.filter(r => r.isCorrect).length / binResults.length;

      bins.push({
        binStart,
        binEnd,
        averageConfidence: avgConfidence,
        actualAccuracy,
        count: binResults.length,
      });
    }

    return bins;
  }

  /**
   * ECE (Expected Calibration Error) 계산
   */
  private calculateECE(bins: CalibrationBin[]): number {
    const totalSamples = bins.reduce((sum, bin) => sum + bin.count, 0);
    if (totalSamples === 0) return 0;

    let ece = 0;
    for (const bin of bins) {
      if (bin.count === 0) continue;
      const weight = bin.count / totalSamples;
      const error = Math.abs(bin.actualAccuracy - bin.averageConfidence);
      ece += weight * error;
    }

    return ece;
  }

  /**
   * 결과 리포트 출력
   */
  private printReport(metrics: AggregatedMetrics): void {
    console.log('\n========================================');
    console.log('           평가 결과 리포트');
    console.log('========================================\n');

    console.log('📊 기본 통계');
    console.log('─'.repeat(40));
    console.log(`총 테스트 케이스: ${metrics.totalCases}`);
    console.log(`성공: ${metrics.successfulCases} | 실패: ${metrics.failedCases}`);
    console.log('');

    console.log('🎯 정확도 (Accuracy)');
    console.log('─'.repeat(40));
    console.log(`전체: ${(metrics.accuracy * 100).toFixed(1)}%`);
    console.log('');
    console.log('유형별:');
    for (const [type, acc] of Object.entries(metrics.accuracyByType)) {
      console.log(`  - ${type}: ${(acc * 100).toFixed(1)}%`);
    }
    console.log('');
    console.log('난이도별:');
    for (const [diff, acc] of Object.entries(metrics.accuracyByDifficulty)) {
      console.log(`  - ${diff}: ${(acc * 100).toFixed(1)}%`);
    }
    console.log('');

    console.log('📐 신뢰도 보정 (Calibration)');
    console.log('─'.repeat(40));
    console.log(`ECE (Expected Calibration Error): ${metrics.expectedCalibrationError.toFixed(4)}`);
    console.log('  (낮을수록 좋음, 0 = 완벽한 보정)');
    console.log('');
    console.log('신뢰도 구간별 실제 정확도:');
    for (const bin of metrics.calibrationByBin) {
      if (bin.count === 0) continue;
      const range = `${(bin.binStart * 100).toFixed(0)}-${(bin.binEnd * 100).toFixed(0)}%`;
      const bar = '█'.repeat(Math.round(bin.actualAccuracy * 20));
      console.log(`  ${range.padEnd(8)} | ${bar.padEnd(20)} ${(bin.actualAccuracy * 100).toFixed(1)}% (n=${bin.count})`);
    }
    console.log('');

    console.log('✅ 문법 유효성');
    console.log('─'.repeat(40));
    console.log(`유효한 코드 생성 비율: ${(metrics.syntaxValidityRate * 100).toFixed(1)}%`);
    console.log('');

    console.log('🔑 의미 보존율');
    console.log('─'.repeat(40));
    console.log(`평균 키워드 보존율: ${(metrics.averageKeywordPreservation * 100).toFixed(1)}%`);
    console.log('');

    console.log('📈 신뢰도 분포');
    console.log('─'.repeat(40));
    for (const [level, count] of Object.entries(metrics.confidenceDistribution)) {
      const percentage = (count / metrics.successfulCases * 100).toFixed(1);
      console.log(`  ${level.padEnd(12)}: ${count} (${percentage}%)`);
    }
    console.log('');

    console.log('⏱️ 성능');
    console.log('─'.repeat(40));
    console.log(`평균 실행 시간: ${metrics.averageExecutionTimeMs.toFixed(0)}ms`);
    console.log(`총 실행 시간: ${(metrics.totalExecutionTimeMs / 1000).toFixed(1)}s`);
    console.log('');

    console.log('========================================');
    console.log('           평가 완료');
    console.log('========================================');
  }

  /**
   * 결과를 JSON 파일로 저장
   */
  saveResults(outputPath: string): void {
    const data = {
      timestamp: new Date().toISOString(),
      testCaseStats,
      results: this.results,
      metrics: this.calculateMetrics(),
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`\n결과가 저장되었습니다: ${outputPath}`);
  }

  /**
   * CSV 형식으로 결과 저장
   */
  saveResultsAsCsv(outputPath: string): void {
    const headers = [
      'testCaseId',
      'type',
      'difficulty',
      'language',
      'isCorrect',
      'aiConfidence',
      'aiConfidenceLevel',
      'syntaxValid',
      'keywordsPreserved',
      'executionTimeMs',
      'error',
    ];

    const rows = this.results.map(r => [
      r.testCaseId,
      r.type,
      r.difficulty,
      r.language,
      r.isCorrect,
      r.aiConfidence.toFixed(4),
      r.aiConfidenceLevel,
      r.syntaxValid,
      r.keywordsPreserved.toFixed(4),
      r.executionTimeMs,
      r.error || '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    fs.writeFileSync(outputPath, csv);
    console.log(`CSV 결과가 저장되었습니다: ${outputPath}`);
  }
}

// ============================================
// 실행 스크립트
// ============================================

export async function runEvaluation(): Promise<void> {
  // ConfigService 모킹 (테스트용)
  const mockConfigService = {
    get: (key: string) => {
      if (key === 'CLAUDE_API_KEY') {
        return process.env.CLAUDE_API_KEY;
      }
      return undefined;
    },
  };

  // 실제 환경에서는 NestJS DI를 통해 주입
  const resolver = new AIConflictResolverService(mockConfigService as any);
  const evaluator = new ConflictResolverEvaluator(resolver);

  try {
    const metrics = await evaluator.runFullEvaluation();

    // 결과 저장
    const outputDir = path.join(__dirname, 'evaluation-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    evaluator.saveResults(path.join(outputDir, `results-${timestamp}.json`));
    evaluator.saveResultsAsCsv(path.join(outputDir, `results-${timestamp}.csv`));

    // 논문용 요약 출력
    console.log('\n📝 논문용 요약 (복사하여 사용)');
    console.log('═'.repeat(50));
    console.log(`| Metric | Value |`);
    console.log(`|--------|-------|`);
    console.log(`| Accuracy | ${(metrics.accuracy * 100).toFixed(1)}% |`);
    console.log(`| ECE | ${metrics.expectedCalibrationError.toFixed(4)} |`);
    console.log(`| Syntax Validity | ${(metrics.syntaxValidityRate * 100).toFixed(1)}% |`);
    console.log(`| Semantic Preservation | ${(metrics.averageKeywordPreservation * 100).toFixed(1)}% |`);
    console.log('═'.repeat(50));

  } catch (error) {
    console.error('평가 실행 중 오류 발생:', error);
    process.exit(1);
  }
}

// CLI에서 직접 실행할 경우
if (require.main === module) {
  runEvaluation();
}