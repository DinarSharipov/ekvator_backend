import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post("login")
  @ApiOperation({ summary: "Авторизироваться в системе" })
  @ApiResponse({ status: 201, description: "Вы успешно авторизировались" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        login: { type: "string" },
        password: { type: "string" },
      },
      required: ["login", "password"],
    },
  })
  signIn(@Body() signInDto: { login: string; password: string }) {
    return this.authService.signIn(signInDto.login, signInDto.password);
  }
}

