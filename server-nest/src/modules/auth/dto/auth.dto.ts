import { IsString, MinLength, Matches, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, { message: '账号只能包含字母、数字和下划线，长度 3-32 位' })
  username: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'staff01' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, { message: '账号只能包含字母、数字和下划线，长度 3-32 位' })
  username: string;

  @ApiProperty({ example: '新员工' })
  @IsString()
  @MaxLength(100)
  displayName: string;

  @ApiProperty({ example: 'mypassword' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}

export class LoginResponseDto {
  @ApiProperty()
  token: string;

  @ApiProperty()
  user: Record<string, any>;
}
