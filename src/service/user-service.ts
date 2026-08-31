import {
  LoginUserRequest,
  toUserResponse,
  UpdateUserRequest,
  UserResponse,
} from "../model/user-model";
import { Validation } from "../validation/validation";
import { UserValidation } from "../validation/user-validation";
import { prismaClient } from "../application/database";
import { ResponseError } from "../error/response-error";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET_KEY } from "../application/config";

export class UserService {
  static async login(request: LoginUserRequest): Promise<UserResponse> {
    const loginRequest = Validation.validate(UserValidation.LOGIN, request);

    let user = await prismaClient.user.findUnique({
      where: {
        username: loginRequest.username,
      },
      include: {
        operator: true,
      },
    });

    if (!user) {
      throw new ResponseError(401, "Username or password is wrong");
    }

    const isPasswordValid = await bcrypt.compare(
      loginRequest.password,
      user.password
    );
    if (!isPasswordValid) {
      throw new ResponseError(401, "Username or password is wrong");
    }

    const token = jwt.sign(
      {
        username: user.username,
        userId: user.id,
        role: user.role,
        operatorId: user.operator?.id || null,
      },
      JWT_SECRET_KEY
    );

    const response = toUserResponse(user);
    response.token = token;
    return response;
  }

  static async get(username: string): Promise<UserResponse> {
    const user = await prismaClient.user.findUnique({
      where: {
        username: username,
      },
      include: {
        operator: true,
      },
    });

    if (!user) {
      throw new ResponseError(404, "User not found");
    }

    return toUserResponse(user);
  }

  static async update(
    username: string,
    request: { name?: string; current_password?: string; new_password?: string }
  ): Promise<UserResponse> {
    const user = await prismaClient.user.findUnique({
      where: { username },
      include: { operator: true },
    });

    if (!user) {
      throw new ResponseError(404, "User not found");
    }

    const updateData: { name?: string; password?: string } = {};

    if (request.name && request.name.trim() !== "") {
      updateData.name = request.name.trim();
    }

    if (request.new_password && request.new_password.trim() !== "") {
      if (!request.current_password) {
        throw new ResponseError(400, "Password saat ini wajib diisi untuk mengubah password");
      }
      const isPasswordValid = await bcrypt.compare(request.current_password, user.password);
      if (!isPasswordValid) {
        throw new ResponseError(400, "Password saat ini tidak sesuai");
      }
      if (request.new_password.length < 5) {
        throw new ResponseError(400, "Password baru minimal 5 karakter");
      }
      updateData.password = await bcrypt.hash(request.new_password, 10);
    }

    const updatedUser = await prismaClient.user.update({
      where: { username },
      data: updateData,
      include: { operator: true },
    });

    return toUserResponse(updatedUser);
  }
}
