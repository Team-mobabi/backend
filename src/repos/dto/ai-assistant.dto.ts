import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AskQuestionDto {
  @ApiProperty({
    description: "Git에 대한 질문",
    example: "브랜치가 뭔가요?",
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  question: string;
}

export class AIAssistantResponseDto {
  @ApiProperty({
    description: "성공 여부",
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: "질문에 대한 상세한 답변",
    example:
      "브랜치(branch)는 독립적인 작업 공간입니다. 마치 평행 세계처럼, 메인 코드에 영향을 주지 않고 새로운 기능을 개발할 수 있어요...",
  })
  answer: string;

  @ApiProperty({
    description: "다음에 할 수 있는 구체적인 행동들",
    type: [String],
    required: false,
    example: ["새 브랜치 만들기", "브랜치 전환하기", "브랜치 병합하기"],
  })
  suggestedActions?: string[];

  @ApiProperty({
    description: "관련된 Git 개념들",
    type: [String],
    required: false,
    example: ["커밋", "병합", "충돌 해결"],
  })
  relatedConcepts?: string[];
}