/**
 * AI 충돌 해결 테스트 케이스
 *
 * 각 테스트 케이스는 다음을 포함:
 * - id: 고유 식별자
 * - type: 충돌 유형 (simple_value, logic_change, structural)
 * - language: 프로그래밍 언어
 * - difficulty: 난이도 (easy, medium, hard)
 * - conflict: 충돌 내용
 * - expectedResolution: 기대되는 해결책
 * - acceptableAlternatives: 허용 가능한 대안들
 * - minConfidence: 최소 기대 신뢰도
 */

export interface ConflictTestCase {
  id: string;
  type: 'simple_value' | 'logic_change' | 'structural' | 'semantic';
  language: string;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  filePath: string;
  conflict: string;
  context?: {
    ourBranch?: string;
    theirBranch?: string;
    ourCommitMessage?: string;
    theirCommitMessage?: string;
  };
  expectedResolution: string;
  acceptableAlternatives?: string[];
  minConfidence: number;
  keywords: string[]; // 반드시 포함되어야 하는 키워드
}

export const testCases: ConflictTestCase[] = [
  // ============================================
  // Easy: 단순 값 변경 (Simple Value Changes)
  // ============================================
  {
    id: 'SV001',
    type: 'simple_value',
    language: 'TypeScript',
    difficulty: 'easy',
    description: '타임아웃 값 충돌 - 더 큰 값 선택',
    filePath: 'src/config/api.ts',
    conflict: `<<<<<<< HEAD
const API_TIMEOUT = 5000;
=======
const API_TIMEOUT = 10000;
>>>>>>> feature/improve-stability`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/improve-stability',
      ourCommitMessage: 'Set default timeout',
      theirCommitMessage: 'Increase timeout for stability',
    },
    expectedResolution: `const API_TIMEOUT = 10000;`,
    minConfidence: 85,
    keywords: ['API_TIMEOUT', '10000'],
  },

  {
    id: 'SV002',
    type: 'simple_value',
    language: 'TypeScript',
    difficulty: 'easy',
    description: '버전 번호 충돌',
    filePath: 'package.json',
    conflict: `<<<<<<< HEAD
  "version": "1.2.3",
=======
  "version": "1.3.0",
>>>>>>> release/v1.3`,
    context: {
      ourBranch: 'develop',
      theirBranch: 'release/v1.3',
      ourCommitMessage: 'Patch version bump',
      theirCommitMessage: 'Release version 1.3.0',
    },
    expectedResolution: `  "version": "1.3.0",`,
    minConfidence: 90,
    keywords: ['version', '1.3.0'],
  },

  {
    id: 'SV003',
    type: 'simple_value',
    language: 'JavaScript',
    difficulty: 'easy',
    description: 'Boolean 설정값 충돌 - production 우선',
    filePath: 'src/config/app.js',
    conflict: `<<<<<<< HEAD
const DEBUG_MODE = true;
=======
const DEBUG_MODE = false;
>>>>>>> production`,
    context: {
      ourBranch: 'develop',
      theirBranch: 'production',
      ourCommitMessage: 'Enable debug for testing',
      theirCommitMessage: 'Disable debug for production',
    },
    expectedResolution: `const DEBUG_MODE = false;`,
    minConfidence: 80,
    keywords: ['DEBUG_MODE', 'false'],
  },

  // ============================================
  // Medium: 로직 변경 (Logic Changes)
  // ============================================
  {
    id: 'LC001',
    type: 'logic_change',
    language: 'TypeScript',
    difficulty: 'medium',
    description: '필터 조건 추가 충돌',
    filePath: 'src/utils/data-processor.ts',
    conflict: `<<<<<<< HEAD
function processUsers(users: User[]) {
  return users.map(user => user.name);
}
=======
function processUsers(users: User[]) {
  return users.filter(user => user.active).map(user => user.name);
}
>>>>>>> feature/filter-inactive`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/filter-inactive',
      ourCommitMessage: 'Refactor user processing',
      theirCommitMessage: 'Filter out inactive users',
    },
    expectedResolution: `function processUsers(users: User[]) {
  return users.filter(user => user.active).map(user => user.name);
}`,
    minConfidence: 70,
    keywords: ['processUsers', 'filter', 'active', 'map', 'name'],
  },

  {
    id: 'LC002',
    type: 'logic_change',
    language: 'TypeScript',
    difficulty: 'medium',
    description: '에러 핸들링 방식 충돌',
    filePath: 'src/services/api.service.ts',
    conflict: `<<<<<<< HEAD
async function fetchData(url: string) {
  const response = await fetch(url);
  return response.json();
}
=======
async function fetchData(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(\`HTTP error: \${response.status}\`);
    }
    return response.json();
  } catch (error) {
    console.error('Fetch failed:', error);
    throw error;
  }
}
>>>>>>> feature/error-handling`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/error-handling',
      ourCommitMessage: 'Basic fetch implementation',
      theirCommitMessage: 'Add proper error handling',
    },
    expectedResolution: `async function fetchData(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(\`HTTP error: \${response.status}\`);
    }
    return response.json();
  } catch (error) {
    console.error('Fetch failed:', error);
    throw error;
  }
}`,
    minConfidence: 75,
    keywords: ['fetchData', 'try', 'catch', 'response.ok', 'throw'],
  },

  {
    id: 'LC003',
    type: 'logic_change',
    language: 'Python',
    difficulty: 'medium',
    description: '정렬 로직 충돌',
    filePath: 'utils/sorter.py',
    conflict: `<<<<<<< HEAD
def sort_items(items):
    return sorted(items, key=lambda x: x.name)
=======
def sort_items(items, reverse=False):
    return sorted(items, key=lambda x: x.priority, reverse=reverse)
>>>>>>> feature/priority-sort`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/priority-sort',
      ourCommitMessage: 'Sort by name',
      theirCommitMessage: 'Sort by priority with reverse option',
    },
    expectedResolution: `def sort_items(items, reverse=False):
    return sorted(items, key=lambda x: x.priority, reverse=reverse)`,
    acceptableAlternatives: [
      // 양쪽 기능을 모두 보존하는 대안
      `def sort_items(items, sort_by='priority', reverse=False):
    key_func = lambda x: x.priority if sort_by == 'priority' else x.name
    return sorted(items, key=key_func, reverse=reverse)`,
    ],
    minConfidence: 65,
    keywords: ['sort_items', 'sorted', 'priority'],
  },

  // ============================================
  // Medium-Hard: 구조적 변경 (Structural Changes)
  // ============================================
  {
    id: 'ST001',
    type: 'structural',
    language: 'TypeScript',
    difficulty: 'medium',
    description: 'Import 문 충돌',
    filePath: 'src/components/Dashboard.tsx',
    conflict: `<<<<<<< HEAD
import { useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
=======
import { useState, useEffect } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
>>>>>>> feature/add-modal`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/add-modal',
      ourCommitMessage: 'Add Card component',
      theirCommitMessage: 'Add Modal with useEffect',
    },
    expectedResolution: `import { useState, useEffect } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Modal } from './Modal';`,
    minConfidence: 80,
    keywords: ['useState', 'useEffect', 'Button', 'Card', 'Modal'],
  },

  {
    id: 'ST002',
    type: 'structural',
    language: 'TypeScript',
    difficulty: 'hard',
    description: '인터페이스 속성 추가 충돌',
    filePath: 'src/types/user.ts',
    conflict: `<<<<<<< HEAD
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}
=======
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  lastLoginAt: Date;
}
>>>>>>> feature/user-roles`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/user-roles',
      ourCommitMessage: 'Add createdAt timestamp',
      theirCommitMessage: 'Add user roles and login tracking',
    },
    expectedResolution: `interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
  lastLoginAt: Date;
}`,
    minConfidence: 70,
    keywords: ['User', 'id', 'name', 'email', 'role', 'createdAt', 'lastLoginAt'],
  },

  {
    id: 'ST003',
    type: 'structural',
    language: 'TypeScript',
    difficulty: 'hard',
    description: '클래스 메서드 추가 충돌',
    filePath: 'src/services/calculator.service.ts',
    conflict: `<<<<<<< HEAD
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }
}
=======
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  divide(a: number, b: number): number {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }
}
>>>>>>> feature/division`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/division',
      ourCommitMessage: 'Add multiply method',
      theirCommitMessage: 'Add divide method with zero check',
    },
    expectedResolution: `class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }
}`,
    minConfidence: 65,
    keywords: ['Calculator', 'add', 'subtract', 'multiply', 'divide'],
  },

  // ============================================
  // Hard: 의미적 충돌 (Semantic Conflicts)
  // ============================================
  {
    id: 'SE001',
    type: 'semantic',
    language: 'TypeScript',
    difficulty: 'hard',
    description: '비즈니스 로직 충돌 - 할인 계산 방식',
    filePath: 'src/services/pricing.service.ts',
    conflict: `<<<<<<< HEAD
function calculateDiscount(price: number, memberLevel: string): number {
  const discounts = { gold: 0.2, silver: 0.1, bronze: 0.05 };
  return price * (discounts[memberLevel] || 0);
}
=======
function calculateDiscount(price: number, couponCode: string): number {
  const coupons = { SAVE10: 0.1, SAVE20: 0.2, SAVE30: 0.3 };
  return price * (coupons[couponCode] || 0);
}
>>>>>>> feature/coupon-system`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/coupon-system',
      ourCommitMessage: 'Implement member-level discounts',
      theirCommitMessage: 'Implement coupon-based discounts',
    },
    expectedResolution: `function calculateMemberDiscount(price: number, memberLevel: string): number {
  const discounts: Record<string, number> = { gold: 0.2, silver: 0.1, bronze: 0.05 };
  return price * (discounts[memberLevel] || 0);
}

function calculateCouponDiscount(price: number, couponCode: string): number {
  const coupons: Record<string, number> = { SAVE10: 0.1, SAVE20: 0.2, SAVE30: 0.3 };
  return price * (coupons[couponCode] || 0);
}

function calculateDiscount(
  price: number,
  memberLevel?: string,
  couponCode?: string
): number {
  const memberDiscount = memberLevel ? calculateMemberDiscount(price, memberLevel) : 0;
  const couponDiscount = couponCode ? calculateCouponDiscount(price, couponCode) : 0;
  return Math.max(memberDiscount, couponDiscount);
}`,
    acceptableAlternatives: [
      // 단순히 두 기능을 분리만 한 경우도 허용
      `function calculateMemberDiscount(price: number, memberLevel: string): number {
  const discounts: Record<string, number> = { gold: 0.2, silver: 0.1, bronze: 0.05 };
  return price * (discounts[memberLevel] || 0);
}

function calculateCouponDiscount(price: number, couponCode: string): number {
  const coupons: Record<string, number> = { SAVE10: 0.1, SAVE20: 0.2, SAVE30: 0.3 };
  return price * (coupons[couponCode] || 0);
}`,
    ],
    minConfidence: 40, // 의미적 충돌은 낮은 신뢰도 예상
    keywords: ['calculateDiscount', 'price'],
  },

  {
    id: 'SE002',
    type: 'semantic',
    language: 'JavaScript',
    difficulty: 'hard',
    description: '데이터 검증 로직 충돌',
    filePath: 'src/validators/user.validator.js',
    conflict: `<<<<<<< HEAD
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}
=======
function validateEmail(email) {
  // RFC 5322 compliant regex
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return regex.test(email);
}
>>>>>>> feature/strict-validation`,
    context: {
      ourBranch: 'main',
      theirBranch: 'feature/strict-validation',
      ourCommitMessage: 'Basic email validation',
      theirCommitMessage: 'RFC 5322 compliant email validation',
    },
    expectedResolution: `function validateEmail(email) {
  // RFC 5322 compliant regex
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return regex.test(email);
}`,
    minConfidence: 70,
    keywords: ['validateEmail', 'regex', 'test'],
  },

  // ============================================
  // Edge Cases
  // ============================================
  {
    id: 'EC001',
    type: 'simple_value',
    language: 'JSON',
    difficulty: 'easy',
    description: 'JSON 객체 속성 충돌',
    filePath: 'config/settings.json',
    conflict: `<<<<<<< HEAD
{
  "maxRetries": 3,
  "timeout": 5000,
  "logLevel": "info"
}
=======
{
  "maxRetries": 5,
  "timeout": 5000,
  "logLevel": "debug"
}
>>>>>>> feature/increase-retries`,
    expectedResolution: `{
  "maxRetries": 5,
  "timeout": 5000,
  "logLevel": "debug"
}`,
    acceptableAlternatives: [
      `{
  "maxRetries": 5,
  "timeout": 5000,
  "logLevel": "info"
}`,
    ],
    minConfidence: 75,
    keywords: ['maxRetries', 'timeout', 'logLevel'],
  },

  {
    id: 'EC002',
    type: 'structural',
    language: 'CSS',
    difficulty: 'medium',
    description: 'CSS 스타일 충돌',
    filePath: 'src/styles/button.css',
    conflict: `<<<<<<< HEAD
.button {
  padding: 10px 20px;
  background-color: blue;
  color: white;
  border-radius: 4px;
}
=======
.button {
  padding: 12px 24px;
  background-color: blue;
  color: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
>>>>>>> feature/button-redesign`,
    expectedResolution: `.button {
  padding: 12px 24px;
  background-color: blue;
  color: white;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}`,
    minConfidence: 70,
    keywords: ['.button', 'padding', 'background-color', 'border-radius', 'box-shadow'],
  },
];

// 테스트 케이스 통계
export const testCaseStats = {
  total: testCases.length,
  byType: {
    simple_value: testCases.filter(tc => tc.type === 'simple_value').length,
    logic_change: testCases.filter(tc => tc.type === 'logic_change').length,
    structural: testCases.filter(tc => tc.type === 'structural').length,
    semantic: testCases.filter(tc => tc.type === 'semantic').length,
  },
  byDifficulty: {
    easy: testCases.filter(tc => tc.difficulty === 'easy').length,
    medium: testCases.filter(tc => tc.difficulty === 'medium').length,
    hard: testCases.filter(tc => tc.difficulty === 'hard').length,
  },
  byLanguage: testCases.reduce((acc, tc) => {
    acc[tc.language] = (acc[tc.language] || 0) + 1;
    return acc;
  }, {} as Record<string, number>),
};