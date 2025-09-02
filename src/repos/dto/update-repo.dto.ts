import { PartialType } from "@nestjs/mapped-types";
import { CreateRepoDto } from "@src/repos/dto/create-repo.dto";

export class UpdateRepoDto extends PartialType(CreateRepoDto) {}
