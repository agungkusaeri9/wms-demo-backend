import { Request, Response, NextFunction } from "express";
import { LoginUserRequest, UpdateUserRequest } from "../model/user-model";
import { UserService } from "../service/user-service";
import { UserRequest } from "../type/user-request";
import { sendSuccess } from "../helper/response-helper";

export class UserController {

    static async login(req: Request, res: Response, next: NextFunction) {
        try {
            const request: LoginUserRequest = req.body as LoginUserRequest;
            const response = await UserService.login(request);
            sendSuccess(res, 200, "Login success", response);
        } catch (e) {
            next(e);
        }
    }

    static async get(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const response = await UserService.get(req.username!);
            sendSuccess(res, 200, "Get current user success", response);

        } catch (e) {
            next(e);
        }
    }

    static async update(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const response = await UserService.update(req.username!, req.body);
            sendSuccess(res, 200, "Update profile & password success", response);
        } catch (e) {
            next(e);
        }
    }
}
